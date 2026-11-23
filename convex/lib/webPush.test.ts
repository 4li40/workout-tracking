import { describe, expect, it } from "vitest";
import {
  createVapidAuthorizationHeader,
  encryptWebPushPayload,
  sendWebPushMessage,
} from "./webPush";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function concatBytes(
  ...chunks: ReadonlyArray<Uint8Array>
): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function hmacSha256(
  keyBytes: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return new Uint8Array(signature);
}

async function hkdfExpandSingleBlock(
  prk: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const block = await hmacSha256(
    prk,
    concatBytes(info, new Uint8Array([0x01])),
  );
  return block.slice(0, length);
}

async function generateVapidKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const rawPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  return {
    publicKey: base64UrlEncode(rawPublic),
    privateKey: jwk.d!,
    verifyKey: keyPair.publicKey,
  };
}

async function generateSubscriberKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const rawPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  const authSecret = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(authSecret);
  return {
    p256dh: base64UrlEncode(rawPublic),
    auth: base64UrlEncode(authSecret),
    privateKey: keyPair.privateKey,
    publicKeyBytes: rawPublic,
    authSecret,
  };
}

async function decryptAes128GcmPayload(
  encrypted: Uint8Array,
  subscriber: Awaited<ReturnType<typeof generateSubscriberKeys>>,
): Promise<string> {
  const salt = encrypted.slice(0, 16);
  const view = new DataView(
    encrypted.buffer,
    encrypted.byteOffset,
    encrypted.byteLength,
  );
  const recordSize = view.getUint32(16, false);
  expect(recordSize).toBeGreaterThanOrEqual(18);
  const keyIdLen = encrypted[20];
  expect(keyIdLen).toBe(65);
  const serverPublicKeyBytes = encrypted.slice(21, 21 + keyIdLen);
  const ciphertext = encrypted.slice(21 + keyIdLen);

  const serverPublicKey = await crypto.subtle.importKey(
    "raw",
    serverPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: serverPublicKey },
      subscriber.privateKey,
      256,
    ),
  );

  const encoder = new TextEncoder();
  const prkKey = await hmacSha256(subscriber.authSecret, ecdhSecret);
  const keyInfo = concatBytes(
    encoder.encode("WebPush: info\0"),
    subscriber.publicKeyBytes,
    serverPublicKeyBytes,
  );
  const ikm = await hkdfExpandSingleBlock(prkKey, keyInfo, 32);

  const prk = await hmacSha256(salt, ikm);
  const cek = await hkdfExpandSingleBlock(
    prk,
    encoder.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdfExpandSingleBlock(
    prk,
    encoder.encode("Content-Encoding: nonce\0"),
    12,
  );

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
    "decrypt",
  ]);
  const paddedPlaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      ciphertext,
    ),
  );

  // RFC 8188 final record padding ends with 0x02 delimiter followed by optional 0x00 bytes
  let end = paddedPlaintext.length - 1;
  while (end >= 0 && paddedPlaintext[end] === 0) {
    end -= 1;
  }
  expect(paddedPlaintext[end]).toBe(0x02);
  return new TextDecoder().decode(paddedPlaintext.slice(0, end));
}

describe("Web Push VAPID + RFC 8291 (aes128gcm)", () => {
  it("creates a valid ES256 VAPID Authorization header verifiable with P-256", async () => {
    const vapid = await generateVapidKeys();
    const header = await createVapidAuthorizationHeader({
      endpoint: "https://push.example.com/v2/sub/abc123",
      subject: "mailto:alerts@example.com",
      vapidPublicKey: vapid.publicKey,
      vapidPrivateKey: vapid.privateKey,
      nowMs: 1_700_000_000_000,
      ttlSeconds: 3600,
    });

    expect(header.startsWith("vapid t=")).toBe(true);
    const match = /^vapid t=([^,]+),\s*k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const jwt = match![1];
    const keyPart = match![2];
    expect(keyPart).toBe(vapid.publicKey);

    const [encodedHeader, encodedPayload, encodedSig] = jwt.split(".");
    expect(encodedHeader).toBeDefined();
    expect(encodedPayload).toBeDefined();
    expect(encodedSig).toBeDefined();

    const parsedHeader = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedHeader)),
    ) as { alg: string; typ: string };
    expect(parsedHeader).toEqual({ alg: "ES256", typ: "JWT" });

    const parsedPayload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedPayload)),
    ) as { aud: string; exp: number; sub: string };
    expect(parsedPayload).toEqual({
      aud: "https://push.example.com",
      exp: 1_700_003_600,
      sub: "mailto:alerts@example.com",
    });

    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      vapid.verifyKey,
      base64UrlDecode(encodedSig),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    expect(verified).toBe(true);
  });

  it("encrypts payloads per RFC 8291 aes128gcm so the subscriber can decrypt them", async () => {
    const subscriber = await generateSubscriberKeys();
    const payload = JSON.stringify({
      title: "Rest complete",
      body: "Push Day — ready for your next set.",
      tag: "rest-timer",
      url: "/workouts/w123",
    });

    const encrypted = await encryptWebPushPayload({
      p256dh: subscriber.p256dh,
      auth: subscriber.auth,
      payload,
    });

    expect(encrypted.byteLength).toBeGreaterThan(86);
    const decrypted = await decryptAes128GcmPayload(encrypted, subscriber);
    expect(decrypted).toBe(payload);
  });

  it("sends encrypted push requests and flags 404/410 subscriptions as gone", async () => {
    const vapid = await generateVapidKeys();
    const subscriber = await generateSubscriberKeys();
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const okFetch: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(null, { status: 201 });
    };

    const okResult = await sendWebPushMessage({
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        p256dh: subscriber.p256dh,
        auth: subscriber.auth,
      },
      payload: JSON.stringify({ title: "Rest complete" }),
      vapidPublicKey: vapid.publicKey,
      vapidPrivateKey: vapid.privateKey,
      vapidSubject: "mailto:alerts@example.com",
      ttlSeconds: 60,
      fetchImpl: okFetch,
    });

    expect(okResult).toEqual({ status: 201, ok: true, gone: false });
    expect(calls).toHaveLength(1);
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(headers.get("Content-Type")).toBe("application/octet-stream");
    expect(headers.get("TTL")).toBe("60");
    expect(headers.get("Urgency")).toBe("high");
    expect(headers.get("Authorization")).toMatch(/^vapid t=/);

    const gone410 = await sendWebPushMessage({
      subscription: {
        endpoint: "https://web.push.apple.com/Qxyz",
        p256dh: subscriber.p256dh,
        auth: subscriber.auth,
      },
      payload: JSON.stringify({ title: "Rest complete" }),
      vapidPublicKey: vapid.publicKey,
      vapidPrivateKey: vapid.privateKey,
      vapidSubject: "mailto:alerts@example.com",
      fetchImpl: async () => new Response(null, { status: 410 }),
    });
    expect(gone410).toEqual({ status: 410, ok: false, gone: true });

    const gone404 = await sendWebPushMessage({
      subscription: {
        endpoint: "https://web.push.apple.com/Q404",
        p256dh: subscriber.p256dh,
        auth: subscriber.auth,
      },
      payload: JSON.stringify({ title: "Rest complete" }),
      vapidPublicKey: vapid.publicKey,
      vapidPrivateKey: vapid.privateKey,
      vapidSubject: "mailto:alerts@example.com",
      fetchImpl: async () => new Response(null, { status: 404 }),
    });
    expect(gone404).toEqual({ status: 404, ok: false, gone: true });
  });
});

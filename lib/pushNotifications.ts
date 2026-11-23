export type PushCapability =
  | { readonly kind: "unsupported"; readonly reason: string }
  | { readonly kind: "ios_install_required" }
  | { readonly kind: "ready"; readonly permission: NotificationPermission };

interface NavigatorWithStandalone extends Navigator {
  readonly standalone?: boolean;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    return true;
  }
  return (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  );
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const nav = navigator as NavigatorWithStandalone;
  if (nav.standalone === true) {
    return true;
  }
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export function getPushCapability(): PushCapability {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      kind: "unsupported",
      reason: "Push notifications are only available in the browser.",
    };
  }

  if (isIosDevice() && !isStandalonePwa()) {
    return { kind: "ios_install_required" };
  }

  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    typeof Notification === "undefined"
  ) {
    return {
      kind: "unsupported",
      reason:
        "This browser does not support Web Push notifications. Use a modern mobile or desktop browser.",
    };
  }

  return {
    kind: "ready",
    permission: Notification.permission,
  };
}

export function urlBase64ToUint8Array(
  base64UrlString: string,
): Uint8Array<ArrayBuffer> {
  const normalized = base64UrlString
    .trim()
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (buffer === null) {
    return "";
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
  });
  await navigator.serviceWorker.ready;
  return registration;
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (registration === undefined) {
    return null;
  }
  return await registration.pushManager.getSubscription();
}

export interface SerializedPushSubscription {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly userAgent: string;
}

export async function subscribeToPushNotifications(
  vapidPublicKey: string,
): Promise<SerializedPushSubscription> {
  const capability = getPushCapability();
  if (capability.kind === "ios_install_required") {
    throw new Error(
      "On iPhone and iPad, add this app to your Home Screen first (Share -> Add to Home Screen) to enable lock-screen alerts.",
    );
  }
  if (capability.kind === "unsupported") {
    throw new Error(capability.reason);
  }

  let permission = capability.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    throw new Error(
      "Notification permission was denied. Allow notifications in your browser or system settings to receive rest alerts.",
    );
  }

  const registration = await registerPushServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const p256dh = arrayBufferToBase64Url(subscription.getKey("p256dh"));
  const auth = arrayBufferToBase64Url(subscription.getKey("auth"));
  if (p256dh.length === 0 || auth.length === 0) {
    throw new Error("Browser returned an incomplete push subscription.");
  }

  return {
    endpoint: subscription.endpoint,
    p256dh,
    auth,
    userAgent: navigator.userAgent,
  };
}

export async function unsubscribeFromPushNotifications(): Promise<
  string | null
> {
  const existing = await getExistingPushSubscription();
  if (existing === null) {
    return null;
  }
  const endpoint = existing.endpoint;
  await existing.unsubscribe();
  return endpoint;
}

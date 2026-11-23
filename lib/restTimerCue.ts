const REST_SOUND_STORAGE_KEY = "workout-tracker:rest-sound:v1";
const CLOCK_OFFSET_STORAGE_KEY = "workout-tracker:clock-offset-ms:v1";
const ALERTED_ENDS_AT_STORAGE_KEY = "workout-tracker:alerted-rest-ends-at:v1";
const MAX_DELAYED_CHIME_MS = 500;

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

let sharedAudioContext: AudioContext | null = null;
let cachedClockOffsetMs: number | null = null;
let lastAlertedEndsAtCache: number | null = null;

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function recordServerClockSample(
  serverNowMs: number,
  clientNowMs: number = Date.now(),
): void {
  if (!Number.isFinite(serverNowMs) || !Number.isFinite(clientNowMs)) {
    return;
  }
  const offset = Math.round(serverNowMs - clientNowMs);
  cachedClockOffsetMs = offset;
  const storage = getSessionStorage();
  if (storage !== null) {
    try {
      storage.setItem(CLOCK_OFFSET_STORAGE_KEY, String(offset));
    } catch {
      return;
    }
  }
}

function getServerClockOffsetMs(): number {
  if (cachedClockOffsetMs !== null) {
    return cachedClockOffsetMs;
  }
  const storage = getSessionStorage();
  if (storage !== null) {
    try {
      const raw = storage.getItem(CLOCK_OFFSET_STORAGE_KEY);
      if (raw !== null) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
          cachedClockOffsetMs = parsed;
          return parsed;
        }
      }
    } catch {
      return 0;
    }
  }
  return 0;
}

export function getEstimatedServerNowMs(): number {
  return Date.now() + getServerClockOffsetMs();
}

export function hasAlertedRestTimer(endsAt: number): boolean {
  if (lastAlertedEndsAtCache === endsAt) {
    return true;
  }
  const storage = getSessionStorage();
  if (storage !== null) {
    try {
      const raw = storage.getItem(ALERTED_ENDS_AT_STORAGE_KEY);
      if (raw !== null && Number(raw) === endsAt) {
        lastAlertedEndsAtCache = endsAt;
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

export function markRestTimerAlerted(endsAt: number): void {
  lastAlertedEndsAtCache = endsAt;
  const storage = getSessionStorage();
  if (storage !== null) {
    try {
      storage.setItem(ALERTED_ENDS_AT_STORAGE_KEY, String(endsAt));
    } catch {
      return;
    }
  }
}

function isAudioContextPaused(ctx: AudioContext): boolean {
  const state: string = ctx.state;
  return state === "suspended" || state === "interrupted";
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as WindowWithWebkitAudio).webkitAudioContext;
    if (AudioContextClass === undefined) {
      return null;
    }
    if (sharedAudioContext === null || sharedAudioContext.state === "closed") {
      sharedAudioContext = new AudioContextClass();
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

export function readRestSoundEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    const value = window.localStorage.getItem(REST_SOUND_STORAGE_KEY);
    return value !== "false";
  } catch {
    return true;
  }
}

export function writeRestSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      REST_SOUND_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    return;
  }
}

export function primeRestTimerAudio(): void {
  const ctx = getAudioContext();
  if (ctx === null) {
    return;
  }
  try {
    if (isAudioContextPaused(ctx)) {
      void ctx.resume().catch(() => {});
    }
  } catch {
    return;
  }
}

function playTwoToneChime(ctx: AudioContext): void {
  const startAt = ctx.currentTime;
  const tones: ReadonlyArray<{
    readonly frequency: number;
    readonly offsetSeconds: number;
    readonly durationSeconds: number;
  }> = [
    { frequency: 880, offsetSeconds: 0, durationSeconds: 0.14 },
    { frequency: 1174.66, offsetSeconds: 0.16, durationSeconds: 0.2 },
  ];

  for (const tone of tones) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const begin = startAt + tone.offsetSeconds;
    const end = begin + tone.durationSeconds;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(tone.frequency, begin);

    gainNode.gain.setValueAtTime(0.001, begin);
    gainNode.gain.exponentialRampToValueAtTime(0.14, begin + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, end);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(begin);
    oscillator.stop(end + 0.01);
  }
}

export function triggerRestTimerCompletionCue(soundEnabled: boolean): void {
  if (soundEnabled) {
    try {
      const ctx = getAudioContext();
      if (ctx !== null) {
        if (isAudioContextPaused(ctx)) {
          const triggeredAt = Date.now();
          void ctx
            .resume()
            .then(() => {
              if (
                Date.now() - triggeredAt <= MAX_DELAYED_CHIME_MS &&
                ctx.state === "running"
              ) {
                playTwoToneChime(ctx);
              }
            })
            .catch(() => {});
        } else if (ctx.state === "running") {
          playTwoToneChime(ctx);
        }
      }
    } catch {
      void 0;
    }
  }

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate([180, 90, 180]);
    }
  } catch {
    return;
  }
}

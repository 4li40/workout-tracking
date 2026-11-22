const REST_SOUND_STORAGE_KEY = "workout-tracker:rest-sound:v1";

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

let sharedAudioContext: AudioContext | null = null;

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
    if (sharedAudioContext === null) {
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
    if (ctx.state === "suspended") {
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
        if (ctx.state === "suspended") {
          void ctx
            .resume()
            .then(() => {
              playTwoToneChime(ctx);
            })
            .catch(() => {});
        } else {
          playTwoToneChime(ctx);
        }
      }
    } catch {
      return;
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

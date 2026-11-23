"use client";

import { useEffect } from "react";

export function isWakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

export function useScreenWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !isWakeLockSupported()) {
      return;
    }

    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    const releaseSentinel = async () => {
      const current = sentinel;
      sentinel = null;
      if (current !== null && !current.released) {
        try {
          await current.release();
        } catch {
          return;
        }
      }
    };

    const requestLock = async () => {
      if (
        cancelled ||
        document.visibilityState !== "visible" ||
        (sentinel !== null && !sentinel.released)
      ) {
        return;
      }
      try {
        const acquired = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await acquired.release().catch(() => {});
          return;
        }
        sentinel = acquired;
        acquired.addEventListener(
          "release",
          () => {
            if (sentinel === acquired) {
              sentinel = null;
            }
          },
          { once: true },
        );
      } catch {
        sentinel = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestLock();
      }
    };

    void requestLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseSentinel();
    };
  }, [enabled]);
}

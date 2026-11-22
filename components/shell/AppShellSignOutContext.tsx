"use client";

import { createContext, useContext } from "react";

export interface AppShellSignOutContextValue {
  readonly signOut: () => void;
  readonly signingOut: boolean;
  readonly signOutError: string | null;
}

export const AppShellSignOutContext =
  createContext<AppShellSignOutContextValue | null>(null);

export function useAppShellSignOut(): AppShellSignOutContextValue {
  const value = useContext(AppShellSignOutContext);
  if (value === null) {
    throw new Error("useAppShellSignOut must be used within AppShell.");
  }
  return value;
}

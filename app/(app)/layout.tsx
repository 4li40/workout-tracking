import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AppShellErrorBoundary } from "@/components/shell/AppShellErrorBoundary";

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <AppShellErrorBoundary>
      <AppShell>{children}</AppShell>
    </AppShellErrorBoundary>
  );
}

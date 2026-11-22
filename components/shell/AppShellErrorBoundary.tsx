"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { Component, type ReactNode, useEffect, useRef } from "react";
import { isUnauthenticatedConvexError } from "@/lib/convexError";

function UnauthenticatedErrorFallback() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) {
      return;
    }
    handledRef.current = true;
    void signOut().finally(() => {
      router.replace("/signin");
    });
  }, [signOut, router]);

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <p className="text-sm font-medium text-ink-muted">
        Redirecting to sign in...
      </p>
    </div>
  );
}

interface AppShellErrorBoundaryProps {
  readonly children: ReactNode;
}

interface AppShellErrorBoundaryState {
  readonly error: unknown | null;
}

export class AppShellErrorBoundary extends Component<
  AppShellErrorBoundaryProps,
  AppShellErrorBoundaryState
> {
  state: AppShellErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppShellErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown) {
    if (!isUnauthenticatedConvexError(error)) {
      console.error(error);
    }
  }

  render() {
    if (this.state.error !== null) {
      if (isUnauthenticatedConvexError(this.state.error)) {
        return <UnauthenticatedErrorFallback />;
      }

      return (
        <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-ink">
                Something went wrong
              </h1>
              <p className="text-sm text-ink-muted">
                We could not load this view. Try again to reload your session.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
              }}
              className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover cursor-pointer"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

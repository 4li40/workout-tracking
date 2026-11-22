"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { Component, type ReactNode, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <p className="text-sm font-medium text-muted-foreground">
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
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <Card className="w-full max-w-md shadow-sm">
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1">
                <h1 className="text-lg font-semibold text-foreground">
                  Something went wrong
                </h1>
                <p className="text-sm text-muted-foreground">
                  We could not load this view. Try again to reload your session.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => {
                  this.setState({ error: null });
                }}
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

"use client";

import { ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getConvexErrorCode } from "@/lib/convexError";

interface TemplateRouteErrorBoundaryProps {
  readonly children: ReactNode;
}

interface TemplateRouteErrorBoundaryState {
  readonly error: unknown | null;
}

export class TemplateRouteErrorBoundary extends Component<
  TemplateRouteErrorBoundaryProps,
  TemplateRouteErrorBoundaryState
> {
  state: TemplateRouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(
    error: unknown,
  ): TemplateRouteErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error !== null) {
      if (getConvexErrorCode(this.state.error) === "FORBIDDEN") {
        return (
          <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
            <Card>
              <CardContent className="p-6 sm:p-8 space-y-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive-tint text-destructive">
                  <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <h1 className="text-lg font-semibold text-foreground">
                    You do not have access to this routine
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    This workout template belongs to another account or is not
                    available to you.
                  </p>
                </div>
                <div>
                  <Button asChild>
                    <Link href="/templates">
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      <span>Back to Routines</span>
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      }

      throw this.state.error;
    }

    return this.props.children;
  }
}

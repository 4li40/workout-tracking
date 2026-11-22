"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const router = useRouter();

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Workout Tracker
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Backend schema, auth guard, and exercise library foundation are ready.
        </p>
        {!isLoading && isAuthenticated && (
          <button
            type="button"
            className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 cursor-pointer"
            onClick={() => {
              void signOut().then(() => {
                router.push("/signin");
              });
            }}
          >
            Sign out
          </button>
        )}
      </div>
    </main>
  );
}

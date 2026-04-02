"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-le-red/10 border border-le-red/20">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-7 w-7 text-le-red"
          >
            <path
              d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-le-text">
          Failed to load dashboard
        </h2>
        <p className="mt-2 text-sm text-le-muted">
          There was a problem loading your dashboard. This might be a temporary
          issue.
        </p>
        <button
          onClick={reset}
          className="mt-5 rounded-lg bg-le-accent px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

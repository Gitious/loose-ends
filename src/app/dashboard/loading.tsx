export default function DashboardLoading() {
  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4 py-6">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-le-elevated" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded-md bg-le-elevated/60" />
      </div>

      {/* Chat panel skeleton */}
      <div className="min-h-0 flex-1 rounded-2xl border border-le-border/30 bg-le-surface/40 backdrop-blur-sm flex flex-col overflow-hidden">
        <div className="flex-1 space-y-5 p-5">
          {/* Agent message skeleton */}
          <div className="flex items-start gap-3">
            <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-le-elevated" />
            <div className="space-y-2">
              <div className="h-4 w-64 animate-pulse rounded-md bg-le-elevated" />
              <div className="h-4 w-48 animate-pulse rounded-md bg-le-elevated/60" />
            </div>
          </div>
        </div>

        {/* Input skeleton */}
        <div className="flex items-center gap-3 border-t border-le-border/30 bg-le-surface/30 p-3">
          <div className="h-10 flex-1 animate-pulse rounded-xl bg-le-void/50 border border-le-border/30" />
          <div className="h-10 w-10 animate-pulse rounded-xl bg-le-elevated" />
        </div>
      </div>
    </div>
  );
}

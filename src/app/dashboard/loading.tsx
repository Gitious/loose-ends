export default function DashboardLoading() {
  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-6xl flex-col px-6 py-6">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-le-elevated" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded-md bg-le-elevated/60" />
      </div>

      {/* Service tiles 2x2 grid skeleton */}
      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-5 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-le-border/30 bg-le-surface/40 p-5 backdrop-blur-sm"
            >
              {/* Service icon + title */}
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 animate-pulse rounded-xl bg-le-elevated" />
                <div>
                  <div className="h-4 w-20 animate-pulse rounded-md bg-le-elevated" />
                  <div className="mt-1.5 h-3 w-28 animate-pulse rounded-md bg-le-elevated/60" />
                </div>
              </div>

              {/* Item previews */}
              <div className="mt-4 space-y-2.5">
                <div className="h-3 w-full animate-pulse rounded bg-le-elevated/50" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-le-elevated/40" />
                <div className="h-3 w-3/5 animate-pulse rounded bg-le-elevated/30" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

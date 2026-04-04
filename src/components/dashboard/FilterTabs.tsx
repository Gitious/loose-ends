"use client";

type FilterType = "all" | "email" | "github" | "calendar" | "slack";

const TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "email", label: "Gmail" },
  { key: "calendar", label: "Calendar" },
  { key: "github", label: "GitHub" },
  { key: "slack", label: "Slack" },
];

export default function FilterTabs({
  active,
  onChange,
  counts,
  urgentCounts,
}: {
  active: FilterType;
  onChange: (f: FilterType) => void;
  counts: Record<FilterType, number>;
  urgentCounts?: Record<FilterType, number>;
}) {
  return (
    <div className="mt-5 rounded-xl bg-le-surface/40 p-1 flex gap-0.5">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const count = counts[tab.key] || 0;
        const hasUrgent = (urgentCounts?.[tab.key] ?? 0) > 0;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-150 ${
              isActive
                ? "bg-le-elevated text-le-text shadow-sm"
                : "text-le-muted hover:text-le-text"
            }`}
          >
            {tab.label}
            {count > 0 && (
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-medium ${
                  hasUrgent && !isActive
                    ? "bg-le-red/15 text-le-red"
                    : isActive
                      ? "bg-le-accent/15 text-le-accent"
                      : "bg-le-elevated text-le-muted"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

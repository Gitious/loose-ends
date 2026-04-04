"use client";

type FilterType = "all" | "email" | "github" | "calendar" | "slack";

const TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "email", label: "Gmail" },
  { key: "github", label: "GitHub" },
  { key: "calendar", label: "Calendar" },
  { key: "slack", label: "Slack" },
];

export default function FilterTabs({
  active,
  onChange,
  counts,
}: {
  active: FilterType;
  onChange: (f: FilterType) => void;
  counts: Record<FilterType, number>;
}) {
  return (
    <div className="mt-5 flex gap-1 border-b border-le-border/30 pb-px">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const count = counts[tab.key] || 0;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "text-le-accent"
                : "text-le-muted hover:text-le-text"
            }`}
          >
            {tab.label}
            {count > 0 && (
              <span
                className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-medium ${
                  isActive
                    ? "bg-le-accent/15 text-le-accent"
                    : "bg-le-elevated text-le-muted"
                }`}
              >
                {count}
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-le-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}

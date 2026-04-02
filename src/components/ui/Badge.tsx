import type { UrgencyLevel } from "@/lib/types";

const config: Record<
  UrgencyLevel,
  { label: string; dot: string; classes: string }
> = {
  red: {
    label: "Urgent",
    dot: "bg-le-red",
    classes: "bg-le-red/10 text-le-red border-le-red/25",
  },
  yellow: {
    label: "Attention",
    dot: "bg-le-yellow",
    classes: "bg-le-yellow/10 text-le-yellow border-le-yellow/25",
  },
  green: {
    label: "Low",
    dot: "bg-le-green",
    classes: "bg-le-green/10 text-le-green border-le-green/25",
  },
};

export default function Badge({ urgency }: { urgency: UrgencyLevel }) {
  const { label, dot, classes } = config[urgency];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${classes}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

import type { UrgencyLevel } from "@/lib/types";

const config: Record<
  UrgencyLevel,
  { label: string; classes: string }
> = {
  red: {
    label: "Urgent",
    classes: "bg-le-red/15 text-le-red border-le-red/30",
  },
  yellow: {
    label: "Attention",
    classes: "bg-le-yellow/15 text-le-yellow border-le-yellow/30",
  },
  green: {
    label: "Low",
    classes: "bg-le-green/15 text-le-green border-le-green/30",
  },
};

export default function Badge({ urgency }: { urgency: UrgencyLevel }) {
  const { label, classes } = config[urgency];
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes}`}
    >
      {label}
    </span>
  );
}

export type UrgencyLevel = "red" | "yellow" | "green";

export interface LooseEnd {
  id: string;
  type: "email" | "calendar" | "github";
  title: string;
  description: string;
  urgency: UrgencyLevel;
  age: string;
  source: string;
  actionLabel: string;
  meta: Record<string, string>;
}

// -- Shared urgency / age helpers used by tool scanners --

export function getUrgencyByAge(daysOld: number): UrgencyLevel {
  if (daysOld > 7) return "red";
  if (daysOld > 3) return "yellow";
  return "green";
}

export function formatAge(daysOld: number): string {
  if (daysOld === 0) return "today";
  if (daysOld === 1) return "1 day ago";
  return `${daysOld} days ago`;
}

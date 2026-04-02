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

export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  service: "gmail" | "calendar" | "github";
  status: "pending" | "approved" | "denied" | "completed" | "failed";
  details: string;
}

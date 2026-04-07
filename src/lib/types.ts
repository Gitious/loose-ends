export type UrgencyLevel = "red" | "yellow" | "green";

export interface LooseEndAction {
  id: string;        // "reply", "approve", "comment", "open", "dismiss"
  label: string;     // "Draft Reply", "Approve PR"
  variant: "primary" | "secondary" | "ghost";
}

export interface LooseEnd {
  id: string;
  type: "email" | "calendar" | "github" | "slack";
  title: string;
  description: string;
  urgency: UrgencyLevel;
  age: string;
  source: string;
  actionLabel: string;
  meta: Record<string, string>;
  actions?: LooseEndAction[];
  aiSuggestion?: string | null;
  deepLink?: string | null;
}

export interface JunkEmail {
  id: string;
  messageId: string;
  subject: string;
  from: string;
  importanceScore: number;
}

export interface ScheduleCheckResult {
  proposed: ProposedEvent;
  existingMeeting: ExistingMeeting | null;
  conflicts: CalendarConflict[];
  freeSlots: FreeSlot[];
  alreadyResponded: boolean;
}

export interface ProposedEvent {
  summary: string;
  date: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  description?: string;
}

export interface ExistingMeeting {
  eventId: string;
  summary: string;
  start: string;
  end: string;
  htmlLink: string;
}

export interface CalendarConflict {
  eventId: string;
  summary: string;
  start: string;
  end: string;
}

export interface FreeSlot {
  date: string;
  startTime: string;
  endTime: string;
  label: string;
}

// -- Agent intelligence layer --

export type AgentActionType =
  | "send_email"
  | "create_event"
  | "book_and_reply"
  | "trash_emails"
  | "post_comment"
  | "send_slack"
  | "dismiss";

export interface AgentSuggestion {
  id: string;
  action: AgentActionType;
  title: string;
  reason: string;
  service: "gmail" | "calendar" | "github" | "slack";
  priority: number;
  itemId?: string;         // loose end this relates to
  params: Record<string, string>;  // action-specific parameters
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

import { auth0 } from "@/lib/auth0";
import { loadPermissions, checkPermission } from "@/lib/fga";
import sql, { ensureTables } from "@/lib/db";
import { sanitizeUserId } from "@/lib/storage";
import { sendSlackDM, formatLooseEndsForSlack } from "@/lib/slack-notify";
import type { LooseEnd, LooseEndAction, JunkEmail } from "@/lib/types";

export const maxDuration = 30;

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GH_API = "https://api.github.com";
const SLACK_API = "https://slack.com/api";

const SCHEDULING_RE = /\b(meet|meeting|call|catch up|sync|1[:\-]?on[:\-]?1|coffee|lunch|dinner|schedule|slot|available|availability|free at|block.?(time|calendar)|calendar invite|let'?s (talk|chat|connect|hop on)|(?:at|by|around|before|after)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|tomorrow|next\s+(?:week|monday|tuesday|wednesday|thursday|friday))\b/i;

function looksLikeScheduling(item: LooseEnd): boolean {
  const subject = item.meta?.subject || item.title || "";
  const desc = item.description || "";
  return SCHEDULING_RE.test(subject) || SCHEDULING_RE.test(desc);
}

function addActions(item: LooseEnd): LooseEnd {
  const actions: LooseEndAction[] = [];
  let deepLink: string | null = null;

  switch (item.type) {
    case "email":
      actions.push({ id: "reply", label: "Reply", variant: "primary" });
      if (looksLikeScheduling(item)) {
        actions.push({ id: "create-event", label: "Create Event", variant: "secondary" });
      }
      actions.push({ id: "trash", label: "Trash", variant: "secondary" });
      if (item.meta?.threadId) {
        deepLink = `https://mail.google.com/mail/#inbox/${item.meta.threadId}`;
      }
      actions.push({ id: "open", label: "Open", variant: "ghost" });
      break;
    case "github":
      if (item.meta?.url) deepLink = item.meta.url;
      if (item.title.toLowerCase().includes("review")) {
        actions.push({ id: "comment", label: "Comment", variant: "primary" });
      } else {
        actions.push({ id: "comment", label: "Comment", variant: "primary" });
      }
      actions.push({ id: "open", label: "Open", variant: "ghost" });
      break;
    case "calendar":
      if (item.meta?.htmlLink) deepLink = item.meta.htmlLink;
      actions.push({ id: "open", label: "Open", variant: "ghost" });
      break;
    case "slack":
      actions.push({ id: "reply", label: "Reply", variant: "primary" });
      if (looksLikeScheduling(item)) {
        actions.push({ id: "create-event", label: "Create Event", variant: "secondary" });
      }
      if (item.meta?.permalink) deepLink = item.meta.permalink;
      actions.push({ id: "open", label: "Open", variant: "ghost" });
      break;
  }

  return { ...item, actions, deepLink };
}

function scoreEmailImportance(
  msgData: any,
  threadMsgCount: number,
  userEmail: string
): number {
  let score = 50;
  const headers = msgData.payload?.headers || [];
  const from = headers.find((h: any) => h.name === "From")?.value || "";
  const to = headers.find((h: any) => h.name === "To")?.value || "";
  const cc = headers.find((h: any) => h.name === "Cc")?.value || "";
  const subject = (headers.find((h: any) => h.name === "Subject")?.value || "").toLowerCase();
  const listUnsub = headers.find((h: any) => h.name === "List-Unsubscribe");
  const precedence = (headers.find((h: any) => h.name === "Precedence")?.value || "").toLowerCase();
  const labels = msgData.labelIds || [];

  // Negative signals (noise)
  if (labels.includes("CATEGORY_PROMOTIONS")) score -= 40;
  if (labels.includes("CATEGORY_SOCIAL")) score -= 30;
  if (labels.includes("CATEGORY_UPDATES")) score -= 20;
  if (labels.includes("CATEGORY_FORUMS")) score -= 15;
  if (listUnsub) score -= 25;
  if (precedence === "bulk" || precedence === "list") score -= 20;
  if (/noreply|no-reply|donotreply|notifications?@/i.test(from)) score -= 35;

  // Positive signals — subject keywords
  if (/urgent|asap|immediately|time.?sensitive/i.test(subject)) score += 20;
  if (/action.?required|action.?needed|please.?respond|please.?reply/i.test(subject)) score += 15;
  if (/deadline|due.?date|eod|end.?of.?day|by.?today|by.?tomorrow/i.test(subject)) score += 15;
  if (/important|critical|high.?priority/i.test(subject)) score += 15;
  if (/re:|fwd:/i.test(subject)) score += 5; // reply/forward = conversation

  // Positive signals — recipient and sender
  if (to.toLowerCase().includes(userEmail.toLowerCase())) score += 15;
  if (cc.toLowerCase().includes(userEmail.toLowerCase())) score -= 10;

  const userDomain = userEmail.split("@")[1];
  const senderDomain = (from.match(/@([^>]+)/)?.[1] || "").toLowerCase();
  if (userDomain && senderDomain === userDomain) score += 20;

  if (threadMsgCount >= 3) score += 10;
  if (threadMsgCount >= 6) score += 10;

  if (labels.includes("IMPORTANT")) score += 15;
  if (labels.includes("STARRED")) score += 20;

  return Math.max(0, Math.min(100, score));
}

async function scanGmailDirect(token: string): Promise<{ looseEnds: LooseEnd[]; junkEmails: JunkEmail[] }> {
  // Gmail scan starting
  let profileRes: Response;
  try {
    profileRes = await fetch(`${GMAIL_API}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (fetchErr) {
    console.error("[scan] Gmail profile fetch threw:", fetchErr);
    throw fetchErr;
  }
  if (!profileRes.ok) { console.log("[scan] Gmail profile not ok:", profileRes.status); return { looseEnds: [], junkEmails: [] }; }
  const profile = await profileRes.json();
  const userEmail = profile.emailAddress || "";


  const after = Math.floor((Date.now() - 14 * 86400000) / 1000);
  const searchRes = await fetch(
    `${GMAIL_API}/messages?q=${encodeURIComponent(`in:inbox after:${after}`)}&maxResults=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!searchRes.ok) return { looseEnds: [], junkEmails: [] };
  const searchData = await searchRes.json();
  const messages = searchData.messages || [];
  const looseEnds: LooseEnd[] = [];
  const junkEmails: JunkEmail[] = [];

  // Batch-fetch message metadata in parallel (batches of 10)
  const BATCH = 10;
  const seenThreads = new Set<string>();       // for deduping thread metadata fetches
  const threadHasLooseEnd = new Set<string>();  // one loose end per thread
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (msg: { id: string; threadId?: string }) => {
        try {
          const [msgRes, threadRes] = await Promise.all([
            fetch(`${GMAIL_API}/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence`, { headers: { Authorization: `Bearer ${token}` } }),
            msg.threadId && !seenThreads.has(msg.threadId)
              ? fetch(`${GMAIL_API}/threads/${msg.threadId}?format=metadata&metadataHeaders=From`, { headers: { Authorization: `Bearer ${token}` } })
              : null,
          ]);
          if (!msgRes.ok) return null;
          const msgData = await msgRes.json();
          if (msg.threadId) seenThreads.add(msg.threadId);
          const threadData = threadRes?.ok ? await threadRes.json() : null;
          return { msg, msgData, threadData };
        } catch { return null; }
      })
    );

    for (const r of results) {
      if (!r) continue;
      const { msg, msgData, threadData } = r;
      const headers = msgData.payload?.headers || [];
      const from = headers.find((h: { name: string }) => h.name === "From")?.value || "Unknown";
      const subject = headers.find((h: { name: string }) => h.name === "Subject")?.value || "(no subject)";
      const date = headers.find((h: { name: string }) => h.name === "Date")?.value || "";
      const messageId = headers.find((h: { name: string }) => h.name === "Message-ID")?.value || "";

      if (from.includes(userEmail)) continue;

      // Only one loose end per thread — skip if we already have one
      const tid = msgData.threadId || msg.threadId;
      if (tid && threadHasLooseEnd.has(tid)) continue;

      const threadMsgCount = threadData?.messages?.length || 1;
      // Check if the LAST message in the thread is from the user.
      // If yes, we replied last and it's not a loose end.
      // If the last message is from someone else, they replied back — it's a loose end again.
      if (threadData?.messages?.length) {
        const lastMsg = threadData.messages[threadData.messages.length - 1];
        const lastFrom = lastMsg?.payload?.headers?.find((h: { name: string }) => h.name === "From")?.value || "";
        if (lastFrom.includes(userEmail)) continue;
      }

      const importanceScore = scoreEmailImportance(msgData, threadMsgCount, userEmail);

      if (importanceScore < 25) {
        junkEmails.push({ id: `gmail-${msg.id}`, messageId: msg.id, subject, from: from.split("<")[0].trim(), importanceScore });
        if (tid) threadHasLooseEnd.add(tid);
        continue;
      }

      const ageDays = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
      let urgency: "red" | "yellow" | "green";
      if (importanceScore >= 90) {
        urgency = "red";
      } else if (importanceScore >= 80) {
        urgency = ageDays > 1 ? "red" : "yellow";
      } else if (importanceScore >= 65) {
        urgency = ageDays > 3 ? "red" : ageDays > 1 ? "yellow" : "green";
      } else if (importanceScore >= 40) {
        urgency = ageDays > 7 ? "red" : ageDays > 3 ? "yellow" : "green";
      } else {
        urgency = "green";
      }

      looseEnds.push({
        id: `gmail-${msg.id}`,
        type: "email",
        title: subject,
        description: `From ${from.split("<")[0].trim()} ·no reply sent`,
        urgency,
        age: ageDays === 0 ? "today" : `${ageDays}d ago`,
        source: from,
        actionLabel: "Draft Reply",
        meta: { threadId: msgData.threadId, messageId: msg.id, rfcMessageId: messageId, from, subject, importanceScore: String(importanceScore) },
      });
      if (tid) threadHasLooseEnd.add(tid);
    }
  }
  return { looseEnds, junkEmails };
}

async function scanCalendarDirect(token: string): Promise<LooseEnd[]> {
  const now = new Date();
  // Adaptive: look ahead 7 days, look back 24h
  const weekAhead = new Date(now.getTime() + 7 * 24 * 3600000);
  const dayAgo = new Date(now.getTime() - 24 * 3600000);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  // Fetch all user calendars, then query each for events
  const calListRes = await fetch(`${CALENDAR_API}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const calendarIds: string[] = ["primary"];
  if (calListRes.ok) {
    const calListData = await calListRes.json();
    const ids = (calListData.items || [])
      .filter((c: { deleted?: boolean }) => !c.deleted)
      .map((c: { id: string }) => c.id);
    if (ids.length > 0) calendarIds.splice(0, calendarIds.length, ...ids);
  }

  // Query all calendars in parallel (upcoming + past for each)
  const allUpcoming: any[] = [];
  const allPast: any[] = [];
  await Promise.all(calendarIds.map(async (calId) => {
    const encodedId = encodeURIComponent(calId);
    const [upRes, pastRes] = await Promise.all([
      fetch(`${CALENDAR_API}/calendars/${encodedId}/events?timeMin=${now.toISOString()}&timeMax=${weekAhead.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=30`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${CALENDAR_API}/calendars/${encodedId}/events?timeMin=${dayAgo.toISOString()}&timeMax=${now.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=10`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (upRes.ok) {
      const d = await upRes.json();
      allUpcoming.push(...(d.items || []));
    }
    if (pastRes.ok) {
      const d = await pastRes.json();
      allPast.push(...(d.items || []));
    }
  }));

  // Sort by start time
  const sortByStart = (a: any, b: any) => {
    const sa = new Date(a.start?.dateTime || a.start?.date || 0).getTime();
    const sb = new Date(b.start?.dateTime || b.start?.date || 0).getTime();
    return sa - sb;
  };
  allUpcoming.sort(sortByStart);
  allPast.sort(sortByStart);

  // Dedupe by event ID (same event can appear on multiple calendars)
  const seenIds = new Set<string>();
  function dedup(events: any[]): any[] {
    return events.filter((e) => {
      if (!e.id || seenIds.has(e.id)) return false;
      seenIds.add(e.id);
      return true;
    });
  }
  const upEvents = dedup(allUpcoming);
  const pastEvents = dedup(allPast);

  const looseEnds: LooseEnd[] = [];

  // Past events — recent meetings worth following up
  for (const event of pastEvents.slice(-5)) {
    if (!event.summary) continue;
    const startField = event.start?.dateTime || event.start?.date;
    if (!startField) continue;
    const start = new Date(startField);
    const hoursAgo = (now.getTime() - start.getTime()) / 3600000;
    const attendees = event.attendees?.length || 0;
    const desc = attendees > 1 ? `${attendees} attendees ·ended ${Math.floor(hoursAgo)}h ago` : `Ended ${Math.floor(hoursAgo)}h ago`;
    looseEnds.push({
      id: `cal-past-${event.id}`,
      type: "calendar",
      title: event.summary,
      description: desc,
      urgency: "green",
      age: `${Math.floor(hoursAgo)}h ago`,
      source: event.organizer?.email || "Calendar",
      actionLabel: "Follow Up",
      meta: { eventId: event.id, htmlLink: event.htmlLink || "" },
    });
  }

  const events = upEvents;

  // Separate today's events from later
  const todayEvents = events.filter((e: any) => {
    const s = e.start?.dateTime || e.start?.date;
    return s && new Date(s) <= todayEnd;
  });
  const laterEvents = events.filter((e: any) => {
    const s = e.start?.dateTime || e.start?.date;
    return s && new Date(s) > todayEnd;
  });

  // Helper to format one event
  function formatEvent(event: any, i: number, list: any[]): LooseEnd | null {
    const startField = event.start?.dateTime || event.start?.date;
    if (!startField) return null;
    const start = new Date(startField);
    const isAllDay = !event.start?.dateTime;
    const end = new Date(event.end?.dateTime || event.end?.date || start);
    const hoursUntil = (start.getTime() - now.getTime()) / 3600000;
    const daysUntil = hoursUntil / 24;
    const attendees = event.attendees?.length || 0;
    const timeStr = isAllDay ? "All day" : start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dayLabel = start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

    // Conflict detection
    if (!isAllDay && i < list.length - 1 && list[i + 1].start?.dateTime) {
      const nextStart = new Date(list[i + 1].start.dateTime);
      if (nextStart < end) {
        return {
          id: `cal-conflict-${event.id}`, type: "calendar",
          title: `Conflict: "${event.summary}" overlaps "${list[i + 1].summary}"`,
          description: `Both at ${timeStr}`, urgency: "red",
          age: hoursUntil < 24 ? "today" : dayLabel,
          source: event.summary || "Untitled", actionLabel: "Reschedule",
          meta: { eventId: event.id, htmlLink: event.htmlLink || "" },
        };
      }
    }

    // Unprepared meeting
    const hasDescription = !!(event.description && event.description.trim().length > 10);
    if (attendees >= 2 && !hasDescription && hoursUntil < 24) {
      return {
        id: `cal-noprep-${event.id}`, type: "calendar",
        title: `Unprepared: "${event.summary}"`,
        description: `${attendees} attendees, no agenda ·${timeStr}`,
        urgency: hoursUntil < 4 ? "red" : "yellow",
        age: `in ${Math.floor(hoursUntil)}h`,
        source: event.summary || "Untitled", actionLabel: "Create Agenda",
        meta: { eventId: event.id, htmlLink: event.htmlLink || "" },
      };
    }

    // Normal event
    const ageStr = hoursUntil < 1 ? "now"
      : hoursUntil < 24 ? `in ${Math.floor(hoursUntil)}h`
      : daysUntil < 2 ? "tomorrow"
      : dayLabel;
    const desc = attendees > 1 ? `${attendees} attendees ·${timeStr}` : timeStr;
    return {
      id: `cal-event-${event.id}`, type: "calendar",
      title: event.summary || "Untitled event",
      description: desc, urgency: "green", age: ageStr,
      source: event.organizer?.email || "Calendar", actionLabel: "Open",
      meta: { eventId: event.id, htmlLink: event.htmlLink || "" },
    };
  }

  // Strategy: if today has events, show today's agenda. Otherwise show what's next.
  if (todayEvents.length > 0) {
    for (let i = 0; i < todayEvents.length; i++) {
      const le = formatEvent(todayEvents[i], i, todayEvents);
      if (le) looseEnds.push(le);
    }
    // Also peek at next 2 future events
    for (let i = 0; i < Math.min(2, laterEvents.length); i++) {
      const le = formatEvent(laterEvents[i], i, laterEvents);
      if (le) looseEnds.push(le);
    }
  } else {
    // No events today ·show next 5 upcoming
    for (let i = 0; i < Math.min(5, events.length); i++) {
      const le = formatEvent(events[i], i, events);
      if (le) looseEnds.push(le);
    }
  }

  return looseEnds;
}

async function scanGitHubDirect(token: string): Promise<LooseEnd[]> {
  const ghHeaders = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" };
  const userRes = await fetch(`${GH_API}/user`, { headers: ghHeaders });
  if (!userRes.ok) return [];
  const user = await userRes.json();
  const looseEnds: LooseEnd[] = [];

  const staleDate = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  // Fetch everything in parallel: PR reviews, stale issues, notifications, recent events
  const [prRes, issueRes, notifRes, eventsRes] = await Promise.all([
    fetch(`${GH_API}/search/issues?q=type:pr+state:open+review-requested:${user.login}&sort=created&order=desc&per_page=10`, { headers: ghHeaders }),
    fetch(`${GH_API}/search/issues?q=type:issue+state:open+assignee:${user.login}+updated:<${staleDate}&sort=updated&order=asc&per_page=10`, { headers: ghHeaders }),
    fetch(`${GH_API}/notifications?per_page=20&all=false`, { headers: ghHeaders }),
    fetch(`${GH_API}/users/${user.login}/events?per_page=15`, { headers: ghHeaders }),
  ]);

  // PR reviews
  if (prRes.ok) {
    const prData = await prRes.json();
    for (const pr of prData.items || []) {
      const ageDays = Math.floor((Date.now() - new Date(pr.created_at).getTime()) / 86400000);
      const repoFull = pr.repository_url?.split("/repos/")[1] || "";
      const [owner, repo] = repoFull.split("/");
      looseEnds.push({
        id: `gh-pr-${pr.number}`, type: "github",
        title: `Review requested: "${pr.title}"`,
        description: `${repoFull} #${pr.number} ·by ${pr.user?.login}`,
        urgency: ageDays > 7 ? "red" : ageDays > 3 ? "yellow" : "green",
        age: `${ageDays}d ago`, source: repoFull, actionLabel: "Review PR",
        meta: { owner, repo, number: String(pr.number), url: pr.html_url || "" },
      });
    }
  }

  // Stale issues
  if (issueRes.ok) {
    const issueData = await issueRes.json();
    for (const issue of issueData.items || []) {
      const staleDays = Math.floor((Date.now() - new Date(issue.updated_at).getTime()) / 86400000);
      const repoFull = issue.repository_url?.split("/repos/")[1] || "";
      const [owner, repo] = repoFull.split("/");
      looseEnds.push({
        id: `gh-issue-${issue.number}`, type: "github",
        title: `Stale issue: "${issue.title}"`,
        description: `${repoFull} #${issue.number} ·${staleDays}d without activity`,
        urgency: staleDays > 14 ? "red" : "yellow",
        age: `${staleDays}d stale`, source: repoFull, actionLabel: "Update Issue",
        meta: { owner, repo, number: String(issue.number), url: issue.html_url || "" },
      });
    }
  }

  // Notifications
  if (notifRes.ok) {
    const notifications = await notifRes.json();
    const seenTitles = new Set(looseEnds.map(le => le.title));
    for (const notif of notifications.slice(0, 10)) {
      const title = notif.subject?.title || "";
      if (seenTitles.has(title) || looseEnds.some(le => le.title.includes(title))) continue;
      const repoName = notif.repository?.full_name || "";
      const ageDays = Math.floor((Date.now() - new Date(notif.updated_at).getTime()) / 86400000);
      const reason = notif.reason || "";
      const reasonLabel = reason === "review_requested" ? "Review requested"
        : reason === "mention" ? "Mentioned"
        : reason === "ci_activity" ? "CI activity"
        : reason === "comment" ? "New comment"
        : reason === "assign" ? "Assigned"
        : reason === "state_change" ? "State changed"
        : reason === "subscribed" ? "Subscribed"
        : reason.replace(/_/g, " ");
      looseEnds.push({
        id: `gh-notif-${notif.id}`, type: "github",
        title: title || "GitHub notification",
        description: `${reasonLabel} ·${repoName}`,
        urgency: reason === "mention" || reason === "assign" || reason === "review_requested" ? "yellow" : "green",
        age: ageDays === 0 ? "today" : `${ageDays}d ago`,
        source: repoName, actionLabel: "View",
        meta: { url: notif.subject?.url?.replace("api.github.com/repos", "github.com") || "", reason },
      });
    }
  }

  // If we still have nothing, show recent activity (commits, PRs, etc.)
  if (looseEnds.length === 0 && eventsRes.ok) {
    const events = await eventsRes.json();
    for (const event of events.slice(0, 8)) {
      const repoName = event.repo?.name || "";
      const ageDays = Math.floor((Date.now() - new Date(event.created_at).getTime()) / 86400000);
      let title = "";
      let desc = "";

      switch (event.type) {
        case "PushEvent": {
          const commits = event.payload?.commits || [];
          const commitMsg = commits[0]?.message?.split("\n")[0] || "code changes";
          title = commits.length > 1 ? `Pushed ${commits.length} commits` : commitMsg;
          desc = `Push to ${repoName}`;
          break;
        }
        case "PullRequestEvent":
          title = `${event.payload?.action} PR: ${event.payload?.pull_request?.title || ""}`;
          desc = repoName;
          break;
        case "IssuesEvent":
          title = `${event.payload?.action} issue: ${event.payload?.issue?.title || ""}`;
          desc = repoName;
          break;
        case "CreateEvent":
          title = `Created ${event.payload?.ref_type || "ref"}: ${event.payload?.ref || repoName}`;
          desc = repoName;
          break;
        case "WatchEvent":
          title = `Starred ${repoName}`;
          desc = "Activity";
          break;
        default:
          title = event.type?.replace("Event", "") || "Activity";
          desc = repoName;
      }

      looseEnds.push({
        id: `gh-event-${event.id}`, type: "github",
        title, description: desc, urgency: "green",
        age: ageDays === 0 ? "today" : `${ageDays}d ago`,
        source: repoName, actionLabel: "View",
        meta: { url: `https://github.com/${repoName}` },
      });
    }
  }

  return looseEnds;
}

async function scanSlackDirect(token: string): Promise<LooseEnd[]> {
  const authRes = await fetch(`${SLACK_API}/auth.test`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!authRes.ok) return [];
  const authData = await authRes.json();
  if (!authData.ok) return [];
  const userId = authData.user_id;
  const looseEnds: LooseEnd[] = [];
  const cutoff7d = Math.floor((Date.now() - 7 * 86400000) / 1000);
  const cutoff30d = Math.floor((Date.now() - 30 * 86400000) / 1000);
  const slackHeaders = { Authorization: `Bearer ${token}` };

  // Fetch DMs, group DMs, and channels in parallel
  const [dmRes, mpimRes, chanRes] = await Promise.all([
    fetch(`${SLACK_API}/conversations.list?types=im&limit=30`, { headers: slackHeaders }),
    fetch(`${SLACK_API}/conversations.list?types=mpim&limit=15`, { headers: slackHeaders }),
    fetch(`${SLACK_API}/conversations.list?types=public_channel,private_channel&limit=20&exclude_archived=true`, { headers: slackHeaders }),
  ]);

  // Build user name cache
  const userNames: Record<string, string> = {};
  async function resolveUser(uid: string): Promise<string> {
    if (userNames[uid]) return userNames[uid];
    try {
      const uRes = await fetch(`${SLACK_API}/users.info?user=${uid}`, { headers: { Authorization: `Bearer ${token}` } });
      if (uRes.ok) {
        const u = (await uRes.json()).user;
        const name = u?.profile?.display_name || u?.real_name || u?.name || uid;
        userNames[uid] = name;
        return name;
      }
    } catch {}
    return uid;
  }

  // Process DM conversations in parallel (look back 30 days)
  if (dmRes.ok) {
    const dmData = await dmRes.json();
    const dmChannels = (dmData.channels ?? []).slice(0, 15);

    // Fetch all DM histories in parallel
    const dmResults = await Promise.all(
      dmChannels.map(async (ch: { id: string; user: string }) => {
        try {
          const histRes = await fetch(
            `${SLACK_API}/conversations.history?channel=${ch.id}&limit=5`,
            { headers: slackHeaders }
          );
          if (!histRes.ok) return null;
          const histData = await histRes.json();
          const msgs = histData.messages ?? [];
          if (msgs.length === 0 || msgs[0].subtype) return null;
          return { ch, latest: msgs[0] };
        } catch { return null; }
      })
    );

    // Resolve all user names in parallel
    const userIdsToResolve = new Set<string>();
    for (const r of dmResults) {
      if (!r) continue;
      userIdsToResolve.add(r.ch.user || r.latest.user);
    }
    await Promise.all([...userIdsToResolve].map(uid => resolveUser(uid)));

    // Build loose ends from results
    for (const r of dmResults) {
      if (!r) continue;
      const { ch, latest } = r;
      const ts = parseFloat(latest.ts ?? "0");
      const ageDays = Math.floor((Date.now() / 1000 - ts) / 86400);
      const preview = (latest.text ?? "").slice(0, 80);
      const name = userNames[ch.user || latest.user] || "Someone";

      if (latest.user !== userId) {
        looseEnds.push({
          id: `slack-dm-${ch.id}`, type: "slack",
          title: `Unanswered DM from ${name}`, description: preview,
          urgency: ageDays > 7 ? "red" : ageDays > 3 ? "yellow" : "green",
          age: ageDays === 0 ? "today" : `${ageDays}d ago`,
          source: "Slack", actionLabel: "Reply",
          meta: { channel: ch.id, ts: latest.ts },
        });
      } else {
        looseEnds.push({
          id: `slack-chat-${ch.id}`, type: "slack",
          title: `Chat with ${name}`, description: preview,
          urgency: "green",
          age: ageDays === 0 ? "today" : `${ageDays}d ago`,
          source: "Slack", actionLabel: "Open",
          meta: { channel: ch.id, ts: latest.ts },
        });
      }
    }
  }

  // Process group DMs
  if (mpimRes.ok) {
    const mpimData = await mpimRes.json();
    for (const ch of (mpimData.channels ?? []).slice(0, 8)) {
      try {
        const histRes = await fetch(
          `${SLACK_API}/conversations.history?channel=${ch.id}&limit=3`,
          { headers: slackHeaders }
        );
        if (!histRes.ok) continue;
        const histData = await histRes.json();
        const msgs = histData.messages ?? [];
        if (msgs.length === 0) continue;
        const latest = msgs[0];
        if (latest.subtype) continue;

        const ts = parseFloat(latest.ts ?? "0");
        const ageDays = Math.floor((Date.now() / 1000 - ts) / 86400);

        // Resolve group member names (from channel name like "mpdm-user1--user2--user3-1")
        const memberNames: string[] = [];
        if (ch.name) {
          const parts = ch.name.replace(/^mpdm-/, "").replace(/-\d+$/, "").split("--");
          for (const p of parts.slice(0, 3)) memberNames.push(p);
        }
        const groupName = memberNames.length > 0 ? memberNames.join(", ") : "Group DM";

        const isUnanswered = latest.user !== userId;
        looseEnds.push({
          id: `slack-group-${ch.id}`,
          type: "slack",
          title: isUnanswered ? `Unanswered in group: ${groupName}` : `Group chat: ${groupName}`,
          description: (latest.text ?? "").slice(0, 80),
          urgency: isUnanswered ? (ageDays > 3 ? "yellow" : "green") : "green",
          age: ageDays === 0 ? "today" : `${ageDays}d ago`,
          source: "Slack",
          actionLabel: isUnanswered ? "Reply" : "Open",
          meta: { channel: ch.id, ts: latest.ts },
        });
      } catch { continue; }
    }
  }

  // Also show recent channel activity (mentions and active channels)
  if (chanRes.ok) {
    const chanData = await chanRes.json();
    for (const ch of (chanData.channels ?? []).slice(0, 5)) {
      try {
        const histRes = await fetch(
          `${SLACK_API}/conversations.history?channel=${ch.id}&limit=1`,
          { headers: slackHeaders }
        );
        if (!histRes.ok) continue;
        const histData = await histRes.json();
        const msgs = histData.messages ?? [];
        if (msgs.length === 0) continue;
        const latest = msgs[0];
        if (latest.subtype) continue;

        const ts = parseFloat(latest.ts ?? "0");
        const ageDays = Math.floor((Date.now() / 1000 - ts) / 86400);
        if (ageDays > 7) continue; // skip stale channels

        const senderName = await resolveUser(latest.user);
        looseEnds.push({
          id: `slack-chan-${ch.id}`,
          type: "slack",
          title: `#${ch.name}`,
          description: `${senderName}: ${(latest.text ?? "").slice(0, 60)}`,
          urgency: "green",
          age: ageDays === 0 ? "today" : `${ageDays}d ago`,
          source: "Slack",
          actionLabel: "Open",
          meta: { channel: ch.id, ts: latest.ts },
        });
      } catch { continue; }
    }
  }

  return looseEnds;
}

export async function POST(req: Request) {
  let only: string | null = null;
  try { const body = await req.json(); only = body?.only || null; } catch {}
  return scan(only);
}

async function scan(only?: string | null) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user?.sub || session.user?.email || "anonymous";
  const permissions = await loadPermissions(userId);

  const errors: Record<string, string> = {};
  const services: Record<string, boolean> = { google: false, github: false, slack: false };
  const denied: string[] = [];

  // Get tokens in parallel
  const tokenResults = await Promise.allSettled([
    auth0.getAccessTokenForConnection({ connection: "google-oauth2" }),
    auth0.getAccessTokenForConnection({ connection: "github" }),
    auth0.getAccessTokenForConnection({ connection: "sign-in-with-slack" }),
  ]);

  const googleToken = tokenResults[0].status === "fulfilled" ? tokenResults[0].value.token : null;
  const githubToken = tokenResults[1].status === "fulfilled" ? tokenResults[1].value.token : null;
  const slackToken = tokenResults[2].status === "fulfilled" ? tokenResults[2].value.token : null;

  if (googleToken) services.google = true;
  if (githubToken) services.github = true;
  if (slackToken) services.slack = true;

  // "only" filter: scan a single service (e.g. only="email", "calendar", "github", "slack")
  const shouldScan = (svc: string) => !only || only === svc;

  // Run scans in parallel — respecting FGA permissions
  const scanPromises: Promise<LooseEnd[]>[] = [];
  let gmailScanPromise: Promise<{ looseEnds: LooseEnd[]; junkEmails: JunkEmail[] }> | null = null;

  if (googleToken) {
    if (shouldScan("email") && permissions.gmail.can_read) {
      gmailScanPromise = scanGmailDirect(googleToken).catch((e) => {
        errors.gmail = String(e);
        return { looseEnds: [], junkEmails: [] };
      });
    } else if (shouldScan("email")) {
      denied.push("gmail");
    }

    if (shouldScan("calendar") && permissions.calendar.can_read) {
      scanPromises.push(
        scanCalendarDirect(googleToken).catch((e) => { errors.calendar = String(e); return []; })
      );
    } else if (shouldScan("calendar")) {
      denied.push("calendar");
    }
  }
  if (githubToken) {
    if (shouldScan("github") && permissions.github.can_read) {
      scanPromises.push(
        scanGitHubDirect(githubToken).catch((e) => { errors.github = String(e); return []; })
      );
    } else if (shouldScan("github")) {
      denied.push("github");
    }
  }
  if (slackToken) {
    if (shouldScan("slack") && permissions.slack.can_read) {
      scanPromises.push(
        scanSlackDirect(slackToken).catch((e) => { errors.slack = String(e); return []; })
      );
    } else if (shouldScan("slack")) {
      denied.push("slack");
    }
  }

  const [otherResults, gmailResult] = await Promise.all([
    Promise.all(scanPromises),
    gmailScanPromise ?? Promise.resolve({ looseEnds: [], junkEmails: [] }),
  ]);

  let allLooseEnds = [...gmailResult.looseEnds, ...otherResults.flat()].map(addActions);
  const junkEmails = gmailResult.junkEmails;

  // Filter out dismissed items
  await ensureTables();
  const dismissedRows = await sql`
    SELECT item_key FROM dismissed_items WHERE user_id = ${userId}
  `;
  if (dismissedRows.length > 0) {
    const dismissedKeys = new Set(dismissedRows.map((r) => r.item_key as string));
    allLooseEnds = allLooseEnds.filter((le) => {
      // For emails, match by threadId; for others match by item id
      const key = le.meta?.threadId || le.id;
      return !dismissedKeys.has(key);
    });
  }

  // Sort by urgency: red first, then yellow, then green
  const urgencyOrder: Record<string, number> = { red: 0, yellow: 1, green: 2 };
  allLooseEnds.sort((a, b) => (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2));

  // Auto-clean is handled client-side via the SuggestionTray countdown.
  // The scan only finds junk — never acts on it.

  // Fire-and-forget: send Slack DM alert if there are urgent (red) items
  const redItems = allLooseEnds.filter((le) => le.urgency === "red");
  if (redItems.length > 0 && slackToken) {
    notifyViaSlack(userId, slackToken, allLooseEnds, junkEmails.length).catch(
      (err) => console.error("[Slack Notify] Error:", err)
    );
  }

  return Response.json({ looseEnds: allLooseEnds, junkEmails, errors, services, denied });
}

/**
 * Check permissions and rate-limit, then send a Slack DM alert.
 * This runs as fire-and-forget — errors are logged, never thrown to the caller.
 */
async function notifyViaSlack(
  userId: string,
  slackToken: string,
  looseEnds: LooseEnd[],
  junkCount: number
): Promise<void> {
  // 1. Check FGA permission: slack.can_send
  const allowed = await checkPermission(userId, "slack", "can_send");
  if (!allowed) {
    console.log("[Slack Notify] User lacks slack.can_send permission, skipping.");
    return;
  }

  // 2. Rate-limit: max 1 notification per hour per user
  await ensureTables();
  const key = sanitizeUserId(userId);
  const rows = await sql`
    SELECT last_notified_at FROM autonomous_state WHERE user_id = ${key}
  `;
  if (rows.length > 0 && rows[0].last_notified_at) {
    const lastNotified = new Date(rows[0].last_notified_at);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (lastNotified > oneHourAgo) {
      console.log("[Slack Notify] Rate-limited, last notified:", lastNotified.toISOString());
      return;
    }
  }

  // 3. Format and send
  const { text, blocks } = formatLooseEndsForSlack(looseEnds, junkCount);
  await sendSlackDM(slackToken, text, blocks);

  // 4. Record the notification timestamp
  await sql`
    INSERT INTO autonomous_state (user_id, last_notified_at)
    VALUES (${key}, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET last_notified_at = NOW()
  `;

  console.log("[Slack Notify] Alert sent successfully for user:", key);
}

# Loose Ends — Product Requirements Document

## Problem Statement

Knowledge workers operate across a fragmented landscape of tools — email, calendars, code repositories, and more. Important items inevitably fall through the cracks: an email from a key client sits unreplied for days, a pull request blocks a teammate because no one reviewed it, a meeting arrives with zero preparation. These "loose ends" accumulate silently. By the time someone notices, the damage is done — a missed deadline, a strained relationship, a preventable fire drill.

Existing solutions attack this problem one silo at a time. Email clients surface unreplied threads but know nothing about your calendar. GitHub sends notification emails that drown in the same inbox they are supposed to help you escape. No single tool connects the dots across services, ranks what matters most, and helps you actually resolve each item — not just see it.

## Solution Overview

**Loose Ends** is an AI-powered agent that connects to a user's Gmail, Google Calendar, and GitHub accounts through Auth0 Token Vault, scans for dropped responsibilities, and presents them in a unified, urgency-ranked dashboard. Users can then interact with a Claude-powered chat agent to triage, draft responses, and take action on each item. Sensitive write operations (sending an email, merging a PR) require explicit phone approval via Auth0 CIBA, ensuring the user stays in control even when the AI is doing the heavy lifting.

### Core Value Propositions
1. **Cross-tool visibility** — One place to see every loose end across email, calendar, and code.
2. **AI-assisted resolution** — The agent does not just list problems; it helps draft replies, summarize PR diffs, and prepare meeting briefs.
3. **Security-first actions** — Auth0 Token Vault manages OAuth tokens server-side. CIBA phone approval gates every write action, so the AI can never act without explicit human consent.

## User Stories

### US-1: Discover unreplied emails
**As a** knowledge worker,
**I want** the agent to scan my Gmail and surface emails I have not replied to,
**so that** I never leave an important message unanswered.

**Acceptance Criteria:**
- Agent retrieves emails from the last 7 days where the user is in the "To" field and no reply exists.
- Each email is displayed with sender, subject, date, and a computed urgency score.
- Urgency factors include sender importance (based on frequency of communication), age of the email, and presence of question marks or action-requesting language.

### US-2: Detect calendar conflicts and unprepared meetings
**As a** professional with a busy schedule,
**I want** the agent to flag calendar conflicts and meetings I have not prepared for,
**so that** I can resolve scheduling issues and walk into every meeting ready.

**Acceptance Criteria:**
- Agent retrieves calendar events for the next 48 hours.
- Overlapping events are flagged as conflicts with both events displayed side-by-side.
- Meetings with 3+ attendees and no attached document, agenda, or recent email thread with attendees are flagged as "unprepared."
- User can ask the AI to generate a brief prep summary based on recent emails with the meeting's attendees.

### US-3: Surface pending PR reviews
**As a** developer,
**I want** the agent to show me pull requests where my review is requested,
**so that** I do not block my teammates.

**Acceptance Criteria:**
- Agent queries GitHub for PRs where the authenticated user is a requested reviewer.
- Each PR shows repository, title, author, age, and number of changed files.
- PRs older than 48 hours are marked as high urgency.

### US-4: Find stale assigned issues
**As a** developer,
**I want** the agent to surface GitHub issues assigned to me that have gone stale,
**so that** I can re-prioritize or close them.

**Acceptance Criteria:**
- Agent queries GitHub for open issues assigned to the user with no activity in the last 14 days.
- Each issue shows repository, title, last activity date, and labels.

### US-5: AI-assisted email drafting with CIBA approval
**As a** user who wants to quickly respond to overdue emails,
**I want** the AI to draft a reply and send it only after I approve on my phone,
**so that** I can respond fast without risking an unsanctioned send.

**Acceptance Criteria:**
- User selects an unreplied email and asks the agent to draft a reply.
- Agent generates a context-aware draft displayed in the chat.
- User can iterate on the draft via conversation.
- When the user confirms, a CIBA push notification is sent to their phone.
- The email is sent only after phone approval; rejection cancels the action.
- The UI shows real-time status of the approval request (pending, approved, rejected, expired).

### US-6: Unified urgency-ranked dashboard
**As a** user overwhelmed by notifications,
**I want** a single dashboard that ranks all my loose ends by urgency,
**so that** I can focus on what matters most right now.

**Acceptance Criteria:**
- Dashboard displays loose ends from all connected sources in a single feed.
- Items are sorted by a composite urgency score (age, source priority, contextual signals).
- Each item shows its source icon (Gmail, Calendar, GitHub), a one-line summary, and the urgency indicator.
- Clicking an item opens the chat agent pre-loaded with context about that item.

### US-7: Connect and manage accounts via settings
**As a** user,
**I want** a settings page where I can connect and disconnect my Gmail, Calendar, and GitHub accounts,
**so that** I control which services the agent can access.

**Acceptance Criteria:**
- Settings page shows connection status for each service (connected / not connected).
- "Connect" initiates the Auth0 Token Vault OAuth flow for that provider.
- "Disconnect" revokes the token in Auth0 Token Vault and updates the UI.
- Connection errors display clear, actionable messages.

### US-8: Onboarding via landing page
**As a** first-time visitor,
**I want** a clear landing page that explains what Loose Ends does and lets me sign in,
**so that** I understand the value before committing.

**Acceptance Criteria:**
- Landing page communicates the core value proposition in under 10 seconds of reading.
- Prominent "Sign In" button initiates Auth0 Universal Login.
- Page is visually polished with animations and matches the dark theme of the app.

## Non-Functional Requirements

### Security
- **Token isolation:** OAuth tokens for Gmail, Calendar, and GitHub are stored exclusively in Auth0 Token Vault. The application backend never persists raw tokens — it requests them on-demand via the Token Vault API.
- **Write-action gating:** Every mutating action (send email, merge PR, update event) requires CIBA phone approval. The system must not provide a bypass path.
- **Session management:** Auth0 NextJS SDK handles session cookies with secure, HTTP-only, same-site attributes.
- **Least privilege scopes:** OAuth scopes requested are the minimum required (e.g., `gmail.readonly` for scanning, `gmail.send` only when drafting).

### Performance
- **Scan latency:** Initial scan across all three services should complete within 10 seconds on a typical account (< 500 emails in 7-day window, < 50 calendar events, < 30 PRs).
- **Chat responsiveness:** First token from the AI agent should appear within 1 second of sending a message (streaming via Vercel AI SDK).
- **Dashboard render:** Dashboard should reach interactive state within 2 seconds on a 4G connection.

### Reliability
- **Graceful degradation:** If one service is unreachable (e.g., GitHub API is down), the dashboard still displays results from the other connected services with a clear error indicator for the failed source.
- **Token refresh:** Auth0 Token Vault handles token refresh transparently. The app must handle `401` responses by re-requesting from Token Vault rather than prompting the user to re-authenticate.

### Usability
- **Dark-first design:** The UI defaults to a dark theme consistent with the custom color palette (`le-void`, `le-surface`, `le-accent`, etc.).
- **Responsive layout:** All pages function on viewports from 375px (mobile) to 1440px (desktop).
- **Keyboard accessible:** All interactive elements are reachable and operable via keyboard.

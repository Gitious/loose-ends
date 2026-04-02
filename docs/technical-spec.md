# Loose Ends — Technical Specification

## Architecture Overview

Loose Ends is a Next.js 16 application deployed on Vercel. It combines server-side API routes for secure token handling with a React client that streams AI responses in real time. The key architectural principle is that **OAuth tokens never touch the browser** -- Auth0 Token Vault manages them server-side, and the Next.js backend calls third-party APIs on behalf of the user.

### High-Level Architecture

```
+--------------------------------------------------+
|                   Browser (Client)                |
|                                                   |
|   Landing Page    Chat Interface    Settings      |
|   (page.tsx)      (ChatPanel)       (page.tsx)    |
|        |               |                |         |
|        |          useChat() hook         |         |
|        |          (AI SDK React)         |         |
+--------|---------------|----------------|--------+
         |               |                |
    Auth0 Login    POST /api/chat    Connect Flow
         |               |                |
+--------|---------------|----------------|--------+
|                  Next.js Server                   |
|                                                   |
|   middleware.ts         /api/chat/route.ts         |
|   (auth guard)          (streamText + tools)      |
|                              |                    |
|        +---------------------+---+                |
|        |                     |   |                |
|   scanGmail            scanCalendar  scanGitHub   |
|   (gmail.ts)           (calendar.ts) (github.ts)  |
|        |                     |        |           |
|   withGmailAccess      withGmailAccess  withGitHubAccess
|   (auth0-ai.ts)        (auth0-ai.ts)   (auth0-ai.ts)
|        |                     |        |           |
+--------|---------------------|--------|----------+
         |                     |        |
+--------|---------------------|--------|----------+
|            Auth0 Token Vault                      |
|                                                   |
|   google-oauth2 connection    github connection   |
|   (Gmail + Calendar scopes)   (repo, read:user)   |
|                                                   |
|   Stores & refreshes OAuth tokens server-side     |
|   CIBA: withAsyncAuthorization for write actions  |
+--------------------------------------------------+
         |                     |        |
    Gmail API          Calendar API   GitHub API
```

### Technology Stack
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 16 (App Router) | Full-stack React framework |
| AI | Vercel AI SDK v6 + `@ai-sdk/anthropic` | Streaming chat with tool calling |
| Auth | `@auth0/nextjs-auth0` v4 | Session management, Universal Login |
| Token Management | `@auth0/ai` + `@auth0/ai-vercel` | Token Vault access, CIBA flows |
| Styling | Tailwind CSS 4 | Utility-first CSS |
| Animation | Framer Motion | Page transitions, micro-interactions |
| Validation | Zod 4 | Runtime schema validation for tool inputs |
| Language | TypeScript 5 | Type safety throughout |

## Data Flow

### Authentication Flow
```
User -> Landing Page -> "Sign In" button
  -> Auth0 Universal Login (redirect)
  -> Auth0 callback -> Session created (HTTP-only cookie)
  -> Redirect to /dashboard
```

### Token Vault Flow (e.g., Gmail scan)
```
Client                    Next.js API Route              Auth0 Token Vault         Gmail API
  |                             |                              |                      |
  |-- POST /api/scan/gmail ---->|                              |                      |
  |                             |-- GET token for gmail ------>|                      |
  |                             |<-- access_token ------------|                      |
  |                             |                              |                      |
  |                             |-- GET /gmail/v1/messages --------------------------->|
  |                             |<-- email data ----------------------------------------|
  |                             |                              |                      |
  |                             |-- (process, rank urgency) --|                      |
  |<-- JSON loose ends --------|                              |                      |
```

### CIBA Approval Flow (e.g., send email)
```
Client                    Next.js API Route         Auth0 CIBA            User's Phone
  |                             |                       |                      |
  |-- "Send this draft" ------->|                       |                      |
  |                             |-- initiate CIBA ----->|                      |
  |                             |<-- auth_req_id -------|                      |
  |                             |                       |-- push notification ->|
  |<-- "Awaiting approval" ----|                       |                      |
  |                             |                       |                      |
  |                             |-- poll status ------->|                      |
  |                             |                       |<-- user approves ----|
  |                             |<-- approved ----------|                      |
  |                             |                       |                      |
  |                             |-- send email via Gmail API ---------------->|
  |<-- "Email sent" -----------|                       |                      |
```

### AI Chat Flow
```
Client (useChat hook)     POST /api/chat              Claude (claude-sonnet-4)
  |                             |                          |
  |-- messages[] + id --------->|                          |
  |                             |-- setAIContext(threadID) |
  |                             |-- streamText() --------->|
  |                             |   (system prompt +       |
  |                             |    tools: scanGmail,     |
  |                             |    scanCalendar,         |
  |                             |    scanGitHub)           |
  |                             |                          |
  |                             |<-- stream tokens --------|
  |<-- UI message stream -------|                          |
  |                             |                          |
  |                             |<-- tool_call: scanGmail -|
  |                             |-- Token Vault: get token |
  |                             |-- Gmail API: fetch msgs  |
  |                             |-- tool_result: LooseEnd[]|
  |                             |                          |
  |                             |<-- tool_call: scanGitHub |
  |                             |-- Token Vault: get token |
  |                             |-- GitHub API: search PRs |
  |                             |-- tool_result: LooseEnd[]|
  |                             |                          |
  |                             |<-- continue stream ------|
  |<-- UI message stream -------|                          |
  |                             |                          |
  |   (stopWhen: stepCountIs(5) limits tool call depth)    |
```

Note: The client uses `useChat()` from `@ai-sdk/react` which renders tool invocations as `dynamic-tool` message parts. The `ChatPanel` component detects these parts and renders `ToolResultCard` components inline, showing a pulsing indicator while tools execute and a checkmark with item count when complete.

## Key Technical Decisions

### 1. Auth0 Token Vault over direct OAuth
**Decision:** Store and manage all third-party OAuth tokens in Auth0 Token Vault rather than in a database.
**Rationale:** Token Vault handles refresh logic, secure storage, and token lifecycle automatically. This eliminates an entire class of bugs (expired tokens, insecure storage) and satisfies the hackathon requirement. The trade-off is an extra network hop per API call, but token requests are fast (< 100ms) and can be parallelized.

### 2. Vercel AI SDK with tool calling over a custom agent loop
**Decision:** Use `streamText()` from the Vercel AI SDK with declarative tool definitions rather than building a custom ReAct agent loop.
**Rationale:** The AI SDK handles streaming, tool call parsing, multi-step tool execution, and error recovery out of the box. Tool definitions map naturally to our scanner functions. This approach is faster to build and more reliable than a hand-rolled agent.

### 3. Server-side scanning over client-side API calls
**Decision:** All third-party API calls happen in Next.js API routes, never from the browser.
**Rationale:** OAuth tokens from Token Vault must remain server-side for security. This also avoids CORS issues with Gmail/GitHub APIs and keeps API keys out of client bundles.

### 4. CIBA for write actions over in-app confirmation dialogs
**Decision:** Use Auth0 CIBA (Client-Initiated Backchannel Authentication) with phone push notifications for all write actions instead of simple in-app "Are you sure?" dialogs.
**Rationale:** An in-app dialog can be triggered programmatically by the AI agent, defeating the purpose of human oversight. CIBA requires an out-of-band approval on a separate device, providing genuine human-in-the-loop control. This is a core differentiator of the product.

### 5. No database — stateless between sessions
**Decision:** No persistent database. All state is derived from live API calls to Gmail, Calendar, and GitHub on each scan.
**Rationale:** For a hackathon demo, freshness matters more than historical tracking. This eliminates database setup, migrations, and sync logic. Auth0 handles session and token persistence. The trade-off is that each scan hits live APIs, but caching within a session via React state is sufficient.

## Auth0 Integration Details

### Universal Login
- Configured via `@auth0/nextjs-auth0` middleware.
- Handles sign-up, sign-in, and session management.
- Session stored in an encrypted HTTP-only cookie.
- Auth0 tenant configured with a Regular Web Application.

### Token Vault
- Two Token Vault connections are configured: `google-oauth2` (Gmail + Calendar scopes) and `github` (repo + read:user scopes).
- Server-side code uses `@auth0/ai-vercel`'s `Auth0AI.withTokenVault()` to wrap AI SDK tool definitions. Each wrapper specifies the connection ID, required scopes, and a `refreshToken` callback that reads the session's refresh token.
- Inside wrapped tools, `getAccessTokenFromTokenVault()` retrieves the current access token -- Token Vault handles refresh transparently.
- Google scopes: `gmail.readonly`, `gmail.send`, `calendar.readonly`, `calendar.events`.
- GitHub scopes: `repo`, `read:user`.
- The calendar scanner reuses the `withGmailAccess` wrapper because both Gmail and Calendar tokens come from the same `google-oauth2` connection.

### CIBA (Client-Initiated Backchannel Authentication)
- Requires Auth0 Guardian configured on the user's phone.
- Configured via `Auth0AI.withAsyncAuthorization()` in `src/lib/auth0-ai.ts` (exported as `withSendApproval`).
- The wrapper takes a `userID` callback (reads `user.sub` from session), a `bindingMessage` callback that formats the action description (e.g., "Approve: Send email to john@example.com"), and scopes/audience.
- When a write-action tool wrapped with `withSendApproval` is invoked, Auth0 sends a push notification to the user's phone. The tool execution blocks until the user approves or rejects.
- On approval, the server proceeds with the write action. On rejection or timeout, the action is cancelled and the user is notified in the chat stream.

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/[...auth0]` | GET, POST | Auth0 authentication handlers (login, callback, logout) via `auth0.middleware()` |
| `/api/chat` | POST | AI chat endpoint -- accepts messages, streams Claude responses with tool calls via `streamText()` |

Scanning is not exposed as separate REST endpoints. Instead, the three scanner tools (`scanGmail`, `scanCalendar`, `scanGitHub`) are registered as AI SDK tools on the `/api/chat` route and invoked by the Claude model during conversation. This design means scanning is always mediated by the AI agent, which can contextualize results and suggest follow-up actions.

CIBA approval flows are initiated via `withAsyncAuthorization` from `@auth0/ai-vercel`, configured in `src/lib/auth0-ai.ts`. The `withSendApproval` wrapper handles binding messages and polling automatically when wrapped around write-action tools.

## Component Hierarchy

```
src/
├── middleware.ts                      # Auth guard: redirects unauthenticated users to login
│
├── lib/
│   ├── auth0.ts                      # Auth0Client setup, getSession(), getAccessToken(), getUser()
│   ├── auth0-ai.ts                   # Token Vault wrappers (withGmailAccess, withGitHubAccess, withSendApproval)
│   ├── types.ts                      # LooseEnd, UrgencyLevel, AuditEntry type definitions
│   └── tools/
│       ├── gmail.ts                  # scanGmail tool — unreplied emails via Gmail API
│       ├── calendar.ts               # scanCalendar tool — conflicts & no-agenda meetings via Calendar API
│       └── github.ts                 # scanGitHub tool — pending PR reviews & stale issues via GitHub API
│
├── app/
│   ├── layout.tsx                    # Root layout: dark theme, Auth0Provider wrapper
│   ├── page.tsx                      # Landing page (unauthenticated): hero, features, CTA
│   │
│   ├── dashboard/
│   │   ├── layout.tsx                # Authenticated layout: Nav bar
│   │   └── page.tsx                  # Chat-first dashboard with ChatPanel
│   │
│   ├── settings/
│   │   └── page.tsx                  # Account connections + Token Vault info
│   │
│   └── api/
│       ├── auth/[...auth0]/route.ts  # Auth0 auth handlers (login, callback, logout)
│       └── chat/route.ts             # AI chat: streamText() with scanner tools
│
└── components/
    ├── ui/
    │   ├── Nav.tsx                    # Top navigation bar (Loose Ends logo, Settings, Logout)
    │   └── Badge.tsx                 # Color-coded urgency badge (red/yellow/green)
    ├── chat/
    │   └── ChatPanel.tsx             # Full chat UI: messages, tool results, input
    │       ├── ToolResultCard        # Inline display of LooseEnd[] from tool calls
    │       └── (loading indicator)   # Pulsing dots while agent is thinking
    ├── dashboard/
    │   └── LooseEndCard.tsx          # Single loose end card with urgency badge and action button
    └── settings/
        └── ConnectedAccounts.tsx     # Google and GitHub connection cards
```

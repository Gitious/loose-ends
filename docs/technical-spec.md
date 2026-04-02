# Loose Ends — Technical Specification

## Architecture Overview

Loose Ends is a Next.js 16 application deployed on Vercel. It combines server-side API routes for secure token handling with a React client that streams AI responses in real time. The key architectural principle is that **OAuth tokens never touch the browser** — Auth0 Token Vault manages them server-side, and the Next.js backend calls third-party APIs on behalf of the user.

### Technology Stack
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 16 (App Router) | Full-stack React framework |
| AI | Vercel AI SDK + `@ai-sdk/anthropic` | Streaming chat with tool calling |
| Auth | `@auth0/nextjs-auth0` | Session management, Universal Login |
| Token Management | `@auth0/ai` + `@auth0/ai-vercel` | Token Vault access, CIBA flows |
| Styling | Tailwind CSS 4 | Utility-first CSS |
| Animation | Framer Motion | Page transitions, micro-interactions |
| Validation | Zod 4 | Runtime schema validation |
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
Client                    POST /api/chat              Claude (Anthropic)
  |                             |                          |
  |-- user message + context -->|                          |
  |                             |-- streamText() --------->|
  |                             |   (with tool definitions)|
  |                             |                          |
  |                             |<-- stream tokens --------|
  |<-- SSE stream --------------|                          |
  |                             |                          |
  |                             |<-- tool_call: scanGmail -|
  |                             |-- execute tool --------->|  (server-side)
  |                             |-- tool_result ---------->|
  |                             |<-- continue stream ------|
  |<-- SSE stream --------------|                          |
```

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
- Each third-party provider (Google for Gmail/Calendar, GitHub) is registered as a Token Vault connection in the Auth0 dashboard.
- Server-side code uses `@auth0/ai` to request tokens by connection ID.
- Tokens are requested on-demand for each API call and not cached by the application.
- If a token is expired, Token Vault refreshes it transparently before returning.

### CIBA (Client-Initiated Backchannel Authentication)
- Requires Auth0 Guardian configured on the user's phone.
- Flow: API route calls `@auth0/ai` CIBA endpoint with a binding message describing the action (e.g., "Send email to john@example.com: Re: Q3 Budget").
- Returns an `auth_req_id` that the server polls until the user approves or rejects.
- Poll interval: 5 seconds. Timeout: 5 minutes.
- On approval, the server proceeds with the write action. On rejection or timeout, the action is cancelled and the user is notified.

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/[auth0]` | * | Auth0 authentication handlers (login, callback, logout) |
| `/api/oracle/generate` | POST | AI chat endpoint — accepts messages, streams Claude responses with tool calls |
| `/api/scan/gmail` | POST | Scan Gmail for unreplied emails, return urgency-ranked results |
| `/api/scan/calendar` | POST | Scan Google Calendar for conflicts and unprepared meetings |
| `/api/scan/github` | POST | Scan GitHub for pending PR reviews and stale issues |
| `/api/scan/all` | POST | Parallel scan of all connected services |
| `/api/ciba/initiate` | POST | Start a CIBA approval flow for a write action |
| `/api/ciba/status` | GET | Poll CIBA approval status by `auth_req_id` |
| `/api/connections/status` | GET | Check which Token Vault connections are active for the user |
| `/api/connections/[provider]` | DELETE | Disconnect a provider (revoke Token Vault token) |

## Component Hierarchy

```
app/
├── layout.tsx                    # Root layout: dark theme, fonts, Auth0 provider
├── page.tsx                      # Landing page (unauthenticated)
│
├── dashboard/
│   ├── layout.tsx                # Authenticated layout: sidebar, nav
│   └── page.tsx                  # Dashboard: urgency-ranked loose ends feed
│
├── chat/
│   └── page.tsx                  # AI chat interface
│       ├── ChatMessages          # Scrollable message list
│       │   ├── UserMessage       # User's message bubble
│       │   ├── AgentMessage      # Agent's streamed response
│       │   └── ToolCallCard      # Inline display of tool execution (scan results, CIBA status)
│       ├── ChatInput             # Message input with send button
│       └── ContextSidebar        # Shows active loose end context
│
├── settings/
│   └── page.tsx                  # Account connections management
│       ├── ConnectionCard        # Per-provider connect/disconnect card
│       └── ProfileSection        # User profile info from Auth0
│
├── api/                          # API routes (see table above)
│
└── components/
    ├── ui/                       # Shared primitives (Button, Card, Badge, etc.)
    ├── LooseEndCard.tsx          # Single loose end item (used in dashboard + chat)
    ├── UrgencyBadge.tsx          # Color-coded urgency indicator
    ├── SourceIcon.tsx            # Gmail / Calendar / GitHub icon
    ├── CibaApprovalStatus.tsx    # Real-time CIBA approval state display
    ├── ScanButton.tsx            # Trigger a scan with loading state
    └── AnimatedLayout.tsx        # Framer Motion page transition wrapper
```

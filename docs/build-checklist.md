# Loose Ends — Build Checklist

## Task 1: Project Scaffold
- [x] Initialize Next.js 16 project with TypeScript and Tailwind CSS 4
- [x] Install core dependencies: Vercel AI SDK v6, Auth0 SDKs, Framer Motion, Zod 4
- [x] Configure custom color palette in `tailwind.config.ts` (`le-void`, `le-surface`, `le-accent`, `le-red`, `le-yellow`, `le-green`, etc.)
- [x] Set up `.env.local` with Auth0 credentials (domain, client ID/secret, audience, scope) and Anthropic API key
- [x] Verify `npm run dev` runs cleanly

## Task 2: Auth0 Configuration
- [x] Create Auth0 tenant and Regular Web Application
- [x] Configure Auth0 Universal Login branding (dark theme)
- [x] Set up Auth0 Guardian for CIBA push notifications
- [x] Register Token Vault connections: `google-oauth2` (Gmail + Calendar scopes), `github` (repo + read:user)
- [x] Configure callback and logout URLs for local dev and production
- [x] Integrate `@auth0/nextjs-auth0` v4 middleware and auth API routes (`/api/auth/[...auth0]`)
- [x] Implement auth middleware in `src/middleware.ts` guarding `/dashboard` and `/settings` routes

## Task 3: Token Vault Wrappers
- [x] Create `src/lib/auth0-ai.ts` with `Auth0AI.withTokenVault()` wrappers
- [x] Implement `withGmailAccess` wrapper (google-oauth2 connection, Gmail + Calendar scopes)
- [x] Implement `withGitHubAccess` wrapper (github connection, repo + read:user scopes)
- [x] Implement `withSendApproval` wrapper using `Auth0AI.withAsyncAuthorization()` for CIBA approval flows
- [x] Create `src/lib/auth0.ts` with `Auth0Client` setup, `getSession()`, `getAccessToken()`, `getUser()` helpers
- [x] Shared types defined in `src/lib/types.ts` (`LooseEnd`, `UrgencyLevel`, `AuditEntry`)

## Task 4: Scanner Tools (Gmail, Calendar, GitHub)
- [x] Implement `src/lib/tools/gmail.ts`
  - [x] Fetch emails from last N days where user is in inbox
  - [x] Check each thread for user replies (skip threads where user already replied)
  - [x] Compute urgency score based on email age (>7 days = red, >3 days = yellow, else green)
  - [x] Extract sender name and return structured `LooseEnd[]` array
- [x] Implement `src/lib/tools/calendar.ts`
  - [x] Fetch events for next N hours from primary calendar
  - [x] Detect overlapping events (conflicts) using pairwise start/end comparison
  - [x] Flag meetings with 2+ attendees and no description/agenda
  - [x] Urgency based on time until event (<1h = red, <4h = yellow, else green)
  - [x] Return structured `LooseEnd[]` array
- [x] Implement `src/lib/tools/github.ts`
  - [x] Fetch PRs where user is requested reviewer via GitHub Search API
  - [x] Fetch stale open issues assigned to user with no activity in N days
  - [x] Compute urgency by age (>7 days = red, >3 days = yellow, else green)
  - [x] Return structured `LooseEnd[]` array
- [x] All tools wrapped with Token Vault access wrappers and registered as Vercel AI SDK tools

## Task 5: Chat Endpoint
- [x] Implement `/api/chat/route.ts` with Vercel AI SDK `streamText()`
- [x] Register scanner tools: `scanGmail`, `scanCalendar`, `scanGitHub`
- [x] Wire tool execution to Token Vault via `setAIContext({ threadID })`
- [x] Configure system prompt with persona, urgency format, and capabilities
- [x] Set `stopWhen: stepCountIs(5)` to limit tool call depth
- [x] Use `claude-sonnet-4-20250514` model via `@ai-sdk/anthropic`
- [x] Return `result.toUIMessageStreamResponse()` for client streaming
- [ ] Add write-action tools wrapped with `withSendApproval` CIBA wrapper (draft email reply, merge PR)
- [ ] Test multi-turn conversation with CIBA approval flow end-to-end

## Task 6: Chat-First Dashboard UI
- [x] Build `/dashboard/page.tsx` as authenticated chat-first interface
- [x] Implement `ChatPanel` component with `useChat()` hook from `@ai-sdk/react`
- [x] Render `dynamic-tool` message parts with live status indicators (pulsing dot / checkmark)
- [x] Implement `ToolResultCard` component to display `LooseEnd[]` results inline
- [x] Color-coded urgency dots (red/yellow/green) in tool result cards
- [x] Welcome message explaining agent capabilities
- [x] Auto-scroll on new messages
- [x] Loading indicator (pulsing dots) while agent is thinking
- [x] Create `LooseEndCard` component with source icon, title, description, urgency badge, and hover action button
- [x] Create `Badge` component (red = Urgent, yellow = Attention, green = Low)

## Task 7: Landing Page
- [x] Design and build `/page.tsx` as the unauthenticated landing page
- [x] Hero section: headline ("Find every loose end"), subheadline, "Get Started" CTA linking to Auth0 login
- [x] Feature cards: Scan, Prioritize, Resolve -- with icons and descriptions
- [x] Visual polish: radial gradient glow, Framer Motion fade-up animations
- [x] "How It Works" anchor link with scroll-into-view animations
- [x] Footer with hackathon attribution
- [x] Responsive layout (mobile through desktop)

## Task 8: Settings Page
- [x] Build `/settings/page.tsx` with connection management
- [x] Create `ConnectedAccounts` component with Google and GitHub connection cards
- [x] Each card has icon (full SVG), name, description, and "Connect" button
- [x] Connect buttons link to Auth0 login with connection parameter
- [x] "About Token Vault" section explaining security model to users
- [x] Framer Motion entrance animations
- [ ] Show live connection status (connected/disconnected) via Token Vault API check
- [ ] "Disconnect" button to revoke Token Vault tokens
- [ ] Display user profile info from Auth0 session

## Task 9: Documentation
- [x] Write `docs/scope.md` -- project scope and constraints
- [x] Write `docs/prd.md` -- product requirements with user stories and acceptance criteria
- [x] Write `docs/technical-spec.md` -- architecture, data flows, decisions, component hierarchy
- [x] Write `docs/build-checklist.md` -- this checklist
- [x] Write `docs/blog-post.md` -- blog post for Auth0 hackathon bonus prize

## Task 10: Polish and Testing
- [ ] End-to-end test: sign in -> scan -> chat -> draft reply -> CIBA approve
- [ ] Error states: disconnected provider, API timeout, CIBA rejection, token refresh failure
- [x] Loading states: pulsing dots in chat while agent thinks, tool status indicators
- [x] Empty states: welcome message when no messages yet, "No loose ends found" in tool results
- [ ] Responsive testing: mobile (375px), tablet (768px), desktop (1440px)
- [ ] Keyboard navigation audit
- [ ] Final visual polish pass: spacing, typography, color consistency

## Task 11: Demo Video
- [ ] Script the 3-minute demo flow
- [ ] Record screen capture: landing -> sign in -> chat scan -> tool results -> CIBA approval
- [ ] Add voiceover explaining the Auth0 Token Vault and CIBA integration
- [ ] Edit and export at 1080p

## Task 12: Submission
- [ ] Deploy to Vercel production
- [ ] Upload demo video to YouTube (unlisted)
- [ ] Complete Devpost submission form
- [ ] Write project description highlighting Auth0 Token Vault usage and the "accountability mirror" insight
- [ ] Add screenshots to Devpost gallery
- [ ] Submit blog post for bonus prize
- [ ] Final review and submit

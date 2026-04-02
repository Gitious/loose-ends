# Loose Ends — Build Checklist

## Task 1: Project Scaffold
- [x] Initialize Next.js 16 project with TypeScript and Tailwind CSS 4
- [x] Install core dependencies: Vercel AI SDK, Auth0 SDKs, Framer Motion, Zod
- [x] Configure custom color palette in `tailwind.config.ts` (`le-void`, `le-surface`, `le-accent`, etc.)
- [x] Set up `.env.local` with Auth0 credentials and Anthropic API key
- [x] Verify `npm run dev` runs cleanly

## Task 2: Auth0 Configuration
- [ ] Create Auth0 tenant and Regular Web Application
- [ ] Configure Auth0 Universal Login branding (dark theme)
- [ ] Set up Auth0 Guardian for CIBA push notifications
- [ ] Register Token Vault connections: Google (Gmail + Calendar scopes), GitHub
- [ ] Configure callback and logout URLs for local dev and production
- [ ] Integrate `@auth0/nextjs-auth0` middleware and auth API routes

## Task 3: Token Vault Wrappers
- [ ] Create `src/lib/token-vault.ts` — helper to fetch tokens by connection ID
- [ ] Implement `getGmailToken()`, `getCalendarToken()`, `getGitHubToken()` convenience functions
- [ ] Add error handling for expired/revoked tokens with clear error types
- [ ] Add `src/lib/ciba.ts` — helper to initiate and poll CIBA approval flows
- [ ] Test token retrieval for each provider end-to-end

## Task 4: Scanner Tools (Gmail, Calendar, GitHub)
- [ ] Implement `src/lib/tools/gmail-scanner.ts`
  - [ ] Fetch emails from last 7 days where user is in "To" and no reply exists
  - [ ] Compute urgency score (sender frequency, email age, action language)
  - [ ] Return structured `LooseEnd[]` array
- [ ] Implement `src/lib/tools/calendar-scanner.ts`
  - [ ] Fetch events for next 48 hours
  - [ ] Detect overlapping events (conflicts)
  - [ ] Flag meetings with 3+ attendees and no attached agenda/doc
  - [ ] Return structured `LooseEnd[]` array
- [ ] Implement `src/lib/tools/github-scanner.ts`
  - [ ] Fetch PRs where user is requested reviewer
  - [ ] Fetch open issues assigned to user with no activity in 14 days
  - [ ] Compute urgency (age-based)
  - [ ] Return structured `LooseEnd[]` array
- [ ] Implement `/api/scan/all` route that runs all scanners in parallel
- [ ] Define shared `LooseEnd` TypeScript type with `source`, `urgency`, `title`, `summary`, `metadata`

## Task 5: Chat Endpoint
- [ ] Implement `/api/oracle/generate` with Vercel AI SDK `streamText()`
- [ ] Define Claude tool schemas for: `scanGmail`, `scanCalendar`, `scanGitHub`, `draftEmailReply`, `initiateCibaApproval`
- [ ] Wire tool execution to scanner functions and Token Vault
- [ ] Configure system prompt with persona, capabilities, and safety guardrails
- [ ] Test multi-turn conversation with tool calls
- [ ] Implement CIBA-gated write action flow (draft -> approve -> execute)

## Task 6: Dashboard UI
- [ ] Build `/dashboard/page.tsx` with urgency-ranked loose ends feed
- [ ] Create `LooseEndCard` component (source icon, title, summary, urgency badge)
- [ ] Create `UrgencyBadge` component (red/yellow/green color coding)
- [ ] Create `SourceIcon` component (Gmail, Calendar, GitHub icons)
- [ ] Add `ScanButton` to trigger manual scan with loading/skeleton state
- [ ] Implement click-to-chat: clicking a loose end navigates to chat with context pre-loaded
- [ ] Add Framer Motion entrance animations for card list

## Task 7: Landing Page
- [ ] Design and build `/page.tsx` as the unauthenticated landing page
- [ ] Hero section: headline, subheadline, "Sign In with Auth0" CTA
- [ ] Feature cards: cross-tool scanning, AI assistance, phone approval
- [ ] Visual polish: gradient backgrounds, Framer Motion scroll animations
- [ ] Responsive layout (mobile-first)

## Task 8: Settings Page
- [ ] Build `/settings/page.tsx` with connection management
- [ ] Create `ConnectionCard` component per provider (Gmail, Calendar, GitHub)
- [ ] Show connection status (connected/disconnected) via `/api/connections/status`
- [ ] "Connect" button triggers Token Vault OAuth flow
- [ ] "Disconnect" button calls `/api/connections/[provider]` DELETE
- [ ] Display user profile info from Auth0 session
- [ ] Handle and display connection errors gracefully

## Task 9: Documentation
- [x] Write `docs/scope.md` — project scope and constraints
- [x] Write `docs/prd.md` — product requirements with user stories
- [x] Write `docs/technical-spec.md` — architecture, data flows, decisions
- [x] Write `docs/build-checklist.md` — this checklist

## Task 10: Polish and Testing
- [ ] End-to-end test: sign in -> scan -> view dashboard -> chat -> draft reply -> CIBA approve
- [ ] Error states: disconnected provider, API timeout, CIBA rejection, token refresh failure
- [ ] Loading states: skeleton cards on dashboard, typing indicator in chat
- [ ] Empty states: no loose ends found, no accounts connected
- [ ] Responsive testing: mobile (375px), tablet (768px), desktop (1440px)
- [ ] Keyboard navigation audit
- [ ] Final visual polish pass: spacing, typography, color consistency

## Task 11: Demo Video
- [ ] Script the 3-minute demo flow
- [ ] Record screen capture: landing -> sign in -> dashboard -> chat interaction -> CIBA approval
- [ ] Add voiceover explaining the Auth0 Token Vault and CIBA integration
- [ ] Edit and export at 1080p

## Task 12: Submission
- [ ] Deploy to Vercel production
- [ ] Upload demo video to YouTube (unlisted)
- [ ] Complete Devpost submission form
- [ ] Write project description highlighting Auth0 Token Vault usage
- [ ] Add screenshots to Devpost gallery
- [ ] Final review and submit

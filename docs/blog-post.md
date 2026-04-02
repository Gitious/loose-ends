# The Best Use of Token Vault Is Catching What You Failed to Do

*Building Loose Ends: an AI agent that uses Auth0 Token Vault to surface your dropped responsibilities across Gmail, Calendar, and GitHub.*

---

## The Problem Nobody Talks About

Every productivity tool promises to help you do more. But the real problem is not doing more -- it is noticing what you already failed to do.

That email from your manager three days ago? Still unanswered. The pull request your teammate opened last Tuesday? Still unreviewed. Tomorrow's board meeting with six attendees? No agenda, no prep, no plan. These are loose ends, and they accumulate silently across every tool you use. By the time you notice one, the damage is already done: a missed deadline, a blocked colleague, a meeting you stumble through unprepared.

The tools themselves make it worse. Gmail shows you unreplied threads but knows nothing about your calendar. GitHub sends notification emails that drown in the same inbox they are supposed to help you escape. Nothing connects the dots across services, and nothing tells you which dropped ball matters most right now.

## Token Vault as an Accountability Mirror

When I started building **Loose Ends** for the Auth0 "Authorized to Act" hackathon, my first instinct was to treat Token Vault as plumbing -- a secure way to store OAuth tokens so my app could call Gmail and GitHub APIs. That framing is correct but boring.

The real insight came when I flipped it: Token Vault is not just an access enabler. It is the lens through which an AI agent can audit your behavior across services and find where you fell short.

Think about what Token Vault gives you. Secure, server-side access to a user's Gmail, Google Calendar, and GitHub -- all managed in one place, with automatic token refresh and no raw credentials in your database. Most apps use this to do things *for* the user. Loose Ends uses it to discover what the user *failed* to do.

The agent connects to your Gmail and finds threads where someone wrote to you and you never replied. It connects to your Calendar and finds meetings happening in hours with no agenda and no prep material. It connects to GitHub and finds pull requests sitting in your review queue, blocking your teammates. Then it ranks everything by urgency and presents it in a single chat interface where you can start resolving each item immediately.

Token Vault makes this possible because it manages connections to multiple services through a single, secure interface. Without it, I would be storing OAuth tokens in a database, handling refresh logic for each provider separately, and worrying about token leakage. With Token Vault, all of that disappears. I configure the connections once in the Auth0 dashboard, and my server-side code calls `getAccessTokenFromTokenVault()` whenever it needs to talk to Gmail or GitHub. The tokens never touch the browser. They never touch my database. They exist only in Token Vault's encrypted storage, fetched on-demand for each API call.

## How the Architecture Works

Loose Ends is a Next.js 16 app with a chat-first interface. The user signs in via Auth0 Universal Login, then lands on a chat screen powered by Claude (via the Vercel AI SDK). When the user asks the agent to scan for loose ends, the AI model invokes tool calls -- `scanGmail`, `scanCalendar`, `scanGitHub` -- that execute server-side.

Each tool is wrapped with `Auth0AI.withTokenVault()` from the `@auth0/ai-vercel` package. This wrapper handles the Token Vault handshake automatically: it reads the user's refresh token from the Auth0 session, exchanges it for a scoped access token via Token Vault, and makes that token available inside the tool's execution function. The tool then calls the relevant API (Gmail, Calendar, or GitHub), processes the results into urgency-ranked "loose ends," and returns them to the AI model.

The model synthesizes the results across all three services and presents them to the user in a unified, prioritized format. Red items are critical (overdue emails, imminent unprepared meetings). Yellow items need attention soon. Green items are low priority. The user can then continue the conversation to get help resolving each item -- drafting a reply, reviewing a PR summary, or creating a meeting agenda.

For write actions -- actually sending that email reply or merging that PR -- Loose Ends uses Auth0 CIBA (Client-Initiated Backchannel Authentication). Instead of a simple "Are you sure?" dialog that the AI could theoretically bypass, CIBA sends a push notification to the user's phone via Auth0 Guardian. The action only proceeds after out-of-band approval on a separate device. This is genuine human-in-the-loop control, not a rubber stamp.

## The Technical Challenges

**Challenge 1: One Google connection, two services.** Gmail and Google Calendar both use Google OAuth, but they need different scopes. The solution was straightforward -- a single `google-oauth2` Token Vault connection with all required scopes (`gmail.readonly`, `gmail.send`, `calendar.readonly`, `calendar.events`). Both the Gmail scanner and Calendar scanner use the same `withGmailAccess` wrapper.

**Challenge 2: Detecting unreplied emails is harder than it sounds.** You cannot just search for emails in your inbox -- you need to check each thread for whether *you* replied. The Gmail scanner fetches messages, retrieves the user's email address from their profile, then checks each thread's message list for a message with the user's address in the From header. This requires multiple API calls per thread, which I optimized with a thread cache to avoid redundant lookups.

**Challenge 3: Making tool results feel like a conversation.** The Vercel AI SDK streams tool invocations as `dynamic-tool` message parts. I built a custom `ToolResultCard` component that renders each loose end inline in the chat, with a pulsing status indicator while the tool executes and a checkmark with item count when it completes. The effect is that the agent feels alive -- you watch it scan your services in real time and report back.

**Challenge 4: No database, no problem.** For a hackathon, freshness matters more than history. Loose Ends has no database. Every scan hits live APIs through Token Vault. Session state lives in Auth0's encrypted HTTP-only cookie. Token persistence lives in Token Vault. The app itself is completely stateless between requests, which made deployment trivial and eliminated an entire category of bugs.

## The Insight Worth Repeating

Most Token Vault demos show you how to connect to an API and do something useful with it. Loose Ends shows what happens when you connect to three APIs and look for the *absence* of action. The tokens are not just credentials -- they are a window into your professional obligations, and the AI agent is the one looking through that window to find where you dropped the ball.

If you are building with Token Vault, consider this: the most valuable thing you can do with secure API access might not be taking action on the user's behalf. It might be showing them the actions they failed to take on their own.

---

*Loose Ends was built for the Auth0 "Authorized to Act" hackathon using Auth0 Token Vault, Auth0 CIBA, the Vercel AI SDK, and Claude. The source code is available on the Devpost submission page.*

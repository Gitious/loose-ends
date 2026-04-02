# Loose Ends — Scope Document

## What We're Building
An AI agent that scans Gmail, Google Calendar, and GitHub via **Auth0 Token Vault** to find everything the user has dropped -- unreplied emails, unreviewed PRs, unprepared meetings -- and helps resolve each one with **CIBA phone approval** for sensitive actions.

The core insight: Token Vault's best use is not just connecting to APIs -- it is catching what users **failed** to do across those APIs.

## In Scope
- AI chat agent powered by Claude (Sonnet 4) via Vercel AI SDK with tool calling
- Gmail scanning: detect unreplied emails, rank by urgency (sender frequency, email age, action language)
- Calendar scanning: detect conflicts (overlapping events) and unprepared meetings (no agenda, multiple attendees)
- GitHub scanning: detect pending PR reviews and stale assigned issues
- Auth0 Token Vault for secure, server-side OAuth token management (Google for Gmail/Calendar, GitHub)
- Auth0 CIBA (Client-Initiated Backchannel Authentication) for async phone approval of sensitive write actions
- Chat-first interface where the AI agent presents findings and helps triage
- Settings page for managing connected accounts via Token Vault
- Polished dark-themed landing page with Framer Motion animations
- Full Auth0 Universal Login integration with session management

## Explicitly Out of Scope
- Slack integration (future enhancement)
- Mobile native app
- Scheduled/automated background scanning (manual trigger only for hackathon)
- Data persistence between sessions beyond Auth0's token storage
- Multi-user teams/organizations
- Custom notification channels beyond Auth0 Guardian
- Direct email sending without CIBA approval (security by design)
- Separate dashboard feed page (the chat interface IS the dashboard -- AI presents urgency-ranked items inline)

## Key Constraints
- Must use Auth0 Token Vault (hackathon requirement)
- 4-day build timeline
- Solo developer
- Must produce 3-minute demo video
- No database -- all state derived from live API calls, Auth0 handles token/session persistence

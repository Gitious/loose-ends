# Loose Ends — Scope Document

## What We're Building
An AI agent that scans Gmail, Google Calendar, and GitHub via Auth0 Token Vault to find everything the user has dropped — unreplied emails, unreviewed PRs, unprepared meetings — and helps resolve each one with CIBA phone approval for sensitive actions.

## In Scope
- AI chat agent powered by Claude via Vercel AI SDK
- Gmail scanning: detect unreplied emails, rank by urgency
- Calendar scanning: detect conflicts, unprepared meetings
- GitHub scanning: detect pending PR reviews, stale assigned issues
- Auth0 Token Vault for secure OAuth token management (Gmail, Calendar, GitHub)
- Auth0 CIBA for async phone approval of sensitive write actions
- Dashboard with urgency-ranked loose ends
- Settings page for managing connected accounts
- Landing page
- Dark, polished UI with Framer Motion animations

## Explicitly Out of Scope
- Slack integration (future enhancement)
- Mobile native app
- Scheduled/automated background scanning (manual trigger only for hackathon)
- Data persistence between sessions beyond Auth0's token storage
- Multi-user teams/organizations
- Custom notification channels beyond Auth0 Guardian
- Email composition/sending (draft only, CIBA approval for send)

## Key Constraints
- Must use Auth0 Token Vault (hackathon requirement)
- 4-day build timeline
- Solo developer
- Must produce 3-minute demo video

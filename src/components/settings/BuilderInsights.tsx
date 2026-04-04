"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

interface InsightCard {
  id: string;
  title: string;
  tag: string;
  tagColor: string;
  content: React.ReactNode;
}

const cards: InsightCard[] = [
  {
    id: "security-tiers",
    title: "The Three-Tier Security Model",
    tag: "Architecture",
    tagColor: "text-le-accent bg-le-accent/15",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-le-muted leading-relaxed">
          This wasn&apos;t planned upfront. We started with &quot;just check
          permissions before doing stuff&quot; and pretty quickly realized
          not all actions are created equal. Reading your emails is different
          from sending one on your behalf. So we ended up with three tiers
          that felt natural:
        </p>

        {/* Tier diagram */}
        <div className="space-y-2">
          {[
            {
              tier: "1",
              label: "Read operations",
              detail: "Token Vault only (automatic)",
              color: "border-emerald-500/40 bg-emerald-500/5",
              dotColor: "bg-emerald-500",
            },
            {
              tier: "2",
              label: "Draft / create",
              detail: "FGA permission check + chat confirmation",
              color: "border-le-accent/40 bg-le-accent/5",
              dotColor: "bg-le-accent",
            },
            {
              tier: "3",
              label: "Send / delete / approve",
              detail: "FGA + CIBA push notification to your phone",
              color: "border-le-red/40 bg-le-red/5",
              dotColor: "bg-le-red",
            },
          ].map((t) => (
            <div
              key={t.tier}
              className={`flex items-start gap-3 rounded-lg border ${t.color} px-4 py-3`}
            >
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${t.dotColor}`}
              />
              <div>
                <span className="text-xs font-mono text-le-muted/60">
                  Tier {t.tier}
                </span>
                <p className="text-sm font-medium text-le-text">{t.label}</p>
                <p className="text-xs text-le-muted mt-0.5">{t.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-le-muted/70 leading-relaxed">
          The nice thing is each tier maps to real Auth0 primitives: Token Vault
          handles token storage, FGA handles the permission model, and CIBA
          (via Guardian) handles the out-of-band approval. They compose well.
        </p>
      </div>
    ),
  },
  {
    id: "slack-token-vault",
    title: "Slack + Token Vault: The oauth.v2.user.access Discovery",
    tag: "Pain Point",
    tagColor: "text-le-red bg-le-red/15",
    content: (
      <div className="space-y-3">
        <p className="text-sm text-le-muted leading-relaxed">
          Auth0&apos;s built-in &quot;Sign in with Slack&quot; connector uses
          OIDC, which is fine for login but doesn&apos;t give you refresh
          tokens. That means Token Vault can&apos;t keep the connection alive
          -- it needs refresh tokens to do its thing.
        </p>
        <p className="text-sm text-le-muted leading-relaxed">
          The fix: we created a custom OAuth2 connection through the Management
          API. The key gotcha is you need Slack&apos;s{" "}
          <code className="rounded bg-le-elevated px-1.5 py-0.5 text-xs font-mono text-le-text">
            oauth.v2.user.access
          </code>{" "}
          endpoint, not{" "}
          <code className="rounded bg-le-elevated px-1.5 py-0.5 text-xs font-mono text-le-text">
            oauth.v2.access
          </code>
          . The second one returns bot tokens. The first returns top-level user
          tokens that Auth0 can actually parse and store.
        </p>
        <div className="rounded-lg border border-le-border/30 bg-le-elevated/40 px-4 py-3">
          <p className="text-xs font-medium text-le-accent">
            Suggestion for Auth0
          </p>
          <p className="text-xs text-le-muted mt-1 leading-relaxed">
            The built-in Slack connector should support{" "}
            <code className="font-mono">user_scope</code> natively so you
            don&apos;t have to build a custom connection just to get user-level
            tokens with refresh capability.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "ciba-guardian",
    title: "CIBA Guardian Enrollment Gotcha",
    tag: "Pain Point",
    tagColor: "text-le-red bg-le-red/15",
    content: (
      <div className="space-y-3">
        <p className="text-sm text-le-muted leading-relaxed">
          This one burned a few hours. CIBA sends push notifications through
          Guardian, but the enrollment has to match the exact{" "}
          <code className="rounded bg-le-elevated px-1.5 py-0.5 text-xs font-mono text-le-text">
            user_id
          </code>{" "}
          making the request.
        </p>
        <p className="text-sm text-le-muted leading-relaxed">
          If your user logs in via Google, their ID is{" "}
          <code className="rounded bg-le-elevated px-1.5 py-0.5 text-xs font-mono text-le-text">
            google-oauth2|...
          </code>
          . But if you enrolled Guardian from the Auth0 dashboard while logged
          in with a different identity, the enrollment is on a different
          user_id. CIBA just silently fails with a generic error -- no hint that
          the enrollment doesn&apos;t match.
        </p>
        <div className="rounded-lg border border-le-border/30 bg-le-elevated/40 px-4 py-3">
          <p className="text-xs font-medium text-le-accent">
            Suggestion for Auth0
          </p>
          <p className="text-xs text-le-muted mt-1 leading-relaxed">
            Better error messages when CIBA can&apos;t find a Guardian
            enrollment for the requesting user. Something like &quot;No
            Guardian enrollment found for user_id X&quot; would save a lot of
            debugging time.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "fga-enforcement",
    title: "FGA: Prompt Enforcement vs Hard Enforcement",
    tag: "Lesson Learned",
    tagColor: "text-purple-400 bg-purple-500/15",
    content: (
      <div className="space-y-3">
        <p className="text-sm text-le-muted leading-relaxed">
          First attempt: we told the LLM about the user&apos;s permissions in
          the system prompt. &quot;You are not allowed to send emails for this
          user.&quot; It mostly worked. Mostly. Sometimes the model would just
          do it anyway, especially in longer conversations where the system
          prompt context faded.
        </p>
        <p className="text-sm text-le-muted leading-relaxed">
          What actually works: hard enforcement at the code level. Before
          building the tool registry for each chat session, we call FGA and
          only include tools the user has permission to use. If you don&apos;t
          have email send permission, the{" "}
          <code className="rounded bg-le-elevated px-1.5 py-0.5 text-xs font-mono text-le-text">
            send_email
          </code>{" "}
          tool literally doesn&apos;t exist in the model&apos;s context.
          Can&apos;t call what you can&apos;t see.
        </p>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <p className="text-xs font-medium text-emerald-400">Takeaway</p>
          <p className="text-xs text-le-muted mt-1 leading-relaxed">
            Soft enforcement (prompt-level instructions) is not enough for
            production AI agents. Authorization needs to happen in code, before
            the model ever sees the tools. Treat the LLM like an untrusted
            client.
          </p>
        </div>
      </div>
    ),
  },
];

export default function BuilderInsights() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <motion.section
      id="insights"
      className="glass rounded-2xl p-8 space-y-6 scroll-mt-8"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-le-accent/10 text-le-accent">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M14.5 10a4.5 4.5 0 004.284-5.882c-.105-.324-.51-.391-.752-.15L15.34 6.66a.454.454 0 01-.493.11 3.01 3.01 0 01-1.618-1.616.455.455 0 01.11-.494l2.694-2.692c.24-.241.174-.647-.15-.752a4.5 4.5 0 00-5.873 4.575c.055.873-.128 1.808-.8 2.368l-7.23 6.024a2.724 2.724 0 103.837 3.837l6.024-7.23c.56-.672 1.495-.855 2.368-.8.096.007.193.01.291.01zM5 16a1 1 0 11-2 0 1 1 0 012 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Builder&apos;s Notes</h2>
          <p className="text-xs text-le-muted mt-0.5">
            Things we figured out the hard way while building this
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {cards.map((card, i) => {
          const isOpen = expandedId === card.id;

          return (
            <motion.div
              key={card.id}
              className="rounded-xl border border-le-border/50 bg-le-surface/60 overflow-hidden transition-colors duration-150 hover:border-le-border"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: i * 0.06,
                duration: 0.35,
                ease: [0.25, 1, 0.5, 1],
              }}
            >
              {/* Clickable header */}
              <button
                onClick={() => toggle(card.id)}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-left"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-4 w-4 shrink-0 text-le-muted transition-transform duration-200 ${
                    isOpen ? "rotate-90" : ""
                  }`}
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm font-medium text-le-text flex-1">
                  {card.title}
                </span>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${card.tagColor}`}
                >
                  {card.tag}
                </span>
              </button>

              {/* Expandable body */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-1 border-t border-le-border/30">
                      {card.content}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="flex items-center justify-center pt-2">
        <span className="text-[11px] text-le-muted/50">
          Built for the Auth0 hackathon -- these are real pain points, not hypotheticals
        </span>
      </div>
    </motion.section>
  );
}

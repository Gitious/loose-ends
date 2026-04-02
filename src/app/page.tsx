"use client";

import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.12,
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  }),
};

const features = [
  {
    icon: "\u{1F50D}",
    title: "Scan",
    description:
      "Connect your services and let the agent scan for dropped items across Gmail, Calendar, and GitHub.",
  },
  {
    icon: "\u{1F4CB}",
    title: "Prioritize",
    description:
      "Every loose end is ranked by urgency with color coding so you know what to tackle first.",
  },
  {
    icon: "\u2705",
    title: "Resolve",
    description:
      "Draft replies, create meeting agendas, and approve PRs — all from your phone.",
  },
];

export default function Home() {
  return (
    <div className="relative min-h-screen bg-le-void text-le-text overflow-hidden">
      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 text-center">
        {/* Glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-30"
          style={{
            background:
              "radial-gradient(circle, var(--le-accent-glow) 0%, transparent 70%)",
            filter: "blur(100px)",
          }}
        />

        <motion.p
          className="relative text-xs tracking-[0.25em] uppercase text-le-muted mb-4"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          AI Agent for Busy Humans
        </motion.p>

        <motion.h1
          className="relative text-5xl sm:text-6xl md:text-7xl font-bold leading-tight max-w-3xl"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={1}
        >
          Find every{" "}
          <span className="text-le-accent">loose end</span>
        </motion.h1>

        <motion.p
          className="relative mt-6 max-w-xl text-lg leading-relaxed text-le-muted"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={2}
        >
          Unreplied emails. Forgotten PR reviews. Meetings you&apos;re walking
          into blind. One scan across Gmail, Calendar, and GitHub — and nothing
          slips through again.
        </motion.p>

        <motion.div
          className="relative mt-10 flex flex-col sm:flex-row gap-4"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={3}
        >
          <a
            href="/api/auth/login"
            className="inline-flex items-center justify-center h-12 px-8 rounded-lg bg-le-accent text-le-void font-semibold text-sm tracking-wide transition-transform hover:scale-105 hover:shadow-[0_0_24px_rgba(108,140,255,0.35)]"
          >
            Get Started
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center h-12 px-8 rounded-lg border border-le-border text-le-text font-semibold text-sm tracking-wide transition-colors hover:border-le-accent hover:text-le-accent"
          >
            How It Works
          </a>
        </motion.div>
      </section>

      {/* ── How It Works ── */}
      <section
        id="how-it-works"
        className="relative max-w-5xl mx-auto px-6 pb-32"
      >
        <motion.h2
          className="text-3xl sm:text-4xl font-bold text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5 }}
        >
          How It Works
        </motion.h2>

        <div className="grid gap-6 sm:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              className="glass rounded-2xl p-8 flex flex-col items-start gap-4"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: i * 0.15, duration: 0.5 }}
            >
              <span className="text-3xl" role="img" aria-label={f.title}>
                {f.icon}
              </span>
              <h3 className="text-xl font-semibold">{f.title}</h3>
              <p className="text-le-muted leading-relaxed text-sm">
                {f.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-le-border py-8 text-center text-xs text-le-muted">
        Built with Auth0 Token Vault &bull; Authorized to Act Hackathon 2026
      </footer>
    </div>
  );
}

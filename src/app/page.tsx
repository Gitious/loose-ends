"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

const easeOutExpo: [number, number, number, number] = [0.22, 1, 0.36, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.13,
      duration: 0.7,
      ease: easeOutExpo,
    },
  }),
};

const features = [
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-6 w-6"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
        />
      </svg>
    ),
    title: "Scan",
    description:
      "Connect your services and let the agent scan for dropped items across Gmail, Calendar, and GitHub.",
  },
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-6 w-6"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-6L16.5 21m0 0L12 16.5m4.5 4.5V7.5"
        />
      </svg>
    ),
    title: "Prioritize",
    description:
      "Every loose end is ranked by urgency with color coding so you know what to tackle first.",
  },
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-6 w-6"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    title: "Resolve",
    description:
      "Draft replies, create meeting agendas, and approve PRs — all from one place.",
  },
];

const integrations = [
  { name: "Gmail", color: "#EA4335" },
  { name: "Calendar", color: "#e8a849" },
  { name: "GitHub", color: "#f0f0f0" },
];

export default function Home() {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.8], [1, 0.97]);

  return (
    <div className="relative min-h-screen bg-le-void text-le-text overflow-hidden">
      {/* ── Hero ── */}
      <motion.section
        ref={heroRef}
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="relative flex flex-col items-center justify-center min-h-screen px-6 text-center"
      >
        {/* Animated background glows */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, var(--le-accent-glow) 0%, transparent 65%)",
            filter: "blur(120px)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-[40%] left-[35%] -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-10"
          style={{
            background:
              "radial-gradient(circle, #e85450 0%, transparent 65%)",
            filter: "blur(100px)",
          }}
        />

        {/* Subtle grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(232,168,73,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(232,168,73,0.3) 1px, transparent 1px)`,
            backgroundSize: "64px 64px",
          }}
        />

        <motion.div
          className="relative flex items-center gap-2 mb-6"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-le-border/60 bg-le-surface/60 px-4 py-1.5 text-xs tracking-wide text-le-muted">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-le-green opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-le-green" />
            </span>
            AI Agent for Busy Humans
          </span>
        </motion.div>

        <motion.h1
          className="relative text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[1.05] max-w-4xl tracking-tight"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={1}
        >
          Find every{" "}
          <span className="relative">
            <span className="text-le-accent">loose end</span>
            <motion.span
              className="absolute -bottom-1 left-0 h-[3px] bg-le-accent rounded-full"
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ delay: 0.8, duration: 0.6, ease: easeOutExpo }}
            />
          </span>
        </motion.h1>

        <motion.p
          className="relative mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-le-muted"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={2}
        >
          Unreplied emails. Forgotten PR reviews. Meetings you&apos;re walking
          into blind. One scan across Gmail, Calendar, and GitHub — and nothing
          slips through again.
        </motion.p>

        {/* Integration badges */}
        <motion.div
          className="relative mt-6 flex items-center gap-3"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={2.5}
        >
          {integrations.map((svc) => (
            <span
              key={svc.name}
              className="flex items-center gap-1.5 rounded-full bg-le-surface/80 border border-le-border/40 px-3 py-1 text-xs text-le-muted"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: svc.color }}
              />
              {svc.name}
            </span>
          ))}
        </motion.div>

        <motion.div
          className="relative mt-10 flex flex-col sm:flex-row gap-4"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={3}
        >
          <a
            href="/auth/login"
            className="group inline-flex items-center justify-center h-12 px-8 rounded-xl bg-le-accent text-le-void font-semibold text-sm tracking-wide transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_0_32px_rgba(232,168,73,0.4)] active:scale-[0.98]"
          >
            Get Started
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5"
            >
              <path
                fillRule="evenodd"
                d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                clipRule="evenodd"
              />
            </svg>
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center h-12 px-8 rounded-xl border border-le-border text-le-text font-semibold text-sm tracking-wide transition-all duration-200 hover:border-le-accent/50 hover:text-le-accent hover:bg-le-accent/5"
          >
            How It Works
          </a>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8, duration: 0.6 }}
        >
          <span className="text-[10px] uppercase tracking-[0.2em] text-le-muted/50">
            Scroll
          </span>
          <motion.div
            className="h-8 w-[1px] bg-gradient-to-b from-le-muted/40 to-transparent"
            animate={{ scaleY: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      </motion.section>

      {/* ── How It Works ── */}
      <section
        id="how-it-works"
        className="relative max-w-5xl mx-auto px-6 pb-32"
      >
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            How It Works
          </h2>
          <p className="mt-3 text-le-muted text-sm max-w-md mx-auto">
            Three steps to never drop the ball again.
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              className="glass group rounded-2xl p-8 flex flex-col items-start gap-4 transition-all duration-300 hover:border-le-accent/30 hover:shadow-[0_0_40px_rgba(232,168,73,0.08)]"
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: i * 0.15, duration: 0.5, ease: easeOutExpo }}
            >
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-le-accent/10 text-le-accent transition-colors group-hover:bg-le-accent/15">
                {f.icon}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-le-accent/60">
                  0{i + 1}
                </span>
                <h3 className="text-xl font-semibold">{f.title}</h3>
              </div>
              <p className="text-le-muted leading-relaxed text-sm">
                {f.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Social proof / trust ── */}
      <section className="relative max-w-3xl mx-auto px-6 pb-32">
        <motion.div
          className="glass rounded-2xl p-8 sm:p-12 text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: easeOutExpo }}
        >
          <p className="text-lg sm:text-xl font-medium leading-relaxed text-le-text/90">
            &ldquo;I had 14 unresolved items across three services.
            <br className="hidden sm:block" />
            Loose Ends found them all in{" "}
            <span className="text-le-accent">under 30 seconds</span>.&rdquo;
          </p>
          <p className="mt-4 text-sm text-le-muted">
            — Built for the Auth0 &ldquo;Authorized to Act&rdquo; Hackathon
          </p>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-le-border/40 py-8 text-center">
        <div className="flex items-center justify-center gap-2 text-xs text-le-muted">
          <svg viewBox="0 0 32 32" className="h-4 w-4 opacity-50">
            <rect width="32" height="32" rx="8" fill="currentColor" />
          </svg>
          <span>
            Built with Auth0 Token Vault &bull; Authorized to Act Hackathon 2026
          </span>
        </div>
      </footer>
    </div>
  );
}

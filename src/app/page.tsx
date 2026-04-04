"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, useEffect, useState } from "react";

const easeOutExpo: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ── Floating service icon that orbits gently ── */
function FloatingIcon({ delay, radius, duration, children }: { delay: number; radius: number; duration: number; children: React.ReactNode }) {
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ top: "50%", left: "50%" }}
      animate={{
        x: [
          Math.cos(delay) * radius,
          Math.cos(delay + Math.PI / 2) * radius,
          Math.cos(delay + Math.PI) * radius,
          Math.cos(delay + (3 * Math.PI) / 2) * radius,
          Math.cos(delay + 2 * Math.PI) * radius,
        ],
        y: [
          Math.sin(delay) * radius * 0.5,
          Math.sin(delay + Math.PI / 2) * radius * 0.5,
          Math.sin(delay + Math.PI) * radius * 0.5,
          Math.sin(delay + (3 * Math.PI) / 2) * radius * 0.5,
          Math.sin(delay + 2 * Math.PI) * radius * 0.5,
        ],
        opacity: [0.15, 0.3, 0.15, 0.3, 0.15],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "linear",
      }}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-le-surface/60 border border-le-border/30 backdrop-blur-sm text-le-muted/50">
        {children}
      </div>
    </motion.div>
  );
}

/* ── Glowing particles that drift up from accent underline ── */
function GlowParticle({ delay }: { delay: number }) {
  return (
    <motion.span
      className="absolute bottom-0 h-1 w-1 rounded-full bg-le-accent"
      style={{ left: `${20 + Math.random() * 60}%` }}
      initial={{ opacity: 0, y: 0, scale: 0 }}
      animate={{
        opacity: [0, 0.8, 0],
        y: [0, -20 - Math.random() * 16],
        scale: [0, 1, 0.5],
      }}
      transition={{
        delay: 1.2 + delay,
        duration: 1.4 + Math.random() * 0.6,
        repeat: Infinity,
        repeatDelay: 2 + Math.random() * 3,
        ease: "easeOut",
      }}
    />
  );
}

/* ── Parallax wrapper — moves children at a different speed ── */
function ParallaxLayer({ speed, children, className }: { speed: number; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    function handleScroll() {
      setOffset(window.scrollY * speed);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [speed]);

  return (
    <div ref={ref} className={className} style={{ transform: `translateY(${offset}px)` }}>
      {children}
    </div>
  );
}

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
    title: "Scan Securely",
    description:
      "Connect your services via Auth0 Token Vault. The agent scans Gmail, Calendar, GitHub, and Slack without ever seeing your passwords.",
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
      "Every loose end is ranked by priority with smart scoring so you know what to tackle first.",
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
      "Draft replies, create meeting agendas, and approve PRs. All from one place.",
  },
];

const integrations = [
  { name: "Gmail", color: "#EA4335" },
  { name: "Calendar", color: "#e8a849" },
  { name: "GitHub", color: "#f0f0f0" },
  { name: "Slack", color: "#4A154B" },
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
        {/* Atmospheric glows — layered for depth with parallax */}
        <ParallaxLayer speed={-0.08} className="pointer-events-none absolute inset-0">
          <div
            aria-hidden
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full opacity-15"
            style={{
              background: "radial-gradient(ellipse 60% 50%, var(--le-accent-glow) 0%, transparent 70%)",
              filter: "blur(100px)",
            }}
          />
        </ParallaxLayer>
        <ParallaxLayer speed={-0.15} className="pointer-events-none absolute inset-0">
          <div
            aria-hidden
            className="absolute top-[55%] left-[30%] -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-[0.07]"
            style={{
              background: "radial-gradient(circle, #e85450 0%, transparent 60%)",
              filter: "blur(80px)",
            }}
          />
        </ParallaxLayer>
        <ParallaxLayer speed={-0.12} className="pointer-events-none absolute inset-0">
          <div
            aria-hidden
            className="absolute top-[35%] right-[20%] w-[300px] h-[300px] rounded-full opacity-[0.05]"
            style={{
              background: "radial-gradient(circle, var(--le-accent) 0%, transparent 60%)",
              filter: "blur(60px)",
            }}
          />
        </ParallaxLayer>

        {/* Subtle radial grid — perspective depth */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, rgba(232,168,73,0.4) 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />

        {/* Orbital rings */}
        <div aria-hidden className="orbital-ring w-[500px] h-[500px] opacity-40" style={{ animationDuration: "25s" }} />
        <div aria-hidden className="orbital-ring w-[700px] h-[700px] opacity-20" style={{ animationDuration: "40s", animationDirection: "reverse" }} />

        {/* Floating service icons */}
        <FloatingIcon delay={0} radius={320} duration={22}>
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
            <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
          </svg>
        </FloatingIcon>
        <FloatingIcon delay={Math.PI / 2} radius={350} duration={26}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
          </svg>
        </FloatingIcon>
        <FloatingIcon delay={Math.PI} radius={290} duration={20}>
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        </FloatingIcon>
        <FloatingIcon delay={(3 * Math.PI) / 2} radius={370} duration={28}>
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z" />
          </svg>
        </FloatingIcon>

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
          className="relative font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-normal leading-[1.05] max-w-4xl"
          style={{ letterSpacing: "0.02em" }}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={1}
        >
          Find every{" "}
          <span className="relative inline-block">
            <span
              className="text-le-accent"
              style={{
                textShadow: "0 0 30px rgba(232, 168, 73, 0.3), 0 0 60px rgba(232, 168, 73, 0.1)",
              }}
            >
              loose end
            </span>
            {/* Glowing underline */}
            <motion.span
              className="absolute -bottom-1 left-0 h-[3px] rounded-full"
              style={{
                background: "linear-gradient(90deg, var(--le-accent-glow), var(--le-accent-soft), var(--le-accent-glow))",
                boxShadow: "0 0 12px rgba(232, 168, 73, 0.5), 0 0 30px rgba(232, 168, 73, 0.2)",
              }}
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ delay: 0.8, duration: 0.6, ease: easeOutExpo }}
            />
            {/* Drifting particles above the underline */}
            {[0, 0.4, 0.8, 1.2, 1.6, 2.0].map((d, i) => (
              <GlowParticle key={i} delay={d} />
            ))}
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
          into blind. Unanswered Slack DMs. One scan across Gmail, Calendar,
          GitHub, and Slack. Nothing slips through again.
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
            href="/auth/login?returnTo=/dashboard"
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
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight">
            How It Works
          </h2>
          <p className="mt-3 text-le-muted text-sm max-w-md mx-auto">
            Three steps to never drop the ball again.
          </p>
        </motion.div>

        <div className="relative">
          {/* Connecting thread between cards — the "loose end" metaphor */}
          <svg
            className="pointer-events-none absolute top-0 left-0 w-full h-full hidden sm:block"
            aria-hidden
            preserveAspectRatio="none"
          >
            <motion.path
              d="M 16.5% 50% C 28% 50%, 38% 50%, 50% 50% S 72% 50%, 83.5% 50%"
              fill="none"
              stroke="var(--le-accent)"
              strokeWidth="1"
              strokeOpacity="0.15"
              strokeDasharray="4 6"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5, duration: 1.2, ease: easeOutExpo }}
            />
            {/* Accent dots at connection points */}
            <motion.circle
              cx="33.3%"
              cy="50%"
              r="3"
              fill="var(--le-accent)"
              fillOpacity="0.25"
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.9, duration: 0.3 }}
            />
            <motion.circle
              cx="66.6%"
              cy="50%"
              r="3"
              fill="var(--le-accent)"
              fillOpacity="0.25"
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 1.1, duration: 0.3 }}
            />
          </svg>

          <div className="grid gap-6 sm:grid-cols-3 relative z-10">
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
        </div>
      </section>

      {/* ── What's under the hood ── */}
      <section className="relative max-w-3xl mx-auto px-6 pb-32">
        <motion.div
          className="glass rounded-2xl p-8 sm:p-12 text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: easeOutExpo }}
        >
          <p className="text-lg sm:text-xl font-medium leading-relaxed text-le-text/90">
            Real API calls to Gmail, Calendar, GitHub, and Slack.
            <br className="hidden sm:block" />
            Tokens managed by{" "}
            <span className="text-le-accent">Auth0 Token Vault</span>.
            <br className="hidden sm:block" />
            Permissions enforced by{" "}
            <span className="text-le-accent">Auth0 FGA</span>.
            <br className="hidden sm:block" />
            Sensitive actions approved via{" "}
            <span className="text-le-accent">CIBA + Guardian</span>.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {[
              "Next.js",
              "Anthropic Claude",
              "Auth0",
              "Token Vault",
              "FGA",
              "CIBA",
            ].map((t) => (
              <span
                key={t}
                className="rounded-full border border-le-border/40 bg-le-surface/60 px-3 py-1 text-xs text-le-muted"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="mt-6">
            <a
              href="/settings#insights"
              className="inline-flex items-center gap-1.5 text-sm text-le-accent/80 transition-colors hover:text-le-accent"
            >
              Read our builder&apos;s notes
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-le-border/40 py-8 text-center">
        <div className="flex items-center justify-center gap-2 text-xs text-le-muted">
          <svg viewBox="0 0 32 32" className="h-4 w-4 opacity-50">
            <rect width="32" height="32" rx="8" fill="currentColor" />
          </svg>
          <span>
            Built by Varun Menon. Secured by Auth0 Token Vault + FGA.
          </span>
        </div>
      </footer>
    </div>
  );
}

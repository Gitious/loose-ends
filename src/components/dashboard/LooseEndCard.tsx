"use client";

import { motion } from "framer-motion";
import type { LooseEnd } from "@/lib/types";
import Badge from "@/components/ui/Badge";

const typeIcons: Record<
  LooseEnd["type"],
  { label: string; icon: React.ReactNode }
> = {
  email: {
    label: "Email",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.161V6a2 2 0 00-2-2H3z" />
        <path d="M19 8.839l-7.556 3.778a2.75 2.75 0 01-2.466-.022L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
      </svg>
    ),
  },
  calendar: {
    label: "Calendar",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path
          fillRule="evenodd"
          d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  github: {
    label: "GitHub",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path
          fillRule="evenodd"
          d="M6.28 5.22a.75.75 0 010 1.06L2.56 10l3.72 3.72a.75.75 0 01-1.06 1.06L.97 10.53a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0zm7.44 0a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L17.44 10l-3.72-3.72a.75.75 0 010-1.06zM11.377 2.011a.75.75 0 01.612.867l-2.5 14.5a.75.75 0 01-1.478-.255l2.5-14.5a.75.75 0 01.866-.612z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
};

const URGENCY_BAR: Record<string, string> = {
  red: "bg-le-red",
  yellow: "bg-le-yellow",
  green: "bg-le-green",
};

export default function LooseEndCard({
  item,
  index,
}: {
  item: LooseEnd;
  index: number;
}) {
  const { icon, label } = typeIcons[item.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}
      className="glass group relative overflow-hidden rounded-xl transition-all duration-200 hover:border-le-accent/30 hover:shadow-[0_0_32px_rgba(108,140,255,0.06)]"
    >
      {/* Urgency color bar on left edge */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-[3px] ${URGENCY_BAR[item.urgency] ?? "bg-le-muted"}`}
      />

      <div className="flex items-start gap-3 p-4 pl-5">
        {/* Type icon */}
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-le-elevated text-le-muted">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-le-text">
              {item.title}
            </h3>
            <Badge urgency={item.urgency} />
          </div>

          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-le-muted">
            {item.description}
          </p>

          <div className="mt-2 flex items-center gap-3">
            <span className="text-[11px] text-le-muted/60">{label}</span>
            <span className="text-le-border">|</span>
            <span className="text-[11px] text-le-muted/60">{item.age}</span>
          </div>
        </div>

        {/* Action button (appears on hover) */}
        <button className="shrink-0 rounded-lg bg-le-accent/10 px-3 py-1.5 text-xs font-medium text-le-accent opacity-0 transition-all duration-200 hover:bg-le-accent/20 group-hover:opacity-100">
          {item.actionLabel}
        </button>
      </div>
    </motion.div>
  );
}

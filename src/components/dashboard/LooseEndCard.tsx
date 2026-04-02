"use client";

import { motion } from "framer-motion";
import type { LooseEnd } from "@/lib/types";
import Badge from "@/components/ui/Badge";

const typeIcons: Record<LooseEnd["type"], string> = {
  email: "\u{1F4E7}",
  calendar: "\u{1F4C5}",
  github: "\u{1F500}",
};

export default function LooseEndCard({
  item,
  index,
}: {
  item: LooseEnd;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}
      className="glass group relative rounded-xl p-4 transition-colors hover:border-le-accent/30"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg" aria-hidden="true">
          {typeIcons[item.type]}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-le-text">
              {item.title}
            </h3>
            <Badge urgency={item.urgency} />
          </div>

          <p className="mt-1 line-clamp-2 text-xs text-le-muted">
            {item.description}
          </p>

          <span className="mt-2 inline-block text-xs text-le-muted/70">
            {item.age}
          </span>
        </div>
      </div>

      <button
        className="absolute bottom-3 right-3 rounded-lg bg-le-accent/10 px-3 py-1 text-xs font-medium text-le-accent opacity-0 transition-opacity group-hover:opacity-100"
      >
        {item.actionLabel}
      </button>
    </motion.div>
  );
}

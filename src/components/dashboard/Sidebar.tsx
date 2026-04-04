"use client";

import { motion } from "framer-motion";
import type { LooseEnd } from "@/lib/types";
import ThreatLevel from "./ThreatLevel";
import AgentInsight from "./AgentInsight";
import RecentActivity from "./RecentActivity";
import DigestButton from "./DigestButton";
export default function Sidebar({
  items,
  junkCount,
}: {
  items: LooseEnd[];
  junkCount: number;
}) {
  return (
    <motion.aside
      className="hidden w-72 shrink-0 flex-col gap-5 overflow-y-auto lg:flex"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
    >
      <ThreatLevel items={items} junkCount={junkCount} />
      <DigestButton items={items} junkCount={junkCount} />
      <RecentActivity />
      <AgentInsight />
    </motion.aside>
  );
}

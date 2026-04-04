"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { LooseEnd, JunkEmail } from "@/lib/types";

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const VISIBILITY_THROTTLE = 2 * 60 * 1000; // 2 minutes
const AUTONOMOUS_JUNK_THRESHOLD = 2; // min junk emails to trigger autonomous cleanup
const AUTONOMOUS_COOLDOWN = 15 * 60 * 1000; // 15 min cooldown between autonomous CIBA pushes

interface ScanResult {
  looseEnds: LooseEnd[];
  junkEmails: JunkEmail[];
  isScanning: boolean;
  errors: Record<string, string>;
  services: Record<string, boolean>;
  servicesLoaded: boolean;
  denied: string[];
  scan: (only?: string) => Promise<void>;
  lastScannedAt: Date | null;
  removeItem: (id: string) => void;
  clearJunk: () => void;
  rescueJunkEmail: (junkEmail: JunkEmail) => void;
  autonomousStatus: "idle" | "pending" | "done";
}

export function useScan(): ScanResult {
  const [looseEnds, setLooseEnds] = useState<LooseEnd[]>([]);
  const [junkEmails, setJunkEmails] = useState<JunkEmail[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [services, setServices] = useState<Record<string, boolean>>({});
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [denied, setDenied] = useState<string[]>([]);
  const [lastScannedAt, setLastScannedAt] = useState<Date | null>(null);
  const [autonomousStatus, setAutonomousStatus] = useState<"idle" | "pending" | "done">("idle");
  const hasFetchedStatus = useRef(false);
  const isScanningRef = useRef(false);
  const lastScanTimeRef = useRef(0);
  const autonomousInFlightRef = useRef(false);

  // Fetch connection status immediately on mount (fast, no scanning)
  useEffect(() => {
    if (hasFetchedStatus.current) return;
    hasFetchedStatus.current = true;
    fetch("/api/accounts/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setServices(data);
        setServicesLoaded(true);
      })
      .catch(() => setServicesLoaded(true));
  }, []);

  const scan = useCallback(async (only?: string) => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    setIsScanning(true);
    setErrors({});
    try {
      const body = only ? JSON.stringify({ only }) : undefined;
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      if (!res.ok) throw new Error("Scan failed");
      const data = await res.json();
      if (only) {
        // Merge per-service results into existing state
        const newItems: any[] = data.looseEnds || [];
        setLooseEnds((prev) => {
          const typeMap: Record<string, string> = { email: "email", calendar: "calendar", github: "github", slack: "slack" };
          const filtered = prev.filter((le) => le.type !== typeMap[only]);
          return [...filtered, ...newItems];
        });
        if (only === "email") setJunkEmails(data.junkEmails || []);
      } else {
        setLooseEnds(data.looseEnds || []);
        setJunkEmails(data.junkEmails || []);
      }
      setErrors(data.errors || {});
      if (data.services) setServices(data.services);
      setDenied(data.denied || []);
      setLastScannedAt(new Date());
      lastScanTimeRef.current = Date.now();
      // Cache results so navigation doesn't trigger rescan
      sessionStorage.setItem("le-last-scan", String(Date.now()));
      if (!only) { try { sessionStorage.setItem("le-scan-results", JSON.stringify(data)); } catch {} }
    } catch (err) {
      setErrors({ scan: String(err) });
    } finally {
      setIsScanning(false);
      isScanningRef.current = false;
    }
  }, []);

  // Auto-scan on mount only if no recent scan (uses sessionStorage to survive remounts)
  useEffect(() => {
    const lastScan = Number(sessionStorage.getItem("le-last-scan") || "0");
    if (Date.now() - lastScan > VISIBILITY_THROTTLE) {
      scan();
    } else {
      // Restore cached results if available
      try {
        const cached = sessionStorage.getItem("le-scan-results");
        if (cached) {
          const data = JSON.parse(cached);
          setLooseEnds(data.looseEnds || []);
          setJunkEmails(data.junkEmails || []);
          if (data.services) setServices(data.services);
          setDenied(data.denied || []);
          setLastScannedAt(new Date(lastScan));
          lastScanTimeRef.current = lastScan;
        }
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autonomous junk cleanup: when enough junk accumulates, trigger CIBA push
  useEffect(() => {
    console.log(`[Autonomous] Junk check: ${junkEmails.length} emails, threshold: ${AUTONOMOUS_JUNK_THRESHOLD}, inFlight: ${autonomousInFlightRef.current}`);
    if (junkEmails.length < AUTONOMOUS_JUNK_THRESHOLD) return;
    if (autonomousInFlightRef.current) return;

    // Check cooldown
    const lastAutonomous = Number(sessionStorage.getItem("le-autonomous-last") || "0");
    if (Date.now() - lastAutonomous < AUTONOMOUS_COOLDOWN) {
      console.log(`[Autonomous] Cooldown active, ${Math.round((AUTONOMOUS_COOLDOWN - (Date.now() - lastAutonomous)) / 1000)}s remaining`);
      return;
    }
    console.log("[Autonomous] Threshold met, firing CIBA cleanup");

    autonomousInFlightRef.current = true;
    setAutonomousStatus("pending");
    sessionStorage.setItem("le-autonomous-last", String(Date.now()));

    // Fire and forget — the server blocks until CIBA approval
    fetch("/api/autonomous/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageIds: junkEmails.slice(0, 2).map((j) => j.messageId),
        senders: junkEmails.slice(0, 2).map((j) => j.from),
      }),
    })
      .then((r) => r.json())
      .then((result) => {
        if (result.approved && result.success) {
          setJunkEmails([]);
          setAutonomousStatus("done");
          // Reset to idle after 5 seconds
          setTimeout(() => setAutonomousStatus("idle"), 5000);
        } else {
          setAutonomousStatus("idle");
        }
      })
      .catch(() => setAutonomousStatus("idle"))
      .finally(() => {
        autonomousInFlightRef.current = false;
      });
  }, [junkEmails]);

  // Poll every 5 minutes + scan on tab regain focus (throttled to 2 min)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isScanningRef.current) {
        scan();
      }
    }, POLL_INTERVAL);

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (isScanningRef.current) return;
      if (Date.now() - lastScanTimeRef.current < VISIBILITY_THROTTLE) return;
      scan();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [scan]);

  const removeItem = useCallback((id: string) => {
    setLooseEnds((prev) => prev.filter((le) => le.id !== id));
  }, []);

  const clearJunk = useCallback(() => {
    setJunkEmails([]);
  }, []);

  const rescueJunkEmail = useCallback((junkEmail: JunkEmail) => {
    setJunkEmails((prev) => prev.filter((j) => j.id !== junkEmail.id));
    const rescued: LooseEnd = {
      id: junkEmail.id,
      type: "email",
      title: junkEmail.subject,
      description: `From ${junkEmail.from} — rescued from junk`,
      urgency: "green",
      age: "today",
      source: junkEmail.from,
      actionLabel: "Draft Reply",
      meta: {
        threadId: "",
        messageId: junkEmail.messageId,
        from: junkEmail.from,
        subject: junkEmail.subject,
      },
      actions: [
        { id: "reply", label: "Draft Reply", variant: "primary" },
        { id: "trash", label: "Trash", variant: "secondary" },
        { id: "open", label: "Open", variant: "ghost" },
      ],
    };
    setLooseEnds((prev) => [...prev, rescued]);
  }, []);

  return { looseEnds, junkEmails, isScanning, errors, services, servicesLoaded, denied, scan, lastScannedAt, removeItem, clearJunk, rescueJunkEmail, autonomousStatus };
}

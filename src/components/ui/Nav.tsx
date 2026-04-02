"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Logo() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="h-7 w-7"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="var(--le-accent)" fillOpacity="0.12" />
      <path
        d="M10 11c0-1.5 1.2-2.5 2.5-2.5S15 9.5 15 11c0 3-5 5-5 9h7"
        stroke="var(--le-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="14" r="1.5" fill="var(--le-red)" />
      <path
        d="M19 19c0-1 .8-2 2-2s2 1 2 2c0 2-3 3.5-3 6"
        stroke="var(--le-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="glass sticky top-0 z-50 flex items-center justify-between px-6 h-14">
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
      >
        <Logo />
        <span className="text-base font-semibold tracking-tight text-le-text">
          Loose Ends
        </span>
      </Link>

      <div className="flex items-center gap-1">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`relative rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 ${
                isActive
                  ? "text-le-text bg-le-elevated/60"
                  : "text-le-muted hover:text-le-text hover:bg-le-elevated/30"
              }`}
            >
              {link.label}
              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-4 rounded-full bg-le-accent" />
              )}
            </Link>
          );
        })}
        <span className="mx-2 h-4 w-px bg-le-border/60" />
        <a
          href="/auth/logout"
          className="rounded-lg px-3 py-1.5 text-sm text-le-muted transition-colors duration-150 hover:text-le-red hover:bg-le-red/5"
        >
          Logout
        </a>
      </div>
    </nav>
  );
}

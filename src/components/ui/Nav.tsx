import Link from "next/link";

export default function Nav() {
  return (
    <nav className="glass sticky top-0 z-50 flex items-center justify-between px-6 py-3">
      <Link
        href="/"
        className="text-lg font-semibold tracking-tight text-le-accent"
      >
        Loose Ends
      </Link>
      <div className="flex items-center gap-5">
        <Link
          href="/settings"
          className="text-sm text-le-muted transition-colors hover:text-le-text"
        >
          Settings
        </Link>
        <a
          href="/api/auth/logout"
          className="text-sm text-le-muted transition-colors hover:text-le-text"
        >
          Logout
        </a>
      </div>
    </nav>
  );
}

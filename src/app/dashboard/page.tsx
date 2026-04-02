import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth0";
import ChatPanel from "@/components/chat/ChatPanel";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/api/auth/login");

  const user = session.user;
  const name = typeof user?.name === "string" ? user.name : "";
  const firstName = name.split(" ")[0] || "there";

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-le-text">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-le-muted">
          Let&apos;s find everything you&apos;ve dropped.
        </p>
      </div>

      {/* Chat */}
      <div className="min-h-0 flex-1">
        <ChatPanel />
      </div>
    </div>
  );
}

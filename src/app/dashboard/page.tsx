import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth0";
import ChatPanel from "@/components/chat/ChatPanel";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const user = session.user;
  const firstName =
    (user?.name as string | undefined)?.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold text-le-text">
        Welcome back, {firstName}
      </h1>
      <p className="mb-6 text-sm text-le-muted">
        Let&apos;s find everything you&apos;ve dropped.
      </p>
      <div className="min-h-0 flex-1">
        <ChatPanel />
      </div>
    </div>
  );
}

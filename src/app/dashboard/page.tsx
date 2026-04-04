import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth0";
import DashboardShell from "@/components/dashboard/DashboardShell";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const user = session.user;
  const name = typeof user?.name === "string" ? user.name : "";
  const firstName = name.split(" ")[0] || "there";

  return <DashboardShell firstName={firstName} />;
}

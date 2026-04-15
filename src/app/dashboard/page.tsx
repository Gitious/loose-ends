import { redirect } from "next/navigation";
import { auth0, getSession } from "@/lib/auth0";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { buildGoogleConnectUrl, GOOGLE_CONNECTION } from "@/lib/google-scopes";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ google_connect_tried?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const user = session.user;
  const name = typeof user?.name === "string" ? user.name : "";
  const firstName = name.split(" ")[0] || "there";

  // Auto-heal: if the user logged in via Google but Token Vault has no
  // Google grant (primary login scopes don't populate Token Vault), send
  // them through the Connected Accounts flow once to capture Gmail/Calendar
  // scopes. The `google_connect_tried` query param prevents a redirect loop
  // if the user denies consent.
  const { google_connect_tried } = await searchParams;
  const primaryGoogle = typeof user?.sub === "string" && user.sub.startsWith(`${GOOGLE_CONNECTION}|`);
  if (primaryGoogle && !google_connect_tried) {
    const hasGoogleTokenVault = await auth0
      .getAccessTokenForConnection({ connection: GOOGLE_CONNECTION })
      .then(() => true)
      .catch(() => false);
    if (!hasGoogleTokenVault) {
      redirect(buildGoogleConnectUrl("/dashboard?google_connect_tried=1"));
    }
  }

  return <DashboardShell firstName={firstName} />;
}

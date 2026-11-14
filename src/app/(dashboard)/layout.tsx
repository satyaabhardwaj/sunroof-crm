import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/backend-proxy";
import { SetupNotice } from "@/components/layout/setup-notice";
import { DashboardShell } from "@/components/layout/dashboard-shell";
export const dynamic = "force-dynamic";
/** Signed in with the CRM's own login (FastAPI session cookie). */
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser((await cookies()).toString());
  if (user.status === "offline") return <SetupNotice />;
  if (user.status === "signed-out") redirect("/login");
  if (user.me.mfa_enrollment_required) redirect("/security");
  return (
    <DashboardShell email={user.me.email || user.me.id}>
      {children}
    </DashboardShell>
  );
}

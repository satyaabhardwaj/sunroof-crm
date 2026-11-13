import { auth } from "@clerk/nextjs/server";
import { SetupNotice } from "@/components/layout/setup-notice";
import { DashboardShell } from "@/components/layout/dashboard-shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SetupNotice />;
  await auth.protect();
  return <DashboardShell>{children}</DashboardShell>;
}

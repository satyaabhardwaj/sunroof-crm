import { SignUp } from "@clerk/nextjs";
import { SetupNotice } from "@/components/layout/setup-notice";
export default function Page() {
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignUp routing="hash" />
    </main>
  ) : (
    <SetupNotice />
  );
}

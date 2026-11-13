import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/layout/providers";
import "@/components/deals/workflow/styles/tokens.css";
import "@/components/deals/workflow/styles/look.css";
import "@/components/deals/workflow/styles/design.css";
import "@/components/deals/workflow/styles/accounts.css";
import "@/components/deals/workflow/styles/measurement.css";
import "@/components/deals/workflow/styles/departments.css";
import "./globals.css";
export const metadata = {
  title: "SUNROOOF CRM",
  description: "Post-design to dispatch",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const content = (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
    <ClerkProvider>{content}</ClerkProvider>
  ) : (
    content
  );
}

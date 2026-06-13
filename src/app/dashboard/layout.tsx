import type { ReactNode } from "react";
import type { Viewport } from "next";

import { requireAuthenticatedUser } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f8fafb",
  viewportFit: "cover",
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedUser();

  return <div data-dashboard-shell>{children}</div>;
}

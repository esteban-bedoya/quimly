import type { ReactNode } from "react";

import { requireAuthenticatedUser } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedUser();

  return children;
}

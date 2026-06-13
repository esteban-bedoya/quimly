import type { ReactNode } from "react";
import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#12110F",
  viewportFit: "cover",
};

export default function PublicFormSegmentLayout({ children }: { children: ReactNode }) {
  return children;
}

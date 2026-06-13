import type { ReactNode } from "react";
import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#12110F",
};

export default function PublicFormSegmentLayout({ children }: { children: ReactNode }) {
  return children;
}

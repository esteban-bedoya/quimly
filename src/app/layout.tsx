import "./globals.css";

import type { Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "Quimly",
  description: "Plataforma sanitaria para operaciones gastronómicas.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

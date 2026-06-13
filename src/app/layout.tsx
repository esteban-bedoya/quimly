import "./globals.css";

import type { Viewport } from "next";

export const metadata = {
  title: "Quimly",
  description: "Plataforma moderna para operaciones quimicas.",
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
      <body>{children}</body>
    </html>
  );
}

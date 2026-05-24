import "./globals.css";

export const metadata = {
  title: "Quimly",
  description: "Plataforma moderna para operaciones quimicas.",
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

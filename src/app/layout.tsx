import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "X Agent",
  description: "A local, personal X reply voice-calibration workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

/** Root layout: html/body only. Booths style themselves through their own layout + BoothShell. */
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { CurtainProvider } from "@/components/shared/PageCurtain";
import "./globals.css";

export const metadata: Metadata = {
  title: "Booth Lab",
  description: "A small lab of niche web photobooths. Everything runs on your device.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e0e0f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CurtainProvider>{children}</CurtainProvider>
      </body>
    </html>
  );
}

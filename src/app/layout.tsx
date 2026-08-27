import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { DEFAULT_BUSINESS_NAME, posTitle } from "@/lib/branding";

export const metadata: Metadata = {
  title: posTitle(),
  description: `Timed game-session POS for ${DEFAULT_BUSINESS_NAME}`,
  manifest: "/manifest.json"
};

export const viewport: Viewport = {
  themeColor: "#187d8f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}

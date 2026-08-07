import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { env } from "@/lib/env";
import { imageUrl } from "@/lib/image-url";
import { getShop } from "@/lib/shop";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  // The uploaded shop logo doubles as the favicon; fall back to the bundled
  // icon when no logo is set or the database is unreachable (e.g. at build).
  let iconUrl = "/favicon.ico";
  let shopName = "OpenVend";
  try {
    const shop = await getShop();
    if (shop) {
      shopName = shop.name;
      if (shop.logoPath !== null) {
        iconUrl = imageUrl(shop.logoPath);
      }
    }
  } catch {
    // Keep defaults.
  }

  return {
    metadataBase: new URL(env().APP_URL),
    title: {
      default: shopName,
      template: "%s",
    },
    description: "Self-hosted shop for digital goods with instant delivery.",
    icons: { icon: iconUrl },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import Script from "next/script";
import type { ReactNode } from "react";

import { AnalyticsTracker } from "@/components/storefront/analytics-tracker";
import { getShop } from "@/lib/shop";
import { imageUrl } from "@/lib/image-url";

export const dynamic = "force-dynamic";

const LOGO_SIZE_PX = 28;
const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

interface StorefrontLayoutProps {
  children: ReactNode;
}

export default async function StorefrontLayout({ children }: StorefrontLayoutProps) {
  const shop = await getShop();
  if (!shop) {
    redirect("/setup");
  }

  const gaMeasurementId =
    shop.gaMeasurementId !== null && GA_MEASUREMENT_ID_PATTERN.test(shop.gaMeasurementId)
      ? shop.gaMeasurementId
      : null;

  return (
    <div className="flex min-h-screen flex-col">
      <AnalyticsTracker />
      {gaMeasurementId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaMeasurementId}');`}
          </Script>
        </>
      ) : null}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            {shop.logoPath ? (
              <Image
                src={imageUrl(shop.logoPath)}
                alt=""
                width={LOGO_SIZE_PX}
                height={LOGO_SIZE_PX}
                className="size-7 rounded"
              />
            ) : null}
            {shop.name}
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/" className="transition-colors hover:text-foreground">
              Products
            </Link>
            {shop.termsOfService ? (
              <Link href="/terms" className="transition-colors hover:text-foreground">
                Terms
              </Link>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} {shop.name}
          </p>
          <p>
            Powered by{" "}
            <a
              href="https://github.com/topics/openvend"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              OpenVend
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

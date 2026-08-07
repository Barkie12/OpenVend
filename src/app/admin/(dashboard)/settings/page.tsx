import { Bell, ChartLine, CreditCard, Mail, ShieldCheck, Store, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { AnalyticsSettingsForm } from "@/components/admin/settings/analytics-settings-form";
import { EmailSettingsForm } from "@/components/admin/settings/email-settings-form";
import { GeneralSettingsForm } from "@/components/admin/settings/general-settings-form";
import { NotificationSettingsForm } from "@/components/admin/settings/notification-settings-form";
import { PaymentSettingsForm } from "@/components/admin/settings/payment-settings-form";
import { SecuritySettingsForm } from "@/components/admin/settings/security-settings-form";
import { TwoFactorCard } from "@/components/admin/two-factor-card";
import { shopEmailProvider } from "@/lib/email";
import { env } from "@/lib/env";
import { requireAdminSession } from "@/lib/session";
import { SUPPORTED_CURRENCIES, requireShop } from "@/lib/shop";
import { cn } from "@/lib/utils";

const SETTINGS_SECTIONS = [
  "general",
  "payments",
  "email",
  "notifications",
  "analytics",
  "security",
] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

interface SectionNavItem {
  value: SettingsSection;
  label: string;
  icon: LucideIcon;
}

const SECTION_NAV: readonly SectionNavItem[] = [
  { value: "general", label: "General", icon: Store },
  { value: "payments", label: "Payments", icon: CreditCard },
  { value: "email", label: "Email", icon: Mail },
  { value: "notifications", label: "Notifications", icon: Bell },
  { value: "analytics", label: "Analytics", icon: ChartLine },
  { value: "security", label: "Security", icon: ShieldCheck },
];

function isSettingsSection(value: string): value is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

export default async function AdminSettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const adminSession = await requireAdminSession();
  const shop = await requireShop();
  const appUrl = env().APP_URL;

  const resolvedSearchParams = await searchParams;
  const sectionParam =
    typeof resolvedSearchParams.section === "string" ? resolvedSearchParams.section : "general";
  const activeSection: SettingsSection = isSettingsSection(sectionParam) ? sectionParam : "general";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your shop, payments and integrations.</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-48 lg:flex-col">
          {SECTION_NAV.map((navItem) => {
            const NavIcon = navItem.icon;
            const isActive = navItem.value === activeSection;
            return (
              <Link
                key={navItem.value}
                href={navItem.value === "general" ? "/admin/settings" : `/admin/settings?section=${navItem.value}`}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <NavIcon className="size-4" />
                {navItem.label}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {activeSection === "general" ? (
            <GeneralSettingsForm
              name={shop.name}
              description={shop.description ?? ""}
              currency={shop.currency}
              termsOfService={shop.termsOfService ?? ""}
              logoPath={shop.logoPath}
              currencies={SUPPORTED_CURRENCIES}
            />
          ) : null}

          {activeSection === "analytics" ? (
            <AnalyticsSettingsForm gaMeasurementId={shop.gaMeasurementId ?? ""} />
          ) : null}

          {activeSection === "payments" ? (
            <PaymentSettingsForm
              stripeEnabled={shop.stripeEnabled}
              stripeKeyConfigured={shop.stripeSecretKeyEnc !== null}
              stripeWebhookConfigured={shop.stripeWebhookSecretEnc !== null}
              stripePublishableKey={shop.stripePublishableKey ?? ""}
              nowpaymentsEnabled={shop.nowpaymentsEnabled}
              nowpaymentsKeyConfigured={shop.nowpaymentsApiKeyEnc !== null}
              nowpaymentsIpnConfigured={shop.nowpaymentsIpnSecretEnc !== null}
              stripeWebhookUrl={`${appUrl}/api/webhooks/stripe`}
              nowpaymentsIpnUrl={`${appUrl}/api/webhooks/nowpayments`}
              paypalffEnabled={shop.paypalffEnabled}
              paypalEmail={shop.paypalEmail ?? ""}
            />
          ) : null}

          {activeSection === "email" ? (
            <EmailSettingsForm
              emailProvider={shopEmailProvider(shop)}
              smtpHost={shop.smtpHost ?? ""}
              smtpPort={shop.smtpPort === null ? "" : String(shop.smtpPort)}
              smtpSecure={shop.smtpSecure}
              smtpUser={shop.smtpUser ?? ""}
              smtpFrom={shop.smtpFrom ?? ""}
              smtpPasswordConfigured={shop.smtpPasswordEnc !== null}
              resendConfigured={shop.resendApiKeyEnc !== null}
              brevoConfigured={shop.brevoApiKeyEnc !== null}
            />
          ) : null}

          {activeSection === "notifications" ? (
            <NotificationSettingsForm discordWebhookUrl={shop.discordWebhookUrl ?? ""} />
          ) : null}

          {activeSection === "security" ? (
            <>
              <SecuritySettingsForm
                turnstileSiteKey={shop.turnstileSiteKey ?? ""}
                secretConfigured={shop.turnstileSecretKeyEnc !== null}
              />
              <TwoFactorCard initialEnabled={adminSession.user.twoFactorEnabled === true} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

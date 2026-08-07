"use client";

import { Bitcoin, CreditCard, HandCoins } from "lucide-react";
import Image from "next/image";

import { updatePaymentSettings } from "@/app/admin/(dashboard)/settings/actions";
import { SectionHeader } from "@/components/admin/settings/section-header";
import { useActionSubmit } from "@/components/admin/use-action-submit";
import { CopyButton } from "@/components/storefront/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface SecretInputProps {
  id: string;
  name: string;
  label: string;
  isConfigured: boolean;
}

function SecretInput({ id, name, label, isConfigured }: SecretInputProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="password"
        autoComplete="off"
        placeholder={isConfigured ? "Configured — paste a new value to replace" : "Not configured"}
      />
    </div>
  );
}

function providerBadge(isEnabled: boolean, isConfigured: boolean) {
  if (isEnabled && isConfigured) {
    return (
      <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-green-500">
        Active
      </Badge>
    );
  }
  if (isConfigured) {
    return <Badge variant="outline">Configured — off</Badge>;
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Not configured
    </Badge>
  );
}

interface EndpointRowProps {
  label: string;
  url: string;
  hint: string;
}

function EndpointRow({ label, url, hint }: EndpointRowProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2.5 py-1.5 font-mono text-xs">
          {url}
        </code>
        <CopyButton value={url} label={`Copy ${label}`} />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

interface ProviderBlockProps {
  icon: typeof CreditCard;
  /** Brand logo served from /public; takes precedence over the lucide icon. */
  iconSrc?: string;
  /** Renders the logo as a full chip tile (for logos with a baked-in background). */
  iconFill?: boolean;
  iconClass: string;
  title: string;
  description: string;
  switchName: string;
  defaultEnabled: boolean;
  isConfigured: boolean;
  children: React.ReactNode;
}

function ProviderBlock({
  icon: Icon,
  iconSrc,
  iconFill = false,
  iconClass,
  title,
  description,
  switchName,
  defaultEnabled,
  isConfigured,
  children,
}: ProviderBlockProps) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {iconSrc && iconFill ? (
            <Image
              src={iconSrc}
              alt=""
              width={36}
              height={36}
              className="size-9 shrink-0 rounded-lg border object-cover"
            />
          ) : (
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", iconClass)}>
              {iconSrc ? (
                <Image src={iconSrc} alt="" width={20} height={20} className="size-5" />
              ) : (
                <Icon className="size-4" />
              )}
            </span>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">{title}</p>
              {providerBadge(defaultEnabled, isConfigured)}
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <Switch name={switchName} defaultChecked={defaultEnabled} aria-label={`Enable ${title}`} />
      </div>
      {children}
    </div>
  );
}

interface PaymentSettingsFormProps {
  stripeEnabled: boolean;
  stripeKeyConfigured: boolean;
  stripeWebhookConfigured: boolean;
  stripePublishableKey: string;
  nowpaymentsEnabled: boolean;
  nowpaymentsKeyConfigured: boolean;
  nowpaymentsIpnConfigured: boolean;
  stripeWebhookUrl: string;
  nowpaymentsIpnUrl: string;
  paypalffEnabled: boolean;
  paypalEmail: string;
}

export function PaymentSettingsForm(props: PaymentSettingsFormProps) {
  const { onSubmit, isPending } = useActionSubmit(updatePaymentSettings, "Payment settings saved");

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <SectionHeader
          icon={CreditCard}
          iconClass="bg-violet-500/10 text-violet-400"
          title="Payments"
          description="Connect your own accounts — money always flows directly to you, never through this software."
        />
        <CardContent className="space-y-4">
          <ProviderBlock
            icon={CreditCard}
            iconSrc="/stripe-icon.svg"
            iconClass="bg-[#6772e5]/10"
            title="Stripe"
            description="Cards via Stripe Checkout — Visa, Mastercard, Apple Pay and more."
            switchName="stripeEnabled"
            defaultEnabled={props.stripeEnabled}
            isConfigured={props.stripeKeyConfigured && props.stripeWebhookConfigured}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SecretInput
                id="stripe-secret"
                name="stripeSecretKey"
                label="Secret key (sk_…)"
                isConfigured={props.stripeKeyConfigured}
              />
              <SecretInput
                id="stripe-webhook"
                name="stripeWebhookSecret"
                label="Webhook signing secret (whsec_…)"
                isConfigured={props.stripeWebhookConfigured}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stripe-publishable">
                Publishable key (pk_…){" "}
                <span className="text-muted-foreground">— optional</span>
              </Label>
              <Input
                id="stripe-publishable"
                name="stripePublishableKey"
                defaultValue={props.stripePublishableKey}
                placeholder="pk_test_…"
                autoComplete="off"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                With a publishable key, buyers pay in an embedded popup on your checkout page.
                Without it, they are redirected to Stripe&apos;s hosted page.
              </p>
            </div>
            <EndpointRow
              label="Webhook endpoint"
              url={props.stripeWebhookUrl}
              hint="Add this endpoint in the Stripe dashboard with the checkout.session.* events."
            />
          </ProviderBlock>

          <ProviderBlock
            icon={Bitcoin}
            iconSrc="/nowpaymentslogo.png"
            iconFill
            iconClass="bg-amber-500/10 text-amber-400"
            title="NOWPayments"
            description="Crypto payments — BTC, ETH, LTC, SOL and 200+ other coins."
            switchName="nowpaymentsEnabled"
            defaultEnabled={props.nowpaymentsEnabled}
            isConfigured={props.nowpaymentsKeyConfigured && props.nowpaymentsIpnConfigured}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SecretInput
                id="nowpayments-key"
                name="nowpaymentsApiKey"
                label="API key"
                isConfigured={props.nowpaymentsKeyConfigured}
              />
              <SecretInput
                id="nowpayments-ipn"
                name="nowpaymentsIpnSecret"
                label="IPN secret"
                isConfigured={props.nowpaymentsIpnConfigured}
              />
            </div>
            <EndpointRow
              label="IPN callback URL"
              url={props.nowpaymentsIpnUrl}
              hint="Set this as the IPN callback URL in your NOWPayments payment settings."
            />
          </ProviderBlock>

          <ProviderBlock
            icon={HandCoins}
            iconSrc="/PayPal_Symbol_0.svg"
            iconClass="bg-[#0070ba]/10"
            title="PayPal Friends & Family"
            description="Manual transfers — buyers send to your PayPal address, you confirm each order by hand."
            switchName="paypalffEnabled"
            defaultEnabled={props.paypalffEnabled}
            isConfigured={props.paypalEmail.length > 0}
          >
            <div className="space-y-2">
              <Label htmlFor="paypal-email">PayPal e-mail address</Label>
              <Input
                id="paypal-email"
                name="paypalEmail"
                type="email"
                defaultValue={props.paypalEmail}
                placeholder="you@example.com"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Shown to buyers at checkout with instructions to send as Friends &amp; Family with no
                note. Orders stay pending (stock held for 24h) until you press{" "}
                <span className="font-medium">Mark paid &amp; deliver</span> on the order. No fees, no
                webhooks — but also no automation, so check incoming payments carefully.
              </p>
            </div>
          </ProviderBlock>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save payment settings"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

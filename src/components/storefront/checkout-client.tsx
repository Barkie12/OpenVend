"use client";

import {
  Bitcoin,
  CreditCard,
  ExternalLink,
  HandCoins,
  Loader2,
  Mail,
  Package,
  Store,
  TicketPercent,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import {
  listCryptoCurrencies,
  previewCoupon,
  startCheckout,
  type CryptoCurrencyOption,
  type EmbeddedStripePayment,
} from "@/app/checkout/actions";
import { StripeEmbeddedModal } from "@/components/storefront/stripe-embedded-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { imageUrl } from "@/lib/image-url";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const THUMB_SIZE_PX = 48;
const LOGO_SIZE_PX = 32;

type ProviderId = "stripe" | "nowpayments" | "paypalff";

interface ProviderOption {
  id: ProviderId;
  label: string;
  hint: string;
  icon: typeof CreditCard;
  /** Brand logo served from /public; takes precedence over the lucide icon. */
  iconSrc: string | null;
  /** Renders the logo as a full chip tile (for logos with a baked-in background). */
  iconFill: boolean;
  iconClass: string;
}

const PROVIDER_OPTIONS: readonly ProviderOption[] = [
  {
    id: "nowpayments",
    label: "Crypto",
    hint: "BTC, ETH, LTC & 200+ coins",
    icon: Bitcoin,
    iconSrc: "/nowpaymentslogo.png",
    iconFill: true,
    iconClass: "bg-amber-500/10 text-amber-400",
  },
  {
    id: "stripe",
    label: "Cards, Apple Pay & Google Pay",
    hint: "via Stripe",
    icon: CreditCard,
    iconSrc: "/stripe-icon.svg",
    iconFill: false,
    iconClass: "bg-[#6772e5]/10",
  },
  {
    id: "paypalff",
    label: "PayPal",
    hint: "Friends & Family — confirmed manually",
    icon: HandCoins,
    iconSrc: "/PayPal_Symbol_0.svg",
    iconFill: false,
    iconClass: "bg-[#0070ba]/10",
  },
];

const CHECKOUT_STEPS = ["Order Information", "Confirm & Pay", "Receive Your Items"] as const;

export interface CheckoutClientProps {
  shopName: string;
  shopLogoPath: string | null;
  productName: string;
  productSlug: string;
  productThumbnail: string | null;
  variantId: string;
  variantName: string;
  unitPriceCents: number;
  quantity: number;
  currency: string;
  enabledProviders: ProviderId[];
  turnstileSiteKey: string | null;
  hasTerms: boolean;
}

interface AppliedCoupon {
  code: string;
  discountCents: number;
}

export function CheckoutClient(props: CheckoutClientProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(
    props.enabledProviders[0] ?? null,
  );
  const [coins, setCoins] = useState<CryptoCurrencyOption[] | null>(null);
  const [coinsError, setCoinsError] = useState<string | null>(null);
  const [payCurrency, setPayCurrency] = useState<string | null>(null);
  const [coinSearch, setCoinSearch] = useState("");
  const coinsRequestedRef = useRef(false);
  const [agreedToTerms, setAgreedToTerms] = useState(!props.hasTerms);
  const [agreedToDelivery, setAgreedToDelivery] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [embeddedPayment, setEmbeddedPayment] = useState<
    (EmbeddedStripePayment & { orderPageUrl: string }) | null
  >(null);
  const [isApplying, startApplying] = useTransition();
  const [isPaying, startPaying] = useTransition();

  const subtotalCents = props.unitPriceCents * props.quantity;
  const discountCents = appliedCoupon?.discountCents ?? 0;
  const totalCents = Math.max(0, subtotalCents - discountCents);
  const needsCoinChoice =
    totalCents > 0 && selectedProvider === "nowpayments" && payCurrency === null;
  const canSubmit = agreedToTerms && agreedToDelivery && !isPaying && !needsCoinChoice;

  // The coin list is only fetched once crypto is actually chosen.
  useEffect(() => {
    if (selectedProvider !== "nowpayments" || coinsRequestedRef.current) {
      return;
    }
    coinsRequestedRef.current = true;
    void (async () => {
      const coinsResult = await listCryptoCurrencies();
      if (coinsResult.error !== null) {
        setCoinsError(coinsResult.error);
        coinsRequestedRef.current = false;
        return;
      }
      setCoins(coinsResult.coins);
      setCoinsError(null);
    })();
  }, [selectedProvider]);

  const searchNeedle = coinSearch.trim().toLowerCase();
  const visibleCoins =
    coins === null
      ? []
      : searchNeedle.length === 0
        ? coins
        : coins.filter(
            (coin) =>
              coin.code.includes(searchNeedle) ||
              coin.ticker.toLowerCase().includes(searchNeedle) ||
              coin.label.toLowerCase().includes(searchNeedle) ||
              (coin.network ?? "").toLowerCase().includes(searchNeedle),
          );

  function applyCoupon(): void {
    setCouponError(null);
    startApplying(async () => {
      const preview = await previewCoupon(props.variantId, props.quantity, couponInput, email);
      if (preview.error !== null || preview.code === null) {
        setCouponError(preview.error ?? "That coupon is not valid.");
        setAppliedCoupon(null);
        return;
      }
      setAppliedCoupon({ code: preview.code, discountCents: preview.discountCents });
      setCouponInput("");
    });
  }

  function removeCoupon(): void {
    setAppliedCoupon(null);
    setCouponError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setErrorMessage(null);
    const turnstileInput = formRef.current?.querySelector<HTMLInputElement>(
      "input[name='cf-turnstile-response']",
    );

    startPaying(async () => {
      const checkoutResult = await startCheckout({
        variantId: props.variantId,
        quantity: props.quantity,
        email,
        couponCode: appliedCoupon?.code ?? "",
        provider: selectedProvider,
        payCurrency: selectedProvider === "nowpayments" ? payCurrency : null,
        turnstileToken: turnstileInput?.value ?? null,
      });
      if (checkoutResult.error !== null || checkoutResult.redirectUrl === null) {
        setErrorMessage(checkoutResult.error ?? "Checkout failed. Try again.");
        return;
      }
      if (checkoutResult.embeddedStripe !== null) {
        setEmbeddedPayment({
          ...checkoutResult.embeddedStripe,
          orderPageUrl: checkoutResult.redirectUrl,
        });
        return;
      }
      window.location.assign(checkoutResult.redirectUrl);
    });
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(360px,440px)_1fr]">
      {turnstileSiteKeyScript(props.turnstileSiteKey)}

      {embeddedPayment ? (
        <StripeEmbeddedModal
          clientSecret={embeddedPayment.clientSecret}
          publishableKey={embeddedPayment.publishableKey}
          onComplete={() => window.location.assign(embeddedPayment.orderPageUrl)}
          onClose={() => {
            setEmbeddedPayment(null);
            setErrorMessage("Payment window closed — click Pay to try again.");
          }}
        />
      ) : null}

      {/* Summary rail */}
      <aside className="border-b bg-card/60 lg:border-b-0 lg:border-r">
        <div className="mx-auto flex h-full max-w-sm flex-col gap-6 px-6 py-8 lg:px-8 lg:py-10">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            {props.shopLogoPath ? (
              <Image
                src={imageUrl(props.shopLogoPath)}
                alt=""
                width={LOGO_SIZE_PX}
                height={LOGO_SIZE_PX}
                className="size-8 rounded-md border"
              />
            ) : (
              <span className="flex size-8 items-center justify-center rounded-md border bg-muted">
                <Store className="size-4 text-muted-foreground" />
              </span>
            )}
            {props.shopName}
            <ExternalLink className="size-3.5 text-muted-foreground" />
          </Link>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Pay {props.shopName}
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight">{formatMoney(totalCents, props.currency)}</p>
          </div>

          <div className="flex items-center gap-3 rounded-lg border bg-background/40 p-3">
            {props.productThumbnail ? (
              <Image
                src={imageUrl(props.productThumbnail)}
                alt=""
                width={THUMB_SIZE_PX}
                height={THUMB_SIZE_PX}
                className="size-12 shrink-0 rounded-md border object-cover"
              />
            ) : (
              <div className="flex size-12 shrink-0 items-center justify-center rounded-md border bg-muted">
                <Package className="size-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <Link
                href={`/p/${props.productSlug}`}
                className="block truncate text-sm font-medium hover:underline"
              >
                {props.productName}
              </Link>
              <p className="text-xs text-muted-foreground">
                {props.variantName === "Default" ? "Standard" : props.variantName}
                {props.quantity > 1 ? ` × ${props.quantity}` : ""}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold">{formatMoney(subtotalCents, props.currency)}</p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatMoney(subtotalCents, props.currency)}</span>
            </div>
            {appliedCoupon ? (
              <div className="flex items-center justify-between text-green-500">
                <span>Discount ({appliedCoupon.code})</span>
                <span>-{formatMoney(discountCents, props.currency)}</span>
              </div>
            ) : null}
            <Separator />
            <div className="flex items-center justify-between font-semibold">
              <span>Total</span>
              <span>{formatMoney(totalCents, props.currency)}</span>
            </div>
          </div>

          <div className="mt-auto space-y-3 text-xs text-muted-foreground">
            {props.hasTerms ? (
              <p>
                <Link href="/terms" className="underline-offset-2 hover:underline">
                  Terms of Service
                </Link>
              </p>
            ) : null}
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
        </div>
      </aside>

      {/* Order form */}
      <main className="px-6 py-8 lg:px-10 lg:py-10">
        <form ref={formRef} onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-7">
          <div className="flex items-center border-b">
            {CHECKOUT_STEPS.map((step, index) => (
              <span
                key={step}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2.5 text-xs font-medium sm:text-sm",
                  index === 0
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground",
                )}
              >
                {step}
              </span>
            ))}
          </div>

          <section className="space-y-2.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Contact &amp; delivery
            </p>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                placeholder="E-mail address*"
                className="h-11 pl-9"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">Your items and receipt are sent to this address.</p>
          </section>

          <section className="space-y-2.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Discount</p>
            {appliedCoupon ? (
              <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm">
                  <TicketPercent className="size-4 text-green-500" />
                  <span className="font-mono font-medium">{appliedCoupon.code}</span>
                  <Badge variant="outline" className="border-green-500/40 text-green-500">
                    -{formatMoney(appliedCoupon.discountCents, props.currency)}
                  </Badge>
                </span>
                <Button type="button" size="icon" variant="ghost" className="size-7" onClick={removeCoupon}>
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <TicketPercent className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Coupon code"
                    className="h-11 pl-9 uppercase"
                    value={couponInput}
                    onChange={(event) => setCouponInput(event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={applyCoupon}
                  disabled={isApplying || couponInput.trim().length === 0}
                >
                  {isApplying ? "Checking…" : "Apply →"}
                </Button>
              </div>
            )}
            {couponError ? <p className="text-xs text-destructive">{couponError}</p> : null}
          </section>

          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Payment</p>
              <p className="text-xs text-muted-foreground">All transactions are secure and encrypted.</p>
            </div>
            {props.enabledProviders.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {PROVIDER_OPTIONS.filter((option) => props.enabledProviders.includes(option.id)).map(
                  (option) => {
                    const OptionIcon = option.icon;
                    const isSelected = selectedProvider === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelectedProvider(option.id)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:border-muted-foreground/40",
                        )}
                      >
                        {option.iconSrc && option.iconFill ? (
                          <Image
                            src={option.iconSrc}
                            alt=""
                            width={36}
                            height={36}
                            className="size-9 shrink-0 rounded-md border object-cover"
                          />
                        ) : (
                          <span
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-md border",
                              option.iconClass,
                            )}
                          >
                            {option.iconSrc ? (
                              <Image src={option.iconSrc} alt="" width={20} height={20} className="size-5" />
                            ) : (
                              <OptionIcon className="size-4" />
                            )}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{option.label}</span>
                          <span className="block text-xs text-muted-foreground">{option.hint}</span>
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                Payments are not set up yet — only a 100% discount coupon can complete this order.
              </p>
            )}

            {selectedProvider === "nowpayments" ? (
              <div className="space-y-2.5 rounded-lg border bg-card/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Pay with
                  </p>
                  {coins !== null && coins.length > 8 ? (
                    <Input
                      value={coinSearch}
                      onChange={(event) => setCoinSearch(event.target.value)}
                      placeholder="Search coins…"
                      className="h-8 w-40 text-xs"
                    />
                  ) : null}
                </div>

                {coinsError ? (
                  <p className="text-xs text-destructive">{coinsError}</p>
                ) : coins === null ? (
                  <p className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Loading available coins…
                  </p>
                ) : visibleCoins.length === 0 ? (
                  <p className="py-1 text-xs text-muted-foreground">No coins match your search.</p>
                ) : (
                  <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3">
                    {visibleCoins.map((coin) => {
                      const isCoinSelected = payCurrency === coin.code;
                      return (
                        <button
                          key={coin.code}
                          type="button"
                          onClick={() => setPayCurrency(coin.code)}
                          className={cn(
                            "rounded-md border px-2.5 py-2 text-left transition-colors",
                            isCoinSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "hover:border-muted-foreground/40",
                          )}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold">{coin.ticker}</span>
                            {coin.network ? (
                              <span className="rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
                                {coin.network}
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {coin.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {needsCoinChoice && coins !== null ? (
                  <p className="text-xs text-muted-foreground">Select a coin to continue.</p>
                ) : null}
              </div>
            ) : null}
          </section>

          {props.hasTerms ? (
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(event) => setAgreedToTerms(event.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <span>
                I have read and agree to {props.shopName}&apos;s{" "}
                <Link href="/terms" target="_blank" className="underline underline-offset-2">
                  Terms of Service
                </Link>
                .
              </span>
            </label>
          ) : null}

          <div className="space-y-2.5 rounded-lg border bg-card/60 p-4">
            <p className="text-sm font-semibold">Immediate delivery</p>
            <p className="text-sm text-muted-foreground">
              Your product will be delivered immediately after payment.
            </p>
            <p className="text-xs text-muted-foreground">
              By continuing, you request immediate delivery and understand that you lose your statutory
              14-day right of withdrawal once delivery begins.
            </p>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={agreedToDelivery}
                onChange={(event) => setAgreedToDelivery(event.target.checked)}
                className="accent-primary"
              />
              I understand and agree.
            </label>
          </div>

          {props.turnstileSiteKey ? (
            <div className="cf-turnstile" data-sitekey={props.turnstileSiteKey} data-theme="dark" />
          ) : null}

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          <div className="space-y-3">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={!canSubmit}>
              {isPaying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Starting payment…
                </>
              ) : (
                `Pay ${formatMoney(totalCents, props.currency)}`
              )}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="size-3.5" />
              Instant delivery after payment
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}

function turnstileSiteKeyScript(siteKey: string | null) {
  if (!siteKey) {
    return null;
  }
  return <Script src={TURNSTILE_SCRIPT_URL} strategy="afterInteractive" />;
}

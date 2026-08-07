"use client";

import {
  ArrowLeft,
  CheckCircle2,
  CloudDownload,
  CreditCard,
  Gamepad2,
  Gift,
  KeyRound,
  MessageCircle,
  Sparkles,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { createProduct } from "@/app/admin/(dashboard)/products/actions";
import { DELIVERY_TYPE_OPTIONS, type DeliveryTypeValue } from "@/components/admin/products/delivery-type-options";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

const INITIAL_STATE: ActionResult = { error: null };

interface ProductTemplate {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  iconClass: string;
  deliveryType: DeliveryTypeValue;
  namePlaceholder: string;
}

const PRODUCT_TEMPLATES: readonly ProductTemplate[] = [
  {
    id: "serial-keys",
    title: "Serial Keys / License Keys",
    description: "Software licenses, game keys, activation codes",
    icon: KeyRound,
    iconClass: "bg-violet-500/10 text-violet-400",
    deliveryType: "serials",
    namePlaceholder: "Premium License Key",
  },
  {
    id: "accounts",
    title: "Accounts",
    description: "Pre-made accounts, streaming accounts, gaming accounts",
    icon: UserRound,
    iconClass: "bg-green-500/10 text-green-400",
    deliveryType: "serials",
    namePlaceholder: "Streaming Premium Account",
  },
  {
    id: "nitro",
    title: "Discord Nitro Gifts",
    description: "Nitro gift links, Nitro Basic, Nitro boost codes",
    icon: MessageCircle,
    iconClass: "bg-indigo-500/10 text-indigo-400",
    deliveryType: "serials",
    namePlaceholder: "Discord Nitro 1 Year",
  },
  {
    id: "topup",
    title: "Game Top-Up / Gift Cards",
    description: "In-game currency, gift cards, top-up codes",
    icon: Gift,
    iconClass: "bg-amber-500/10 text-amber-400",
    deliveryType: "serials",
    namePlaceholder: "Gift Card $50",
  },
  {
    id: "subscriptions",
    title: "Subscriptions / Memberships",
    description: "Premium access keys, VPN, streaming subscriptions",
    icon: CreditCard,
    iconClass: "bg-pink-500/10 text-pink-400",
    deliveryType: "serials",
    namePlaceholder: "VPN Subscription",
  },
  {
    id: "cheats",
    title: "Cheats / Software",
    description: "Game cheats, tools, software with license keys",
    icon: Gamepad2,
    iconClass: "bg-red-500/10 text-red-400",
    deliveryType: "serials",
    namePlaceholder: "External DMA Tool",
  },
  {
    id: "downloads",
    title: "Digital Downloads",
    description: "E-books, templates, assets, files",
    icon: CloudDownload,
    iconClass: "bg-sky-500/10 text-sky-400",
    deliveryType: "file",
    namePlaceholder: "Design Asset Pack",
  },
  {
    id: "service",
    title: "Service",
    description: "Manual delivery, custom work, boosting, design",
    icon: Wrench,
    iconClass: "bg-purple-500/10 text-purple-400",
    deliveryType: "service",
    namePlaceholder: "Custom Setup Service",
  },
];

interface NewProductFormProps {
  currency: string;
}

export function NewProductForm({ currency }: NewProductFormProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [deliveryType, setDeliveryType] = useState<DeliveryTypeValue>("serials");
  const [formState, formAction, isPending] = useActionState(createProduct, INITIAL_STATE);

  function chooseTemplate(template: ProductTemplate | null): void {
    setSelectedTemplate(template);
    setDeliveryType(template?.deliveryType ?? "serials");
    setShowDetails(true);
  }

  if (!showDetails) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 py-8">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">What are you selling?</h1>
          <p className="text-sm text-muted-foreground">
            Choose a template to get started quickly, or start from scratch.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {PRODUCT_TEMPLATES.map((template) => {
            const TemplateIcon = template.icon;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => chooseTemplate(template)}
                className="flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent/50"
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg border",
                    template.iconClass,
                  )}
                >
                  <TemplateIcon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{template.title}</span>
                  <span className="block text-xs text-muted-foreground">{template.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => chooseTemplate(null)}>
            <Sparkles className="size-4" />
            Start from scratch
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-4">
      <Button variant="ghost" size="sm" onClick={() => setShowDetails(false)}>
        <ArrowLeft className="size-4" />
        Templates
      </Button>

      <form action={formAction}>
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">
                {selectedTemplate ? selectedTemplate.title : "New product"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Variants, stock, images and description come next.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder={selectedTemplate?.namePlaceholder ?? "Premium License Key"}
                required
                maxLength={120}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Delivery type</Label>
              <input type="hidden" name="deliveryType" value={deliveryType} />
              <div className="grid gap-3 sm:grid-cols-3">
                {DELIVERY_TYPE_OPTIONS.map((option) => {
                  const OptionIcon = option.icon;
                  const isActive = option.value === deliveryType;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDeliveryType(option.value)}
                      className={cn(
                        "relative rounded-lg border p-3 text-left transition-colors",
                        isActive
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:border-muted-foreground/40",
                      )}
                    >
                      {isActive ? (
                        <CheckCircle2 className="absolute right-2.5 top-2.5 size-4 text-primary" />
                      ) : null}
                      <OptionIcon className="mb-2 size-4 text-muted-foreground" />
                      <p className="text-sm font-medium">{option.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{option.summary}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">The delivery type cannot be changed later.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Price ({currency})</Label>
              <Input id="price" name="price" inputMode="decimal" placeholder="9.99" required className="max-w-40" />
            </div>

            {formState.error ? <p className="text-sm text-destructive">{formState.error}</p> : null}

            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create product"}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

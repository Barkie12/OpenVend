import { formatMoney } from "@/lib/money";
import type { OrderWithDeliverables } from "@/lib/orders";
import type { Shop } from "@/lib/shop";

const COLOR_GREEN = 0x22c55e;
const COLOR_AMBER = 0xf59e0b;

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "***";
  }
  const visible = localPart.slice(0, 2);
  return `${visible}***@${domain}`;
}

async function postDiscordWebhook(webhookUrl: string, body: unknown): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Discord webhook responded with ${response.status}`);
  }
}

/** Notifies the seller's Discord channel about a sale; skips when not configured. */
export async function sendDiscordSaleNotification(
  shop: Shop,
  order: OrderWithDeliverables,
  needsReview: boolean,
): Promise<void> {
  if (!shop.discordWebhookUrl) {
    return;
  }

  const itemSummary = order.items
    .map(
      (item) =>
        `${item.quantity}× ${item.productName}${item.variantName === "Default" ? "" : ` (${item.variantName})`}`,
    )
    .join(", ");

  await postDiscordWebhook(shop.discordWebhookUrl, {
    embeds: [
      {
        title: needsReview ? `Order #${order.orderNumber} needs review` : `New sale — order #${order.orderNumber}`,
        color: needsReview ? COLOR_AMBER : COLOR_GREEN,
        fields: [
          { name: "Items", value: itemSummary || "—", inline: false },
          { name: "Total", value: formatMoney(order.totalCents, order.currency), inline: true },
          { name: "Buyer", value: maskEmail(order.email), inline: true },
          { name: "Payment", value: order.paymentProvider ?? "—", inline: true },
          ...(needsReview && order.reviewReason
            ? [{ name: "Reason", value: order.reviewReason, inline: false }]
            : []),
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

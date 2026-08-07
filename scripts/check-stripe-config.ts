import "dotenv/config";

import { getDb, schema } from "../src/lib/db";

async function main(): Promise<void> {
  const shops = await getDb()
    .select({
      stripeEnabled: schema.shops.stripeEnabled,
      hasSecretKey: schema.shops.stripeSecretKeyEnc,
      hasWebhookSecret: schema.shops.stripeWebhookSecretEnc,
      publishableKey: schema.shops.stripePublishableKey,
    })
    .from(schema.shops)
    .limit(1);
  const shop = shops[0];
  if (!shop) {
    console.log("no shop");
    return;
  }
  console.log(`stripeEnabled: ${shop.stripeEnabled}`);
  console.log(`secretKey configured: ${shop.hasSecretKey !== null}`);
  console.log(`webhookSecret configured: ${shop.hasWebhookSecret !== null}`);
  console.log(
    `publishableKey: ${shop.publishableKey === null ? "NOT SET" : `set (${shop.publishableKey.slice(0, 11)}…)`}`,
  );
}

main().then(() => process.exit(0));

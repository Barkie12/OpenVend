import "dotenv/config";

import { getLiveVisitorCount, getTrafficData } from "../src/lib/analytics";

async function main(): Promise<void> {
  const traffic = await getTrafficData("today");
  const liveCount = await getLiveVisitorCount();
  console.info(
    `today: pageviews=${traffic.pageviews.current} visitors=${traffic.visitors.current} ` +
      `visits=${traffic.visits.current} bounce=${traffic.bounceRatePercent.current.toFixed(1)}% ` +
      `conversion=${traffic.conversionRatePercent.current.toFixed(2)}% live=${liveCount}`,
  );
  console.info(`pages: ${traffic.topPages.map((page) => `${page.label} (${page.hits})`).join(", ") || "none"}`);
  console.info(
    `sources: ${traffic.topSources.map((source) => `${source.label} (${source.hits})`).join(", ") || "none"}`,
  );
  console.info(
    `countries: ${traffic.topCountries.map((country) => `${country.label} (${country.hits})`).join(", ") || "none"}`,
  );
  if (traffic.pageviews.current < 1) {
    throw new Error("Expected at least one pageview after the smoke beacon");
  }
  console.info("traffic verification passed");
}

main()
  .then(() => process.exit(0))
  .catch((verificationError: unknown) => {
    console.error(verificationError);
    process.exit(1);
  });

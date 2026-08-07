import "dotenv/config";

import { DASHBOARD_RANGES, getDashboardData } from "../src/lib/stats";

async function main(): Promise<void> {
  for (const range of DASHBOARD_RANGES) {
    const dashboard = await getDashboardData(range);
    const seriesTotal = dashboard.revenueSeries.reduce((sum, point) => sum + point.value, 0);
    const statsRevenue = dashboard.revenue.current / 100;
    if (Math.abs(seriesTotal - statsRevenue) > 0.01) {
      throw new Error(
        `range ${range}: chart series total (${seriesTotal.toFixed(2)}) != stat card revenue (${statsRevenue.toFixed(2)})`,
      );
    }
    console.info(
      `${range.padEnd(5)} revenue=$${statsRevenue.toFixed(2)} (chart matches) orders=${dashboard.orders.current} ` +
        `customers=${dashboard.customers.current} change=${dashboard.revenue.changePercent?.toFixed(1) ?? "n/a"}% ` +
        `points=${dashboard.revenueSeries.length} latest=${dashboard.latestOrders.length} ` +
        `sellers=${dashboard.bestSellers.length} spenders=${dashboard.topSpenders.length} methods=${dashboard.paymentMethods.length} ` +
        `review=${dashboard.needsReviewCount}`,
    );
  }
  console.info("dashboard data verification passed");
}

main()
  .then(() => process.exit(0))
  .catch((verificationError: unknown) => {
    console.error(verificationError);
    process.exit(1);
  });

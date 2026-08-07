import {
  ChartLine,
  CircleDollarSign,
  Clock,
  CornerUpLeft,
  Eye,
  FileText,
  Globe,
  MapPin,
  Megaphone,
  Monitor,
  MousePointerClick,
  Percent,
  Settings,
  ShoppingCart,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";

import { BreakdownCard } from "@/components/admin/dashboard/breakdown-card";
import { LatestOrdersCard } from "@/components/admin/dashboard/latest-orders-card";
import { LeaderboardCard } from "@/components/admin/dashboard/leaderboard-card";
import { LiveVisitors } from "@/components/admin/dashboard/live-visitors";
import { RangeSelector, dashboardHref } from "@/components/admin/dashboard/range-selector";
import { StatCard } from "@/components/admin/dashboard/stat-card";
import { TimeSeriesChart } from "@/components/admin/dashboard/time-series-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLiveVisitorCount, getTrafficData } from "@/lib/analytics";
import { formatMoney } from "@/lib/money";
import { requireShop, type Shop } from "@/lib/shop";
import { getDashboardData, isDashboardRange, type DashboardRange } from "@/lib/stats";
import { cn } from "@/lib/utils";

const SECONDS_PER_MINUTE = 60;

type DashboardTab = "revenue" | "traffic";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryWithFlag(code: string): string {
  const upperCode = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upperCode)) {
    return code;
  }
  const flag = [...upperCode]
    .map((letter) => String.fromCodePoint(0x1f1e6 - 65 + letter.charCodeAt(0)))
    .join("");
  let regionName = upperCode;
  try {
    regionName = regionNames.of(upperCode) ?? upperCode;
  } catch {
    // Unknown region codes fall back to the raw code.
  }
  return `${flag} ${regionName}`;
}

function formatDuration(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds);
  if (rounded < SECONDS_PER_MINUTE) {
    return `${rounded}s`;
  }
  return `${Math.floor(rounded / SECONDS_PER_MINUTE)}m ${rounded % SECONDS_PER_MINUTE}s`;
}

async function RevenueTab({ shop, range }: { shop: Shop; range: DashboardRange }) {
  const dashboard = await getDashboardData(range);

  return (
    <div className="space-y-4">
      {dashboard.needsReviewCount > 0 ? (
        <Link
          href="/admin/orders?status=requires_review"
          className="flex items-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-2.5 text-sm transition-colors hover:bg-orange-500/15"
        >
          <TriangleAlert className="size-4 text-orange-500" />
          <span>
            {dashboard.needsReviewCount} order{dashboard.needsReviewCount === 1 ? "" : "s"} need
            {dashboard.needsReviewCount === 1 ? "s" : ""} manual review
          </span>
        </Link>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatMoney(dashboard.revenue.current, shop.currency)}
          icon={CircleDollarSign}
          changePercent={dashboard.revenue.changePercent}
        />
        <StatCard
          label="Orders"
          value={String(dashboard.orders.current)}
          icon={ShoppingCart}
          changePercent={dashboard.orders.changePercent}
        />
        <StatCard
          label="Customers"
          value={String(dashboard.customers.current)}
          icon={Users}
          changePercent={dashboard.customers.changePercent}
        />
        <StatCard
          label="Avg. order value"
          value={formatMoney(dashboard.avgOrderValueCents.current, shop.currency)}
          icon={CircleDollarSign}
          changePercent={dashboard.avgOrderValueCents.changePercent}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="gap-3 py-4">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <CircleDollarSign className="size-3.5" />
                Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TimeSeriesChart
                points={dashboard.revenueSeries}
                seriesLabel="Revenue"
                color="var(--chart-1)"
                kind="money"
                currency={shop.currency}
              />
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <ChartLine className="size-3.5" />
                Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TimeSeriesChart
                points={dashboard.ordersSeries}
                seriesLabel="Orders"
                color="var(--chart-2)"
                kind="count"
                currency={shop.currency}
              />
            </CardContent>
          </Card>
        </div>

        <LatestOrdersCard orders={dashboard.latestOrders} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <LeaderboardCard
          title="Best selling products"
          icon={ShoppingCart}
          entries={dashboard.bestSellers}
          currency={shop.currency}
          showImages={true}
          viewAllHref="/admin/products"
        />
        <LeaderboardCard
          title="Top spenders"
          icon={Users}
          entries={dashboard.topSpenders}
          currency={shop.currency}
          showImages={false}
          viewAllHref="/admin/orders"
        />
        <LeaderboardCard
          title="Most used methods"
          icon={CircleDollarSign}
          entries={dashboard.paymentMethods}
          currency={shop.currency}
          showImages={false}
          viewAllHref={null}
        />
      </div>
    </div>
  );
}

async function TrafficTab({ shop, range }: { shop: Shop; range: DashboardRange }) {
  const [traffic, liveCount] = await Promise.all([getTrafficData(range), getLiveVisitorCount()]);

  return (
    <div className="space-y-4">
      <LiveVisitors initialCount={liveCount} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Pageviews"
          value={String(traffic.pageviews.current)}
          icon={Eye}
          changePercent={traffic.pageviews.changePercent}
        />
        <StatCard
          label="Visitors"
          value={String(traffic.visitors.current)}
          icon={Users}
          changePercent={traffic.visitors.changePercent}
        />
        <StatCard
          label="Visits"
          value={String(traffic.visits.current)}
          icon={MousePointerClick}
          changePercent={traffic.visits.changePercent}
        />
        <StatCard
          label="Bounce rate"
          value={`${traffic.bounceRatePercent.current.toFixed(1)}%`}
          icon={CornerUpLeft}
          changePercent={traffic.bounceRatePercent.changePercent}
        />
        <StatCard
          label="Avg. session time"
          value={formatDuration(traffic.avgSessionSeconds.current)}
          icon={Clock}
          changePercent={traffic.avgSessionSeconds.changePercent}
        />
        <StatCard
          label="Conversion rate"
          value={`${traffic.conversionRatePercent.current.toFixed(2)}%`}
          icon={Percent}
          changePercent={traffic.conversionRatePercent.changePercent}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 py-4">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Eye className="size-3.5" />
              Pageviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              points={traffic.pageviewsSeries}
              seriesLabel="Pageviews"
              color="var(--chart-1)"
              kind="count"
              currency={shop.currency}
            />
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <ChartLine className="size-3.5" />
              Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              points={traffic.sessionsSeries}
              seriesLabel="Sessions"
              color="var(--chart-2)"
              kind="count"
              currency={shop.currency}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownCard title="Pages" icon={FileText} entries={traffic.topPages} />
        <BreakdownCard title="Sources" icon={Globe} entries={traffic.topSources} />
        <BreakdownCard title="Environment" icon={Monitor} entries={traffic.topBrowsers} />
        <BreakdownCard
          title="Location"
          icon={MapPin}
          entries={traffic.topCountries}
          renderLabel={countryWithFlag}
        />
      </div>

      <BreakdownCard
        title="UTM campaigns"
        icon={Megaphone}
        entries={traffic.utmCampaigns}
        emptyState={
          <div className="space-y-1 py-8 text-center">
            <p className="text-sm text-muted-foreground">No campaign traffic yet.</p>
            <p className="text-xs text-muted-foreground">
              Tag your storefront links with <code>utm_source</code>, <code>utm_medium</code> and{" "}
              <code>utm_campaign</code> parameters to see which campaigns drive your traffic.
            </p>
          </div>
        }
      />
    </div>
  );
}

export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  const shop = await requireShop();
  const resolvedSearchParams = await searchParams;
  const rangeParam = typeof resolvedSearchParams.range === "string" ? resolvedSearchParams.range : "7d";
  const range: DashboardRange = isDashboardRange(rangeParam) ? rangeParam : "7d";
  const activeTab: DashboardTab = resolvedSearchParams.tab === "traffic" ? "traffic" : "revenue";

  const tabs: { value: DashboardTab; label: string }[] = [
    { value: "revenue", label: "Revenue & Orders" },
    { value: "traffic", label: "Traffic & Visitors" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            The latest updates and insights for {shop.name}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RangeSelector activeRange={range} activeTab={activeTab} />
          <Button asChild variant="outline" size="icon" className="size-8">
            <Link href="/admin/settings" aria-label="Settings">
              <Settings className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={dashboardHref(tab.value, range)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab.value === activeTab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {activeTab === "revenue" ? <RevenueTab shop={shop} range={range} /> : <TrafficTab shop={shop} range={range} />}
    </div>
  );
}

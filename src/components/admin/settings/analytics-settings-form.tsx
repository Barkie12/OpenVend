"use client";

import { ChartLine } from "lucide-react";
import Link from "next/link";

import { updateAnalyticsSettings } from "@/app/admin/(dashboard)/settings/actions";
import { SectionHeader } from "@/components/admin/settings/section-header";
import { useActionSubmit } from "@/components/admin/use-action-submit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface AnalyticsSettingsFormProps {
  gaMeasurementId: string;
}

const SETUP_STEPS: readonly string[] = [
  "Sign in at analytics.google.com and open Admin (gear icon, bottom left).",
  "Create a Property for your shop (or pick an existing GA4 property).",
  "Under the property, open Data streams and add a Web stream with your shop's URL.",
  "Open the stream and copy the Measurement ID — it looks like G-XXXXXXXXXX.",
  "Paste it below and save. The tracking script is added to your storefront automatically.",
];

export function AnalyticsSettingsForm(props: AnalyticsSettingsFormProps) {
  const { onSubmit, isPending } = useActionSubmit(updateAnalyticsSettings, "Analytics settings saved");
  const isConfigured = props.gaMeasurementId.length > 0;

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <SectionHeader
          icon={ChartLine}
          iconClass="bg-orange-500/10 text-orange-400"
          title="Google Analytics"
          description="Optional. Adds Google's gtag script to your storefront for audience and campaign tooling."
          badge={
            isConfigured ? (
              <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-green-500">
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not configured
              </Badge>
            )
          }
        />
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-dashed p-4">
            <p className="mb-2 text-sm font-medium">How to set it up</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              {SETUP_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ga-measurement-id">Measurement ID</Label>
            <Input
              id="ga-measurement-id"
              name="gaMeasurementId"
              defaultValue={props.gaMeasurementId}
              placeholder="G-XXXXXXXXXX"
              className="max-w-60 font-mono"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Clear the field and save to remove the script. It is only ever added to your storefront,
              never the admin panel.
            </p>
          </div>

          <Separator />

          <p className="text-xs text-muted-foreground">
            Tip: the built-in{" "}
            <Link href="/admin?tab=traffic" className="underline underline-offset-2 hover:text-foreground">
              Traffic &amp; Visitors dashboard
            </Link>{" "}
            works without Google Analytics — pageviews, sessions, sources, countries and campaigns are
            tracked first-party in your own database, with no cookies and no data leaving your server.
          </p>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save analytics settings"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

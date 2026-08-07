"use client";

import { ShieldCheck } from "lucide-react";

import { updateSecuritySettings } from "@/app/admin/(dashboard)/settings/actions";
import { SectionHeader } from "@/components/admin/settings/section-header";
import { useActionSubmit } from "@/components/admin/use-action-submit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SecuritySettingsFormProps {
  turnstileSiteKey: string;
  secretConfigured: boolean;
}

export function SecuritySettingsForm(props: SecuritySettingsFormProps) {
  const { onSubmit, isPending } = useActionSubmit(updateSecuritySettings, "Security settings saved");
  const isConfigured = props.turnstileSiteKey.length > 0 && props.secretConfigured;

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <SectionHeader
          icon={ShieldCheck}
          iconClass="bg-emerald-500/10 text-emerald-400"
          title="Cloudflare Turnstile"
          description="Free anti-bot check on checkout. Create a widget at dash.cloudflare.com → Turnstile. Clear the site key to disable."
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
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="turnstile-site-key">Site key</Label>
            <Input
              id="turnstile-site-key"
              name="turnstileSiteKey"
              defaultValue={props.turnstileSiteKey}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="turnstile-secret-key">Secret key</Label>
            <Input
              id="turnstile-secret-key"
              name="turnstileSecretKey"
              type="password"
              autoComplete="off"
              placeholder={props.secretConfigured ? "Configured — paste to replace" : "Not configured"}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save security settings"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

"use client";

import { Bell } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  sendTestDiscordNotification,
  updateNotificationSettings,
} from "@/app/admin/(dashboard)/settings/actions";
import { SectionHeader } from "@/components/admin/settings/section-header";
import { useActionSubmit } from "@/components/admin/use-action-submit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NotificationSettingsFormProps {
  discordWebhookUrl: string;
}

export function NotificationSettingsForm(props: NotificationSettingsFormProps) {
  const { onSubmit, isPending } = useActionSubmit(updateNotificationSettings, "Notification settings saved");
  const [isTestPending, startTestTransition] = useTransition();

  function runTestNotification(): void {
    startTestTransition(async () => {
      const testResult = await sendTestDiscordNotification();
      if (testResult.error) {
        toast.error(testResult.error);
      } else {
        toast.success("Test notification sent");
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <SectionHeader
          icon={Bell}
          iconClass="bg-indigo-500/10 text-indigo-400"
          title="Discord notifications"
          description="Get a message in your server for every sale and review flag."
          badge={
            props.discordWebhookUrl.length > 0 ? (
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
        <CardContent className="space-y-2">
          <Label htmlFor="discord-webhook">Webhook URL</Label>
          <Input
            id="discord-webhook"
            name="discordWebhookUrl"
            defaultValue={props.discordWebhookUrl}
            placeholder="https://discord.com/api/webhooks/…"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Server settings → Integrations → Webhooks → New webhook. Leave empty to disable.
          </p>
        </CardContent>
        <CardFooter className="gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save notifications"}
          </Button>
          <Button type="button" variant="outline" onClick={runTestNotification} disabled={isTestPending}>
            {isTestPending ? "Sending…" : "Send test"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

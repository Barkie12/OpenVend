"use client";

import { CheckCircle2, Mail, Send, Server } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { sendTestEmail, updateEmailSettings } from "@/app/admin/(dashboard)/settings/actions";
import { SectionHeader } from "@/components/admin/settings/section-header";
import { useActionSubmit } from "@/components/admin/use-action-submit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type EmailProviderValue = "smtp" | "resend" | "brevo";

interface ProviderChoice {
  value: EmailProviderValue;
  title: string;
  icon: typeof Mail;
  summary: string;
}

const PROVIDER_CHOICES: readonly ProviderChoice[] = [
  { value: "smtp", title: "SMTP", icon: Server, summary: "Any mail server or inbox provider" },
  { value: "resend", title: "Resend", icon: Send, summary: "resend.com — API key + verified domain" },
  { value: "brevo", title: "Brevo", icon: Mail, summary: "brevo.com — API key + verified sender" },
];

interface EmailSettingsFormProps {
  emailProvider: EmailProviderValue;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpFrom: string;
  smtpPasswordConfigured: boolean;
  resendConfigured: boolean;
  brevoConfigured: boolean;
}

export function EmailSettingsForm(props: EmailSettingsFormProps) {
  const { onSubmit, isPending } = useActionSubmit(updateEmailSettings, "Email settings saved");
  const [provider, setProvider] = useState<EmailProviderValue>(props.emailProvider);
  const [isTestPending, startTestTransition] = useTransition();

  function runTestEmail(): void {
    startTestTransition(async () => {
      const testResult = await sendTestEmail();
      if (testResult.error) {
        toast.error(testResult.error);
      } else {
        toast.success("Test email sent — check your inbox");
      }
    });
  }

  const isConfigured =
    props.smtpFrom.length > 0 &&
    ((provider === "smtp" && props.smtpHost.length > 0) ||
      (provider === "resend" && props.resendConfigured) ||
      (provider === "brevo" && props.brevoConfigured));

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <SectionHeader
          icon={Mail}
          iconClass="bg-amber-500/10 text-amber-400"
          title="Delivery email"
          description="Optional but recommended. Buyers always keep access to their items through the order link, even without email."
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
          <div className="space-y-2">
            <Label>Provider</Label>
            <input type="hidden" name="emailProvider" value={provider} />
            <div className="grid gap-3 sm:grid-cols-3">
              {PROVIDER_CHOICES.map((choice) => {
                const ChoiceIcon = choice.icon;
                const isActive = provider === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => setProvider(choice.value)}
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
                    <ChoiceIcon className="mb-2 size-4 text-muted-foreground" />
                    <p className="text-sm font-medium">{choice.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{choice.summary}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-from">From address</Label>
            <Input
              id="smtp-from"
              name="smtpFrom"
              defaultValue={props.smtpFrom}
              placeholder="Shop <shop@yourdomain.com>"
            />
            <p className="text-xs text-muted-foreground">
              {provider === "resend"
                ? "The domain must be verified in your Resend dashboard."
                : provider === "brevo"
                  ? "The sender must be verified in your Brevo dashboard."
                  : "Used for all outgoing delivery emails."}
            </p>
          </div>

          {provider === "smtp" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtp-host">SMTP host</Label>
                <Input id="smtp-host" name="smtpHost" defaultValue={props.smtpHost} placeholder="smtp.yourhost.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-port">Port</Label>
                <Input id="smtp-port" name="smtpPort" defaultValue={props.smtpPort} placeholder="465" inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-user">Username</Label>
                <Input id="smtp-user" name="smtpUser" defaultValue={props.smtpUser} autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-password">Password</Label>
                <Input
                  id="smtp-password"
                  name="smtpPassword"
                  type="password"
                  autoComplete="off"
                  placeholder={props.smtpPasswordConfigured ? "Configured — paste to replace" : "Not configured"}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch id="smtp-secure" name="smtpSecure" defaultChecked={props.smtpSecure} />
                <Label htmlFor="smtp-secure">Use TLS (port 465)</Label>
              </div>
            </div>
          ) : (
            <>
              {/* Keep unrelated SMTP fields intact while another provider is active. */}
              <input type="hidden" name="smtpHost" value={props.smtpHost} />
              <input type="hidden" name="smtpPort" value={props.smtpPort} />
              <input type="hidden" name="smtpUser" value={props.smtpUser} />
              {props.smtpSecure ? <input type="hidden" name="smtpSecure" value="on" /> : null}
            </>
          )}

          {provider === "resend" ? (
            <div className="space-y-2">
              <Label htmlFor="resend-key">Resend API key</Label>
              <Input
                id="resend-key"
                name="resendApiKey"
                type="password"
                autoComplete="off"
                placeholder={props.resendConfigured ? "Configured — paste to replace" : "re_…"}
              />
              <p className="text-xs text-muted-foreground">
                Create one at resend.com → API Keys. Sending permission is enough.
              </p>
            </div>
          ) : null}

          {provider === "brevo" ? (
            <div className="space-y-2">
              <Label htmlFor="brevo-key">Brevo API key</Label>
              <Input
                id="brevo-key"
                name="brevoApiKey"
                type="password"
                autoComplete="off"
                placeholder={props.brevoConfigured ? "Configured — paste to replace" : "xkeysib-…"}
              />
              <p className="text-xs text-muted-foreground">
                Create one at app.brevo.com → SMTP &amp; API → API Keys.
              </p>
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save email settings"}
          </Button>
          <Button type="button" variant="outline" onClick={runTestEmail} disabled={isTestPending}>
            {isTestPending ? "Sending…" : "Send test email"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

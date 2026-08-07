"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { useState } from "react";
import { toast } from "sonner";

import { Fingerprint } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { SectionHeader } from "@/components/admin/settings/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const QR_SIZE_PX = 200;

interface TwoFactorCardProps {
  initialEnabled: boolean;
}

interface PendingEnrollment {
  qrCodeDataUrl: string;
  backupCodes: string[];
}

export function TwoFactorCard({ initialEnabled }: TwoFactorCardProps) {
  const [isEnabled, setIsEnabled] = useState(initialEnabled);
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [pendingEnrollment, setPendingEnrollment] = useState<PendingEnrollment | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function startEnrollment(): Promise<void> {
    setIsBusy(true);
    const enableResult = await authClient.twoFactor.enable({ password });
    if (enableResult.error) {
      toast.error(enableResult.error.message ?? "Could not start 2FA enrollment");
      setIsBusy(false);
      return;
    }
    const qrCodeDataUrl = await QRCode.toDataURL(enableResult.data.totpURI, {
      width: QR_SIZE_PX,
      margin: 1,
    });
    setPendingEnrollment({ qrCodeDataUrl, backupCodes: enableResult.data.backupCodes });
    setIsBusy(false);
  }

  async function confirmEnrollment(): Promise<void> {
    setIsBusy(true);
    const verifyResult = await authClient.twoFactor.verifyTotp({ code: totpCode });
    if (verifyResult.error) {
      toast.error(verifyResult.error.message ?? "Invalid code");
      setIsBusy(false);
      return;
    }
    setIsEnabled(true);
    setPendingEnrollment(null);
    setPassword("");
    setTotpCode("");
    setIsBusy(false);
    toast.success("Two-factor authentication enabled");
  }

  async function disableTwoFactor(): Promise<void> {
    setIsBusy(true);
    const disableResult = await authClient.twoFactor.disable({ password });
    if (disableResult.error) {
      toast.error(disableResult.error.message ?? "Could not disable 2FA");
      setIsBusy(false);
      return;
    }
    setIsEnabled(false);
    setPassword("");
    setIsBusy(false);
    toast.success("Two-factor authentication disabled");
  }

  return (
    <Card>
      <SectionHeader
        icon={Fingerprint}
        iconClass="bg-violet-500/10 text-violet-400"
        title="Two-factor authentication"
        description={
          isEnabled
            ? "TOTP is enabled for your account."
            : "Protect the admin panel with a TOTP authenticator app."
        }
        badge={
          isEnabled ? (
            <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-green-500">
              Enabled
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Off
            </Badge>
          )
        }
      />
      <CardContent className="space-y-4">
        {pendingEnrollment ? (
          <div className="space-y-4">
            <div className="flex flex-col items-start gap-4 sm:flex-row">
              <Image
                src={pendingEnrollment.qrCodeDataUrl}
                alt="TOTP enrollment QR code"
                width={QR_SIZE_PX}
                height={QR_SIZE_PX}
                className="rounded-md border bg-white p-2"
              />
              <div className="space-y-2 text-sm">
                <p className="font-medium">Backup codes</p>
                <p className="text-muted-foreground">
                  Store these somewhere safe — each works once if you lose your authenticator.
                </p>
                <ul className="grid grid-cols-2 gap-1 font-mono text-xs">
                  {pendingEnrollment.backupCodes.map((backupCode) => (
                    <li key={backupCode}>{backupCode}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmTotp">Enter the code from your app to confirm</Label>
              <Input
                id="confirmTotp"
                inputMode="numeric"
                placeholder="123456"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="max-w-sm space-y-2">
            <Label htmlFor="twoFactorPassword">Account password</Label>
            <Input
              id="twoFactorPassword"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Confirm with your password"
            />
          </div>
        )}
      </CardContent>
      <CardFooter>
        {pendingEnrollment ? (
          <Button onClick={confirmEnrollment} disabled={isBusy || totpCode.length === 0}>
            Confirm and enable
          </Button>
        ) : isEnabled ? (
          <Button variant="destructive" onClick={disableTwoFactor} disabled={isBusy || password.length === 0}>
            Disable 2FA
          </Button>
        ) : (
          <Button onClick={startEnrollment} disabled={isBusy || password.length === 0}>
            Enable 2FA
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

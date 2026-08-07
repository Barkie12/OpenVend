"use client";

import { ImageIcon, Store } from "lucide-react";
import Image from "next/image";
import { useRef, useTransition } from "react";
import { toast } from "sonner";

import {
  removeShopLogo,
  setShopLogo,
  updateGeneralSettings,
} from "@/app/admin/(dashboard)/settings/actions";
import { SectionHeader } from "@/components/admin/settings/section-header";
import { useActionSubmit } from "@/components/admin/use-action-submit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { imageUrl } from "@/lib/image-url";
import { uploadFilesToServer } from "@/lib/upload-client";

const LOGO_PREVIEW_PX = 56;

interface GeneralSettingsFormProps {
  name: string;
  description: string;
  currency: string;
  termsOfService: string;
  logoPath: string | null;
  currencies: readonly string[];
}

export function GeneralSettingsForm(props: GeneralSettingsFormProps) {
  const { onSubmit, isPending } = useActionSubmit(updateGeneralSettings, "Settings saved");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [isLogoPending, startLogoTransition] = useTransition();

  function submitLogo(): void {
    const logoInput = logoInputRef.current;
    const selectedLogo = logoInput?.files?.[0];
    if (!logoInput || !selectedLogo) {
      toast.error("Choose an image first");
      return;
    }
    startLogoTransition(async () => {
      const uploadOutcome = await uploadFilesToServer("images", [selectedLogo]);
      const uploadedLogo = uploadOutcome.uploads[0];
      if (uploadOutcome.error !== null || !uploadedLogo) {
        toast.error(uploadOutcome.error ?? "Upload failed");
        return;
      }
      const setResult = await setShopLogo(uploadedLogo.relativePath);
      if (setResult.error) {
        toast.error(setResult.error);
        return;
      }
      toast.success("Logo updated");
      logoInput.value = "";
    });
  }

  function clearLogo(): void {
    startLogoTransition(async () => {
      const removeResult = await removeShopLogo();
      if (removeResult.error) {
        toast.error(removeResult.error);
      } else {
        toast.success("Logo removed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit}>
        <Card>
          <SectionHeader
            icon={Store}
            iconClass="bg-sky-500/10 text-sky-400"
            title="General"
            description="Your shop's identity, currency and storefront content."
          />
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shop-name">Shop name</Label>
                <Input id="shop-name" name="name" defaultValue={props.name} required maxLength={80} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shop-currency">Currency</Label>
                <Select name="currency" defaultValue={props.currency}>
                  <SelectTrigger id="shop-currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {props.currencies.map((currencyOption) => (
                      <SelectItem key={currencyOption} value={currencyOption}>
                        {currencyOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Applies to new orders; existing orders keep their currency.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shop-description">Tagline / description</Label>
              <Textarea
                id="shop-description"
                name="description"
                defaultValue={props.description}
                rows={2}
                maxLength={500}
                placeholder="Shown on your storefront home page."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shop-tos">Terms of Service (Markdown, optional)</Label>
              <Textarea
                id="shop-tos"
                name="termsOfService"
                defaultValue={props.termsOfService}
                rows={6}
                placeholder="Displayed at /terms and linked from checkout."
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save general settings"}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Card>
        <SectionHeader
          icon={ImageIcon}
          iconClass="bg-pink-500/10 text-pink-400"
          title="Logo"
          description="Shown in your storefront header next to the shop name."
        />
        <CardContent className="flex flex-wrap items-center gap-4">
          {props.logoPath ? (
            <Image
              src={imageUrl(props.logoPath)}
              alt="Shop logo"
              width={LOGO_PREVIEW_PX}
              height={LOGO_PREVIEW_PX}
              className="size-14 rounded-lg border object-cover"
            />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-lg border border-dashed">
              <ImageIcon className="size-5 text-muted-foreground" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input ref={logoInputRef} type="file" accept="image/*" className="max-w-xs" />
            <Button variant="outline" onClick={submitLogo} disabled={isLogoPending}>
              {isLogoPending ? "Uploading…" : "Upload"}
            </Button>
            {props.logoPath ? (
              <Button variant="ghost" onClick={clearLogo} disabled={isLogoPending}>
                Remove
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

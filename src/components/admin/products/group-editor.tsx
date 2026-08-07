"use client";

import { ArrowLeft, ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { saveProductGroup } from "@/app/admin/(dashboard)/products/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { imageUrl } from "@/lib/image-url";
import { uploadFilesToServer } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

const SECTION_TITLE_CLASS =
  "flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground";
const DEFAULT_BADGE_COLOR = "#7c3aed";
const PREVIEW_SIZE_PX = 112;

export interface GroupProductOption {
  id: string;
  name: string;
}

export interface GroupEditorInitial {
  name: string;
  imagePath: string | null;
  visibility: "public" | "hidden";
  badgeText: string;
  badgeColor: string;
  productIds: string[];
}

interface GroupEditorProps {
  mode: "create" | "edit";
  groupId: string | null;
  products: GroupProductOption[];
  initial: GroupEditorInitial;
}

export function GroupEditor({ mode, groupId, products, initial }: GroupEditorProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial.name);
  const [imagePath, setImagePath] = useState<string | null>(initial.imagePath);
  const [visibility, setVisibility] = useState<"public" | "hidden">(initial.visibility);
  const [badgeEnabled, setBadgeEnabled] = useState(initial.badgeText.length > 0);
  const [badgeText, setBadgeText] = useState(initial.badgeText);
  const [badgeColor, setBadgeColor] = useState(initial.badgeColor || DEFAULT_BADGE_COLOR);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set(initial.productIds));
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, startSaving] = useTransition();

  async function handleImagePick(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file) {
      return;
    }
    setIsUploading(true);
    const uploadResult = await uploadFilesToServer("images", [file]);
    setIsUploading(false);
    if (uploadResult.error !== null || !uploadResult.uploads[0]) {
      toast.error(uploadResult.error ?? "Upload failed");
      return;
    }
    setImagePath(uploadResult.uploads[0].relativePath);
  }

  function toggleProduct(productId: string): void {
    setSelectedProductIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(productId)) {
        nextIds.delete(productId);
      } else {
        nextIds.add(productId);
      }
      return nextIds;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData();
    formData.set("name", name);
    formData.set("imagePath", imagePath ?? "");
    formData.set("visibility", visibility);
    formData.set("badgeText", badgeEnabled ? badgeText : "");
    formData.set("badgeColor", badgeEnabled ? badgeColor : "");
    for (const productId of selectedProductIds) {
      formData.append("productIds", productId);
    }

    startSaving(async () => {
      const saveResult = await saveProductGroup(groupId, { error: null }, formData);
      if (saveResult.error) {
        toast.error(saveResult.error);
        return;
      }
      toast.success(mode === "create" ? "Group created" : "Group saved");
      router.push("/admin/products/groups");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{mode === "create" ? "Create Group" : "Edit Group"}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "create"
              ? "Create a new group to organize your products."
              : `Editing ${initial.name}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/products/groups">
              <ArrowLeft className="size-4" />
              Cancel
            </Link>
          </Button>
          <Button type="submit" size="sm" disabled={isSaving || isUploading}>
            {isSaving ? "Saving…" : mode === "create" ? "Create group" : "Save group"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="gap-4 self-start py-4">
          <CardHeader className="pb-0">
            <CardTitle className={SECTION_TITLE_CLASS}>General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Escape From Tarkov"
                maxLength={60}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Image</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleImagePick(event.target.files)}
              />
              {imagePath ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={imageUrl(imagePath)}
                    alt=""
                    width={PREVIEW_SIZE_PX}
                    height={PREVIEW_SIZE_PX}
                    className="size-28 rounded-lg border object-cover"
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      <ImagePlus className="size-4" />
                      {isUploading ? "Uploading…" : "Replace"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setImagePath(null)}
                    >
                      <Trash2 className="size-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
                >
                  <ImagePlus className="size-5" />
                  {isUploading ? "Uploading…" : "Select an image"}
                  <span className="text-xs">Shown next to the section title on your storefront</span>
                </button>
              )}
            </div>

            <div className="space-y-2">
              <Label>Visibility</Label>
              <div className="flex w-fit items-center rounded-md border bg-muted/50 p-0.5">
                {(
                  [
                    { value: "public", label: "Public" },
                    { value: "hidden", label: "Hidden" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setVisibility(option.value)}
                    className={cn(
                      "rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors",
                      visibility === option.value
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Hidden groups don&apos;t appear as sections — their products show in the general
                listing instead.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="gap-4 py-4">
            <CardHeader className="pb-0">
              <CardTitle className={SECTION_TITLE_CLASS}>Products</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {products.length === 0 ? (
                <p className="text-sm text-muted-foreground">No products yet.</p>
              ) : (
                <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg border p-1.5">
                  {products.map((product) => (
                    <label
                      key={product.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent has-data-[state=checked]:bg-primary/10"
                    >
                      <Checkbox
                        checked={selectedProductIds.has(product.id)}
                        onCheckedChange={() => toggleProduct(product.id)}
                      />
                      {product.name}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {selectedProductIds.size} selected — products moved here leave their previous group.
              </p>
            </CardContent>
          </Card>

          <Card className="gap-4 py-4">
            <CardHeader className="pb-0">
              <CardTitle className={cn(SECTION_TITLE_CLASS, "justify-between")}>
                Badge
                <Switch
                  checked={badgeEnabled}
                  onCheckedChange={setBadgeEnabled}
                  aria-label="Enable badge"
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Make the section stand out with a badge next to its title — useful for highlighting
                special offers or new products.
              </p>
              {badgeEnabled ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="badge-text">Badge text</Label>
                    <Input
                      id="badge-text"
                      value={badgeText}
                      onChange={(event) => setBadgeText(event.target.value)}
                      placeholder="NEW"
                      maxLength={30}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="badge-color">Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="badge-color"
                        type="color"
                        value={badgeColor}
                        onChange={(event) => setBadgeColor(event.target.value)}
                        className="size-9 cursor-pointer rounded-md border bg-transparent p-1"
                      />
                      <code className="text-xs text-muted-foreground">{badgeColor}</code>
                      {badgeText.length > 0 ? (
                        <span
                          className="ml-auto inline-flex rounded-md border px-2 py-0.5 text-xs font-medium"
                          style={{ color: badgeColor, borderColor: `${badgeColor}66` }}
                        >
                          {badgeText}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}

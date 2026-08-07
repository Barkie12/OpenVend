"use client";

import { CheckCircle2, ChevronDown, Info, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { saveProductFull } from "@/app/admin/(dashboard)/products/actions";
import { ManageStockDialog } from "@/components/admin/products/manage-stock-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { DeleteProductButton } from "./delete-product-button";
import { DELIVERY_TYPE_OPTIONS } from "./delivery-type-options";

export interface EditorVariant {
  /** Stable React key; equals the id for persisted variants. */
  key: string;
  id: string | null;
  name: string;
  price: string;
  compareAtPrice: string;
  minQuantity: string;
  maxQuantity: string;
}

export interface EditorTab {
  key: string;
  title: string;
  content: string;
}

export interface EditorState {
  name: string;
  slug: string;
  groupId: string;
  description: string;
  descriptionTabs: EditorTab[];
  metaTitle: string;
  metaDescription: string;
  instructions: string;
  visibility: "public" | "unlisted" | "hidden";
  upsellProductIds: string[];
  variants: EditorVariant[];
}

const MAIN_DESCRIPTION_TAB = "main";
const META_TITLE_LIMIT = 70;
const META_DESCRIPTION_LIMIT = 200;

interface ProductEditorProps {
  productId: string;
  productName: string;
  deliveryType: "serials" | "file" | "service";
  currency: string;
  groups: { id: string; name: string }[];
  /** Other products offerable as upsells on this product's page. */
  upsellOptions: { id: string; name: string }[];
  initial: EditorState;
  stockByVariantId: Record<string, number>;
  imagesCard: ReactNode;
  filesCard: ReactNode | null;
}

const MAX_UPSELL_PRODUCTS = 8;

const SECTION_TITLE_CLASS =
  "flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground";

function cloneState(state: EditorState): EditorState {
  return JSON.parse(JSON.stringify(state)) as EditorState;
}

export function ProductEditor({
  productId,
  productName,
  deliveryType,
  currency,
  groups,
  upsellOptions,
  initial,
  stockByVariantId,
  imagesCard,
  filesCard,
}: ProductEditorProps) {
  const router = useRouter();
  const [baseline, setBaseline] = useState<EditorState>(initial);
  const [draft, setDraft] = useState<EditorState>(() => cloneState(initial));
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [activeDescriptionTab, setActiveDescriptionTab] = useState<string>(MAIN_DESCRIPTION_TAB);
  const [isSaving, startSaving] = useTransition();

  const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  function patchDraft(patch: Partial<EditorState>): void {
    setDraft((currentDraft) => ({ ...currentDraft, ...patch }));
  }

  function patchVariant(key: string, patch: Partial<EditorVariant>): void {
    setDraft((currentDraft) => ({
      ...currentDraft,
      variants: currentDraft.variants.map((variant) =>
        variant.key === key ? { ...variant, ...patch } : variant,
      ),
    }));
  }

  function toggleExpanded(key: string): void {
    setExpandedKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (nextKeys.has(key)) {
        nextKeys.delete(key);
      } else {
        nextKeys.add(key);
      }
      return nextKeys;
    });
  }

  function addVariant(): void {
    const newVariant: EditorVariant = {
      key: crypto.randomUUID(),
      id: null,
      name: "",
      price: "",
      compareAtPrice: "",
      minQuantity: "1",
      maxQuantity: "",
    };
    setDraft((currentDraft) => ({ ...currentDraft, variants: [...currentDraft.variants, newVariant] }));
    setExpandedKeys((currentKeys) => new Set(currentKeys).add(newVariant.key));
  }

  function removeVariant(key: string): void {
    if (draft.variants.length <= 1) {
      toast.error("A product needs at least one variant");
      return;
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      variants: currentDraft.variants.filter((variant) => variant.key !== key),
    }));
  }

  function addDescriptionTab(): void {
    const newTab: EditorTab = { key: crypto.randomUUID(), title: "", content: "" };
    setDraft((currentDraft) => ({
      ...currentDraft,
      descriptionTabs: [...currentDraft.descriptionTabs, newTab],
    }));
    setActiveDescriptionTab(newTab.key);
  }

  function removeDescriptionTab(key: string): void {
    setDraft((currentDraft) => ({
      ...currentDraft,
      descriptionTabs: currentDraft.descriptionTabs.filter((tab) => tab.key !== key),
    }));
    setActiveDescriptionTab(MAIN_DESCRIPTION_TAB);
  }

  function patchDescriptionTab(key: string, patch: Partial<EditorTab>): void {
    setDraft((currentDraft) => ({
      ...currentDraft,
      descriptionTabs: currentDraft.descriptionTabs.map((tab) =>
        tab.key === key ? { ...tab, ...patch } : tab,
      ),
    }));
  }

  function discardChanges(): void {
    setDraft(cloneState(baseline));
  }

  function saveChanges(): void {
    startSaving(async () => {
      const saveResult = await saveProductFull(productId, {
        name: draft.name,
        slug: draft.slug,
        description: draft.description,
        descriptionTabs: draft.descriptionTabs.map((tab) => ({ title: tab.title, content: tab.content })),
        metaTitle: draft.metaTitle,
        metaDescription: draft.metaDescription,
        groupId: draft.groupId,
        instructions: draft.instructions,
        visibility: draft.visibility,
        upsellProductIds: draft.upsellProductIds,
        variants: draft.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          minQuantity: variant.minQuantity,
          maxQuantity: variant.maxQuantity,
        })),
      });

      if (saveResult.error !== null || saveResult.variantIds === null) {
        toast.error(saveResult.error ?? "Saving failed");
        return;
      }

      const persistedIds = saveResult.variantIds;
      const savedState: EditorState = {
        ...draft,
        variants: draft.variants.map((variant, index) => {
          const persistedId = persistedIds[index] ?? variant.id;
          return { ...variant, id: persistedId, key: persistedId ?? variant.key };
        }),
      };
      setDraft(savedState);
      setBaseline(cloneState(savedState));
      toast.success("Product saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 pb-24">
      <Tabs defaultValue="general">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="pricing">Pricing &amp; Stock</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4 space-y-4">
          <Card className="gap-4 py-4">
            <CardHeader className="pb-0">
              <CardTitle className={SECTION_TITLE_CLASS}>General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editor-name">Name</Label>
                <Input
                  id="editor-name"
                  value={draft.name}
                  onChange={(event) => patchDraft({ name: event.target.value })}
                  maxLength={120}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="editor-group">
                    Group <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Select value={draft.groupId} onValueChange={(nextGroupId) => patchDraft({ groupId: nextGroupId })}>
                    <SelectTrigger id="editor-group" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No group</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editor-slug">Slug</Label>
                  <Input
                    id="editor-slug"
                    value={draft.slug}
                    onChange={(event) => patchDraft({ slug: event.target.value })}
                    maxLength={60}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {imagesCard}

          <Card className="gap-4 py-4">
            <CardHeader className="flex flex-row items-center justify-between pb-0">
              <CardTitle className={SECTION_TITLE_CLASS}>Description</CardTitle>
              <Button size="sm" variant="outline" onClick={addDescriptionTab}>
                <Plus className="size-4" />
                Add tab
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setActiveDescriptionTab(MAIN_DESCRIPTION_TAB)}
                  className={cn(
                    "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                    activeDescriptionTab === MAIN_DESCRIPTION_TAB
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  Description
                </button>
                {draft.descriptionTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveDescriptionTab(tab.key)}
                    className={cn(
                      "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                      activeDescriptionTab === tab.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {tab.title.length > 0 ? tab.title : "New tab"}
                  </button>
                ))}
              </div>

              {activeDescriptionTab === MAIN_DESCRIPTION_TAB ? (
                <Textarea
                  value={draft.description}
                  onChange={(event) => patchDraft({ description: event.target.value })}
                  rows={12}
                  placeholder="Describe the product. Markdown is supported."
                />
              ) : (
                draft.descriptionTabs
                  .filter((tab) => tab.key === activeDescriptionTab)
                  .map((tab) => (
                    <div key={tab.key} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor={`tab-title-${tab.key}`}>Title</Label>
                        <Input
                          id={`tab-title-${tab.key}`}
                          value={tab.title}
                          onChange={(event) => patchDescriptionTab(tab.key, { title: event.target.value })}
                          placeholder="SEO"
                          maxLength={60}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`tab-content-${tab.key}`}>Content</Label>
                        <Textarea
                          id={`tab-content-${tab.key}`}
                          value={tab.content}
                          onChange={(event) =>
                            patchDescriptionTab(tab.key, { content: event.target.value })
                          }
                          rows={12}
                          placeholder="Tab content shown to buyers on the product page. Markdown is supported."
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          onClick={() => removeDescriptionTab(tab.key)}
                        >
                          <Trash2 className="size-4" />
                          Remove tab
                        </Button>
                      </div>
                    </div>
                  ))
              )}
            </CardContent>
          </Card>

          <Card className="gap-4 py-4">
            <CardHeader className="pb-0">
              <CardTitle className={SECTION_TITLE_CLASS}>SEO</CardTitle>
              <CardDescription>
                Used in search results and link previews. Empty fields fall back to the product name
                and description.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="editor-meta-title">Meta title</Label>
                  <span className="text-xs text-muted-foreground">
                    {draft.metaTitle.length}/{META_TITLE_LIMIT}
                  </span>
                </div>
                <Input
                  id="editor-meta-title"
                  value={draft.metaTitle}
                  onChange={(event) => patchDraft({ metaTitle: event.target.value })}
                  maxLength={META_TITLE_LIMIT}
                  placeholder={draft.name}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="editor-meta-description">Meta description</Label>
                  <span className="text-xs text-muted-foreground">
                    {draft.metaDescription.length}/{META_DESCRIPTION_LIMIT}
                  </span>
                </div>
                <Textarea
                  id="editor-meta-description"
                  value={draft.metaDescription}
                  onChange={(event) => patchDraft({ metaDescription: event.target.value })}
                  maxLength={META_DESCRIPTION_LIMIT}
                  rows={3}
                  placeholder="A short pitch that shows up under the title on Google."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing" className="mt-4 space-y-4">
          <Card className="gap-4 py-4">
            <CardHeader className="pb-0">
              <CardTitle className={SECTION_TITLE_CLASS}>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Deliverables type</Label>
                <div className="grid gap-3 lg:grid-cols-3">
                  {DELIVERY_TYPE_OPTIONS.map((option) => {
                    const isActive = option.value === deliveryType;
                    const OptionIcon = option.icon;
                    return (
                      <div
                        key={option.value}
                        className={cn(
                          "relative rounded-lg border p-3",
                          isActive ? "border-primary bg-primary/5" : "opacity-50",
                        )}
                      >
                        {isActive ? (
                          <CheckCircle2 className="absolute right-3 top-3 size-4 text-primary" />
                        ) : null}
                        <OptionIcon className="mb-2 size-4 text-muted-foreground" />
                        <p className="text-sm font-medium">{option.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{option.summary}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{option.stockNote}</p>
                        <p className="text-xs text-muted-foreground">{option.bestFor}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  The delivery type is set when the product is created and cannot be changed.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="editor-instructions">Instructions</Label>
                <p className="text-xs text-muted-foreground">
                  Shown to the customer on the order page once their payment is completed. Use it to
                  explain how to redeem or use the delivered items.
                </p>
                <Textarea
                  id="editor-instructions"
                  value={draft.instructions}
                  onChange={(event) => patchDraft({ instructions: event.target.value })}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="gap-4 py-4">
            <CardHeader className="flex flex-row items-center justify-between pb-0">
              <CardTitle className={SECTION_TITLE_CLASS}>Variants</CardTitle>
              <Button size="sm" variant="outline" onClick={addVariant}>
                <Plus className="size-4" />
                Add variant
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {draft.variants.map((variant) => {
                const isExpanded = expandedKeys.has(variant.key);
                const availableStock = variant.id === null ? 0 : (stockByVariantId[variant.id] ?? 0);
                return (
                  <div key={variant.key} className="rounded-lg border">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(variant.key)}
                        className="flex flex-1 items-center gap-2 text-left"
                      >
                        <ChevronDown
                          className={cn("size-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")}
                        />
                        <span className="text-sm font-medium">
                          {variant.name.length > 0 ? variant.name : "New variant"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {variant.price.length > 0 ? `${variant.price} ${currency}` : "no price yet"}
                          {deliveryType === "serials" && variant.id !== null
                            ? ` · ${availableStock} in stock`
                            : ""}
                        </span>
                      </button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive"
                        onClick={() => removeVariant(variant.key)}
                        aria-label={`Remove variant ${variant.name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    {isExpanded ? (
                      <div className="space-y-4 border-t px-3 py-4">
                        <div className="space-y-2">
                          <Label htmlFor={`variant-name-${variant.key}`}>Variant name</Label>
                          <Input
                            id={`variant-name-${variant.key}`}
                            value={variant.name}
                            onChange={(event) => patchVariant(variant.key, { name: event.target.value })}
                            placeholder="1 Month"
                            maxLength={120}
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`variant-price-${variant.key}`}>Price ({currency})</Label>
                            <Input
                              id={`variant-price-${variant.key}`}
                              inputMode="decimal"
                              value={variant.price}
                              onChange={(event) => patchVariant(variant.key, { price: event.target.value })}
                              placeholder="9.99"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`variant-compare-${variant.key}`}>
                              Slashed price <span className="text-muted-foreground">(optional)</span>
                            </Label>
                            <Input
                              id={`variant-compare-${variant.key}`}
                              inputMode="decimal"
                              value={variant.compareAtPrice}
                              onChange={(event) =>
                                patchVariant(variant.key, { compareAtPrice: event.target.value })
                              }
                              placeholder="19.99"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`variant-min-${variant.key}`}>
                              Min quantity <span className="text-muted-foreground">(optional)</span>
                            </Label>
                            <Input
                              id={`variant-min-${variant.key}`}
                              inputMode="numeric"
                              value={variant.minQuantity}
                              onChange={(event) =>
                                patchVariant(variant.key, { minQuantity: event.target.value })
                              }
                              placeholder="1"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`variant-max-${variant.key}`}>
                              Max quantity <span className="text-muted-foreground">(optional)</span>
                            </Label>
                            <Input
                              id={`variant-max-${variant.key}`}
                              inputMode="numeric"
                              value={variant.maxQuantity}
                              onChange={(event) =>
                                patchVariant(variant.key, { maxQuantity: event.target.value })
                              }
                              placeholder="∞"
                            />
                          </div>
                        </div>

                        {deliveryType === "serials" ? (
                          <div className="space-y-2">
                            <p className={SECTION_TITLE_CLASS}>Stock &amp; delivery</p>
                            <div className="flex items-center justify-between rounded-md border border-dashed px-3 py-2">
                              <p className="text-sm text-muted-foreground">
                                {variant.id === null
                                  ? "Save the product first, then add stock to this variant."
                                  : availableStock > 0
                                    ? `${availableStock} deliverable${availableStock === 1 ? "" : "s"} available`
                                    : "No stock available"}
                              </p>
                              {variant.id !== null ? (
                                <ManageStockDialog
                                  variantId={variant.id}
                                  variantName={variant.name.length > 0 ? variant.name : "New variant"}
                                  availableStock={availableStock}
                                />
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {filesCard}
        </TabsContent>

        <TabsContent value="advanced" className="mt-4">
          <Card className="gap-4 py-4">
            <CardHeader className="pb-0">
              <CardTitle className={SECTION_TITLE_CLASS}>Advanced</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="editor-visibility">Visibility</Label>
                <Select
                  value={draft.visibility}
                  onValueChange={(nextVisibility) =>
                    patchDraft({ visibility: nextVisibility as EditorState["visibility"] })
                  }
                >
                  <SelectTrigger id="editor-visibility" className="w-full sm:w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public — listed on the storefront</SelectItem>
                    <SelectItem value="unlisted">Unlisted — reachable via link only</SelectItem>
                    <SelectItem value="hidden">Hidden — not purchasable</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className={SECTION_TITLE_CLASS}>Upsell products</p>
                <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  Upsell products are shown as suggestions to the customer when viewing this
                  product.
                </div>
                {upsellOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No other products to suggest yet.</p>
                ) : (
                  <>
                    <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border p-1.5 sm:max-w-xl">
                      {upsellOptions.map((option) => {
                        const isSelected = draft.upsellProductIds.includes(option.id);
                        const isAtCapacity =
                          !isSelected && draft.upsellProductIds.length >= MAX_UPSELL_PRODUCTS;
                        return (
                          <label
                            key={option.id}
                            className={cn(
                              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                              isAtCapacity
                                ? "cursor-not-allowed opacity-50"
                                : "cursor-pointer hover:bg-accent has-data-[state=checked]:bg-primary/10",
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              disabled={isAtCapacity}
                              onCheckedChange={() =>
                                patchDraft({
                                  upsellProductIds: isSelected
                                    ? draft.upsellProductIds.filter(
                                        (upsellId) => upsellId !== option.id,
                                      )
                                    : [...draft.upsellProductIds, option.id],
                                })
                              }
                            />
                            {option.name}
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {draft.upsellProductIds.length} / {MAX_UPSELL_PRODUCTS} selected
                    </p>
                  </>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <CardDescription>
                  Deleting removes the product, its variants, unsold stock, images and files. Order
                  history and delivered items are kept.
                </CardDescription>
                <DeleteProductButton productId={productId} productName={productName} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {isDirty ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2 shadow-lg">
            <span className="text-sm text-muted-foreground">Unsaved changes</span>
            <Button variant="ghost" size="sm" onClick={discardChanges} disabled={isSaving}>
              Discard
            </Button>
            <Button size="sm" onClick={saveChanges} disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

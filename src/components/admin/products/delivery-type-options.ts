import { FileDown, KeyRound, Wrench, type LucideIcon } from "lucide-react";

export type DeliveryTypeValue = "serials" | "file" | "service";

export interface DeliveryTypeOption {
  value: DeliveryTypeValue;
  title: string;
  icon: LucideIcon;
  summary: string;
  stockNote: string;
  bestFor: string;
}

export const DELIVERY_TYPE_OPTIONS: readonly DeliveryTypeOption[] = [
  {
    value: "serials",
    title: "Serials",
    icon: KeyRound,
    summary: "Delivers items you pre-load, one per line.",
    stockNote: "Stock: based on the number of entered items",
    bestFor: "Best for: license keys, accounts, gift cards, top-up codes",
  },
  {
    value: "file",
    title: "Files",
    icon: FileDown,
    summary: "Delivers downloadable files attached to the product.",
    stockNote: "Stock: unlimited",
    bestFor: "Best for: e-books, templates, digital assets",
  },
  {
    value: "service",
    title: "Service",
    icon: Wrench,
    summary: "Delivers only your instructions; you fulfil the order manually.",
    stockNote: "Stock: unlimited",
    bestFor: "Best for: custom work, boosting, design services",
  },
];

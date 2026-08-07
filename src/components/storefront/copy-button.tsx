"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const COPIED_RESET_MS = 2000;

interface CopyButtonProps {
  value: string;
  label: string;
  /** Renders a compact icon-only button, e.g. for per-line copy actions. */
  iconOnly?: boolean;
}

export function CopyButton({ value, label, iconOnly = false }: CopyButtonProps) {
  const [hasCopied, setHasCopied] = useState(false);

  async function copyToClipboard(): Promise<void> {
    await navigator.clipboard.writeText(value);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), COPIED_RESET_MS);
  }

  if (iconOnly) {
    return (
      <Button variant="ghost" size="icon" className="size-7" onClick={copyToClipboard} aria-label={label}>
        {hasCopied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={copyToClipboard} aria-label={label}>
      {hasCopied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
      {hasCopied ? "Copied" : "Copy"}
    </Button>
  );
}

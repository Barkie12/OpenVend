"use client";

import { Ban } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { addBlacklistRule } from "@/app/admin/(dashboard)/blacklist/actions";
import { Button } from "@/components/ui/button";

interface BlacklistQuickActionsProps {
  email: string;
  ipAddress: string | null;
  orderNumber: number;
}

export function BlacklistQuickActions({ email, ipAddress, orderNumber }: BlacklistQuickActionsProps) {
  const [isPending, startTransition] = useTransition();

  function blacklist(type: "email" | "ip", value: string): void {
    const formData = new FormData();
    formData.set("type", type);
    formData.set("value", value);
    formData.set("note", `From order #${orderNumber}`);
    startTransition(async () => {
      const addResult = await addBlacklistRule({ error: null }, formData);
      if (addResult.error) {
        toast.error(addResult.error);
      } else {
        toast.success(`${type === "email" ? "E-mail" : "IP"} added to the blacklist`);
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => blacklist("email", email)} disabled={isPending}>
        <Ban className="size-4" />
        Blacklist e-mail
      </Button>
      {ipAddress ? (
        <Button size="sm" variant="outline" onClick={() => blacklist("ip", ipAddress)} disabled={isPending}>
          <Ban className="size-4" />
          Blacklist IP
        </Button>
      ) : null}
    </div>
  );
}

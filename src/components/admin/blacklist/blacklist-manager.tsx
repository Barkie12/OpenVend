"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRef, useTransition } from "react";
import { toast } from "sonner";

import { addBlacklistRule, deleteBlacklistRule } from "@/app/admin/(dashboard)/blacklist/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface BlacklistRuleRow {
  id: string;
  type: "email" | "ip" | "country";
  value: string;
  note: string | null;
  createdAt: string;
}

interface BlacklistManagerProps {
  rules: BlacklistRuleRow[];
}

export function BlacklistManager({ rules }: BlacklistManagerProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  function submitRule(formData: FormData): void {
    startTransition(async () => {
      const addResult = await addBlacklistRule({ error: null }, formData);
      if (addResult.error) {
        toast.error(addResult.error);
      } else {
        toast.success("Rule added");
        formRef.current?.reset();
      }
    });
  }

  function removeRule(ruleId: string): void {
    startTransition(async () => {
      const deleteResult = await deleteBlacklistRule(ruleId);
      if (deleteResult.error) {
        toast.error(deleteResult.error);
      } else {
        toast.success("Rule removed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <form
        ref={formRef}
        action={submitRule}
        className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
      >
        <div className="w-36 space-y-1">
          <label htmlFor="rule-type" className="text-xs font-medium">
            Type
          </label>
          <Select name="type" defaultValue="email">
            <SelectTrigger id="rule-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="ip">IP address</SelectItem>
              <SelectItem value="country">Country</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-52 flex-1 space-y-1">
          <label htmlFor="rule-value" className="text-xs font-medium">
            Value
          </label>
          <Input
            id="rule-value"
            name="value"
            placeholder="user@example.com, @tempmail.com, 1.2.3.4 or US"
            required
          />
        </div>
        <div className="min-w-40 flex-1 space-y-1">
          <label htmlFor="rule-note" className="text-xs font-medium">
            Note (optional)
          </label>
          <Input id="rule-note" name="note" placeholder="Chargeback on order #1042" />
        </div>
        <Button type="submit" disabled={isPending}>
          <Plus className="size-4" />
          Add rule
        </Button>
      </form>

      {rules.length === 0 ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          No blacklist rules. Emails support exact matches or whole domains with “@domain.com”.
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {rule.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">{rule.value}</TableCell>
                  <TableCell className="text-muted-foreground">{rule.note ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{rule.createdAt}</TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => removeRule(rule.id)}
                      disabled={isPending}
                      aria-label={`Remove rule ${rule.value}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

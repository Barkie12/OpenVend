"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { deleteProductGroup } from "@/app/admin/(dashboard)/products/actions";
import { Button } from "@/components/ui/button";

interface GroupRowActionsProps {
  groupId: string;
  groupName: string;
}

export function GroupRowActions({ groupId, groupName }: GroupRowActionsProps) {
  const [isPending, startTransition] = useTransition();

  function removeGroup(): void {
    startTransition(async () => {
      const deleteResult = await deleteProductGroup(groupId);
      if (deleteResult.error) {
        toast.error(deleteResult.error);
      } else {
        toast.success("Group deleted — its products are now ungrouped");
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button asChild size="icon" variant="ghost" aria-label={`Edit group ${groupName}`}>
        <Link href={`/admin/products/groups/${groupId}`}>
          <Pencil className="size-4" />
        </Link>
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="text-destructive"
        onClick={removeGroup}
        disabled={isPending}
        aria-label={`Delete group ${groupName}`}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

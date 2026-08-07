"use client";

import { useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/action-result";

type FormServerAction = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;

interface ActionSubmit {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
}

/** Shared submit handler for admin forms: serializes the form, runs the action, toasts the result. */
export function useActionSubmit(action: FormServerAction, successMessage: string): ActionSubmit {
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const actionResult = await action({ error: null }, formData);
      if (actionResult.error) {
        toast.error(actionResult.error);
      } else {
        toast.success(successMessage);
      }
    });
  }

  return { onSubmit, isPending };
}

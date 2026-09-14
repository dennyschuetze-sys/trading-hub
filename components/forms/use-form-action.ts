"use client";

import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import type { FormState } from "@/lib/form-data";

/**
 * Wie useActionState, aber per onSubmit: React leert Formulare mit `action` nach jedem
 * Absenden. So bleiben die Eingaben bei einem Validierungsfehler erhalten.
 */
export function useFormAction(
  action: (prev: FormState, formData: FormData) => Promise<FormState>,
  prepare?: (formData: FormData) => void,
) {
  const [state, dispatch, actionPending] = useActionState(action, {});
  const [transitionPending, startTransition] = useTransition();

  // Lange Formulare: Fehler zusätzlich als Hinweis oben einblenden
  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    prepare?.(formData);
    startTransition(() => dispatch(formData));
  };

  return { state, onSubmit, pending: actionPending || transitionPending };
}

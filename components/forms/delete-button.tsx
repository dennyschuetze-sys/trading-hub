"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type DeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
};

/** Sicherheitsabfrage vor dem Löschen – auch für Auslöser, die nicht selbst ein Knopf sind (z. B. ein Menüeintrag). */
export function DeleteDialog({ open, onOpenChange, title, description, onConfirm }: DeleteDialogProps) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              // Dialog offen lassen, bis das Löschen fertig ist (meist folgt eine Weiterleitung)
              e.preventDefault();
              startTransition(async () => {
                try {
                  await onConfirm();
                  onOpenChange(false);
                } catch {
                  toast.error("Löschen fehlgeschlagen. Bitte versuche es erneut.");
                }
              });
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Endgültig löschen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteButton(props: Pick<DeleteDialogProps, "title" | "description" | "onConfirm">) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
        Löschen
      </Button>
      <DeleteDialog open={open} onOpenChange={setOpen} {...props} />
    </>
  );
}

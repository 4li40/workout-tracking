"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexErrorMessage } from "@/lib/convexError";

interface DeleteTemplateTarget {
  readonly _id: Id<"workoutTemplates">;
  readonly title: string;
}

interface DeleteTemplateDialogProps {
  readonly template: DeleteTemplateTarget | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDeleted?: () => void;
}

function DeleteTemplateBody({
  template,
  onClose,
  onDeleted,
}: {
  readonly template: DeleteTemplateTarget;
  readonly onClose: () => void;
  readonly onDeleted?: () => void;
}) {
  const removeTemplate = useMutation(api.templates.remove);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (deleting) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await removeTemplate({ templateId: template._id });
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          "Could not delete routine. Please try again.",
        ),
      );
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This permanently deletes{" "}
        <span className="font-semibold text-foreground">{template.title}</span>{" "}
        and its exercise plan. Past workouts remain intact.
      </p>

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={deleting}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={deleting}
          onClick={() => {
            void handleDelete();
          }}
        >
          {deleting ? "Deleting..." : "Delete routine"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function DeleteTemplateDialog({
  template,
  onOpenChange,
  onDeleted,
}: DeleteTemplateDialogProps) {
  return (
    <Dialog
      open={template !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete routine</DialogTitle>
          <DialogDescription>{template?.title}</DialogDescription>
        </DialogHeader>

        {template !== null && (
          <DeleteTemplateBody
            key={template._id}
            template={template}
            onClose={() => onOpenChange(false)}
            onDeleted={onDeleted}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

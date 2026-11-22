"use client";

import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  readonly onDeletingChange?: (deleting: boolean) => void;
}

function DeleteTemplateBody({
  template,
  onClose,
  onDeleted,
  onBusyChange,
}: {
  readonly template: DeleteTemplateTarget;
  readonly onClose: () => void;
  readonly onDeleted?: () => void;
  readonly onBusyChange: (busy: boolean) => void;
}) {
  const removeTemplate = useMutation(api.templates.remove);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      onBusyChange(false);
    };
  }, [onBusyChange]);

  async function handleDelete() {
    if (deleting) {
      return;
    }

    setDeleting(true);
    onBusyChange(true);
    setError(null);
    try {
      await removeTemplate({ templateId: template._id });
      onBusyChange(false);
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
      onBusyChange(false);
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
  onDeletingChange,
}: DeleteTemplateDialogProps) {
  const [busy, setBusy] = useState(false);
  const onDeletingChangeRef = useRef(onDeletingChange);

  useEffect(() => {
    onDeletingChangeRef.current = onDeletingChange;
  }, [onDeletingChange]);

  const handleBusyChange = useCallback((nextBusy: boolean) => {
    setBusy(nextBusy);
    onDeletingChangeRef.current?.(nextBusy);
  }, []);

  return (
    <Dialog
      open={template !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent closeDisabled={busy}>
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
            onBusyChange={handleBusyChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

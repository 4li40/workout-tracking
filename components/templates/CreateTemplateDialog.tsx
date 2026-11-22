"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MAX_TEMPLATE_TITLE_LENGTH,
  parseTemplateTitle,
} from "@/convex/lib/templates";
import { getConvexErrorMessage } from "@/lib/convexError";

interface CreateTemplateDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated?: (templateId: Id<"workoutTemplates">) => void;
}

function CreateTemplateForm({
  onClose,
  onCreated,
}: {
  readonly onClose: () => void;
  readonly onCreated?: (templateId: Id<"workoutTemplates">) => void;
}) {
  const createTemplate = useMutation(api.templates.create);
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const parsed = parseTemplateTitle(title);
    if (parsed.kind === "error") {
      setError(parsed.message);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const templateId = await createTemplate({ title: parsed.title });
      onClose();
      if (onCreated !== undefined) {
        onCreated(templateId);
      } else {
        router.push(`/templates/${templateId}`);
      }
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          "Could not create routine. Please try again.",
        ),
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor={titleId}>Routine title</Label>
        <Input
          id={titleId}
          value={title}
          maxLength={MAX_TEMPLATE_TITLE_LENGTH}
          placeholder="e.g. Upper Body Power"
          disabled={submitting}
          autoFocus
          onChange={(event) => {
            setTitle(event.target.value);
            if (error !== null) {
              setError(null);
            }
          }}
        />
      </div>

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create routine"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateTemplateDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateTemplateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New routine</DialogTitle>
          <DialogDescription>
            Name your workout template, then add exercises and rest defaults.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <CreateTemplateForm
            key="create-template"
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

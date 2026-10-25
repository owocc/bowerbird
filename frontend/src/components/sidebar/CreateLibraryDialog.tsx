import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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
import {
  CreateLibrary,
  SelectDirectory,
} from "../../../bindings/bowerbird/core/service";
import type { LibraryInfo } from "../../../bindings/bowerbird/core/models";
import { getErrorMessage, notifyError, notifySuccess } from "@/lib/notify";
import { ErrorCodes, SuccessCodes } from "@/lib/error-codes";

export interface CreateLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the freshly created library so the caller can switch to it. */
  onCreated: (library: LibraryInfo) => void | Promise<void>;
}

const DEFAULT_LIBRARY_NAME = "MyAssets";

/**
 * Asks for a library name only.
 *
 * The storage location is chosen *after* submitting: pressing "Create" opens
 * the directory picker and the `.library` folder is created inside whatever the
 * user picks. Keeping the picker out of the form means the dialog stays a single
 * field, and the destination is decided at the moment of creation.
 */
export function CreateLibraryDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateLibraryDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(DEFAULT_LIBRARY_NAME);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Start from a clean form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(DEFAULT_LIBRARY_NAME);
    setError(null);
    setLoading(false);
  }, [open]);

  const trimmedName = name.trim();

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!trimmedName) {
      setError(getErrorMessage(ErrorCodes.LIB_NAME_REQUIRED));
      notifyError(ErrorCodes.LIB_NAME_REQUIRED);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      // Cancelling the picker simply aborts: no library is created.
      const parentDir = await SelectDirectory();
      if (!parentDir) return;

      const created = await CreateLibrary(parentDir, trimmedName);
      if (created) {
        notifySuccess(SuccessCodes.LIBRARY_CREATED);
        onOpenChange(false);
        await onCreated(created);
      }
    } catch (err) {
      setError(getErrorMessage(err));
      notifyError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm text-xs">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {t("sidebar.createLibrary.title")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t("sidebar.createLibrary.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4 pt-1">
          {error && (
            <p className="rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
              {error}
            </p>
          )}

          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("sidebar.createLibrary.namePlaceholder")}
            className="h-8 text-xs"
            disabled={loading}
          />

          <DialogFooter className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-7 text-xs"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !trimmedName}
              className="h-7 text-xs"
            >
              {loading
                ? t("setup.create.creating")
                : t("sidebar.createLibrary.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

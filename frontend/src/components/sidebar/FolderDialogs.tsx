import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface SidebarFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  submitLabel: string;
  placeholder: string;
  initialValue?: string;
  onSubmit: (value: string) => Promise<void> | void;
}

/**
 * The small single-field dialog used for both "new folder" and "rename folder".
 * Keeps the titlebar, label, input and footer styling in one place.
 */
export function SidebarFormDialog({
  open,
  onOpenChange,
  title,
  label,
  submitLabel,
  placeholder,
  initialValue = "",
  onSubmit,
}: SidebarFormDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);

  // Re-seed whenever the dialog opens with a different initial value.
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    await onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs text-xs">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">
              {label}
            </label>
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="h-8 text-xs"
            />
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-7 text-xs"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!value.trim()}
              className="h-7 text-xs"
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface DeleteFolderDialogProps {
  target: { folderId: string; folderName: string } | null;
  onClose: () => void;
  onConfirm: (folderId: string) => Promise<void> | void;
}

/** Confirmation dialog for deleting a folder. */
export function DeleteFolderDialog({
  target,
  onClose,
  onConfirm,
}: DeleteFolderDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xs text-xs">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {t("sidebar.deleteFolderTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 text-xs text-muted-foreground leading-relaxed">
          {target
            ? t("sidebar.deleteFolderConfirm", { name: target.folderName })
            : null}
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            {t("sidebar.deleteFolderHint")}
          </p>
        </div>
        <DialogFooter className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="cursor-pointer text-xs"
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={async () => {
              if (!target) return;
              const id = target.folderId;
              onClose();
              await onConfirm(id);
            }}
            className="cursor-pointer text-xs"
          >
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

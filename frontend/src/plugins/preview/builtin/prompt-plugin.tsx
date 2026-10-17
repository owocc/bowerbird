import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Copy, Check } from "lucide-react";
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import type { PreviewPlugin, InspectorExtensionProps } from "../types";
import { copyTextToClipboard } from "@/lib/clipboard";
import { toast } from "sonner";

function PromptInspectorExtension({
  item,
  isTrashView,
  api,
}: InspectorExtensionProps) {
  const { t } = useTranslation();
  const [promptValue, setPromptValue] = useState(item.prompt || "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPromptValue(item.prompt || "");
  }, [item.id, item.prompt]);

  const commitPrompt = async () => {
    if (isTrashView) return;
    const trimmed = promptValue.trim();
    if (trimmed === (item.prompt || "").trim()) return;
    await api.updateItemDetails({ prompt: promptValue });
  };

  return (
    <AccordionItem value="plugin-prompt">
      <AccordionTrigger
        action={
          promptValue.trim() ? (
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                if (await copyTextToClipboard(promptValue)) {
                  setCopied(true);
                  toast.success(t("inspector.promptCopied"));
                  window.setTimeout(() => setCopied(false), 1500);
                }
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
            >
              {copied ? (
                <Check className="size-2.5 text-emerald-500" />
              ) : (
                <Copy className="size-2.5" />
              )}
              <span>{copied ? t("inspector.copied") : t("common.copy")}</span>
            </button>
          ) : undefined
        }
      >
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="size-3 text-primary" />
          <span>{t("inspector.prompt")}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-1.5">
        <Textarea
          value={promptValue}
          disabled={isTrashView}
          onChange={(e) => setPromptValue(e.target.value)}
          onBlur={commitPrompt}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          placeholder={t("inspector.promptPlaceholder")}
          className="min-h-20 text-xs rounded-lg bg-muted/40 border-border/60 font-mono leading-relaxed resize-y"
        />
      </AccordionContent>
    </AccordionItem>
  );
}

export const PromptMetadataPlugin: PreviewPlugin = {
  id: "plugin.prompt-metadata",
  kind: "metadata",
  name: "Prompt Metadata",
  nameKey: "settings.plugins.items.prompt.name",
  description:
    "Extends asset metadata with a dedicated Prompt field for recording and searching AI generation prompts.",
  descriptionKey: "settings.plugins.items.prompt.description",
  version: "1.0.0",
  author: "Bowerbird",
  builtin: false,
  canDisable: true,
  priority: 50,
  InspectorExtension: PromptInspectorExtension,
};

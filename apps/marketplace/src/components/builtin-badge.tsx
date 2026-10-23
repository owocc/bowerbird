import { ShieldCheck } from "lucide-react";
import { isBuiltinMarketplacePlugin } from "../data/plugins";
import { useI18n } from "../lib/i18n";

export function BuiltinBadge({
  plugin,
  className = "",
}: {
  plugin: { id: string; builtin?: boolean };
  className?: string;
}) {
  const { t } = useI18n();
  if (!isBuiltinMarketplacePlugin(plugin)) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 ${className}`}
    >
      <ShieldCheck className="w-3 h-3" />
      {t("builtin")}
    </span>
  );
}

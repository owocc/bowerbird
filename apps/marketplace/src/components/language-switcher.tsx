import * as React from "react";
import { useI18n, type Locale } from "../lib/i18n";
import { Globe, Check, ChevronUp } from "lucide-react";

interface LanguageSwitcherProps {
  className?: string;
}

const LANGUAGES: Array<{ code: Locale; label: string; nativeName: string }> = [
  { code: "zh", label: "Chinese (Simplified)", nativeName: "简体中文" },
  { code: "en", label: "English", nativeName: "English" },
];

export function LanguageSwitcher({ className = "" }: LanguageSwitcherProps) {
  const { locale, setLocale } = useI18n();
  const [mounted, setMounted] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const switchLanguage = (newLocale: Locale) => {
    setLocale(newLocale);
    setIsOpen(false);
  };

  const currentLang =
    LANGUAGES.find((l) => l.code === locale) || LANGUAGES[0];

  if (!mounted) {
    return (
      <div
        className={`inline-flex items-center rounded-full border border-border bg-surface/70 w-[100px] h-[32px] ${className}`}
      />
    );
  }

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="选择语言 (Select Language)"
        className={`h-[32px] px-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/80 text-muted-foreground hover:text-foreground text-xs font-medium shadow-2xs transition-all duration-150 cursor-pointer select-none ${
          isOpen ? "border-primary/50 text-foreground bg-surface" : ""
        }`}
      >
        <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="leading-none">{currentLang.nativeName}</span>
        <ChevronUp
          className={`w-3 h-3 text-muted-foreground transition-transform duration-150 shrink-0 ${
            isOpen ? "rotate-0 text-foreground" : "rotate-180"
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="语言列表"
          className="absolute right-0 bottom-full mb-2 w-36 rounded-xl bg-card border border-border shadow-lg p-1 z-50 animate-in fade-in zoom-in-95"
        >
          {LANGUAGES.map((lang) => {
            const isSelected = lang.code === locale;
            return (
              <button
                key={lang.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => switchLanguage(lang.code)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left cursor-pointer ${
                  isSelected
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-foreground hover:bg-muted/80"
                }`}
              >
                <span>{lang.nativeName}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { default as Check } from "~icons/ri/check-line";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BACKDROP_OPACITY_MAX,
  BACKDROP_OPACITY_MIN,
  BACKDROP_PRESETS,
  backdropUsesOpacity,
  clampBackdropOpacity,
  isValidBackdropImage,
  isValidCustomGradient,
  normalizeHexColor,
  backdropLayerOpacity,
  resolveBackdropBackground,
  type BackdropMode,
  type BackdropPrefs,
} from "@/lib/backdrop";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

/** The ways the background layer can be painted, in display order. */
const MODE_OPTIONS: { id: BackdropMode; labelKey: string }[] = [
  { id: "default", labelKey: "settings.backdrop.modes.default" },
  { id: "transparent", labelKey: "settings.backdrop.modes.transparent" },
  { id: "solid", labelKey: "settings.backdrop.modes.solid" },
  { id: "gradient", labelKey: "settings.backdrop.modes.gradient" },
  { id: "image", labelKey: "settings.backdrop.modes.image" },
];

export interface BackdropSettingsProps {
  backdrop: BackdropPrefs;
  setBackdrop: (prefs: BackdropPrefs) => void;
  /** The modes on offer; "transparent" needs window vibrancy (see useAppearance). */
  modes: BackdropMode[];
  /** The concrete light/dark appearance, for the preset previews. */
  resolvedTheme: "light" | "dark";
  /**
   * Whether the window shows a material. Only "transparent" needs it, so the
   * option is hidden without it (see availableBackdropModes).
   */
  vibrancy: boolean;
}

/**
 * The Background section of the Appearance settings.
 *
 * Kept out of SettingsPage because it owns a little state of its own (the custom
 * gradient draft) and would otherwise make that file harder to scan.
 */
export function BackdropSettings({
  backdrop,
  setBackdrop,
  modes,
  resolvedTheme,
  vibrancy,
}: BackdropSettingsProps) {
  const { t } = useTranslation();
  // Draft of the custom gradient field; only "Apply" commits it.
  const [customGradient, setCustomGradient] = useState(backdrop.custom);

  const modeOptions = MODE_OPTIONS.filter((mode) => modes.includes(mode.id));
  const solidColour = normalizeHexColor(backdrop.solid);
  const backdropOpacity = clampBackdropOpacity(backdrop.opacity);
  // Draft of the picture field; only "Apply" commits it.
  const [backdropImageInput, setBackdropImageInput] = useState(backdrop.image);

  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h3 className="text-xs font-semibold">
          {t("settings.backdrop.title")}
        </h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {t("settings.backdrop.description")}
        </p>
      </div>

      {/* Mode: what the background layer paints. "Transparent" is only
          offered while the window can show a material behind it. */}
      <div
        className={cn(
          "grid gap-2",
          modeOptions.length >= 5
            ? "grid-cols-5"
            : modeOptions.length === 4
            ? "grid-cols-4"
            : "grid-cols-3"
        )}
        role="radiogroup"
      >
        {modeOptions.map((mode) => {
          const selected = backdrop.mode === mode.id;
          const preview = resolveBackdropBackground(
            { ...backdrop, mode: mode.id },
            resolvedTheme
          );
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setBackdrop({ ...backdrop, mode: mode.id })}
              className={cn(
                "group relative flex flex-col items-stretch gap-1.5 rounded-xl border p-1.5 transition-colors cursor-pointer",
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border/60 bg-muted/30 hover:border-border hover:bg-muted/60"
              )}
            >
              <div
                className="h-12 w-full rounded-lg border border-border/40 checker"
                style={{ background: preview }}
              />
              <span className="truncate text-center text-[10px] font-medium">
                {t(mode.labelKey)}
              </span>
              {selected && (
                <span className="absolute right-1 top-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-2" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {backdrop.mode === "solid" && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium">
            {t("settings.backdrop.solidLabel")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t("settings.backdrop.solidLabel")}
              value={solidColour ?? "#f3f1ec"}
              onChange={(e) =>
                setBackdrop({ ...backdrop, solid: e.target.value })
              }
              className="size-8 shrink-0 rounded-md border border-border/60 bg-transparent cursor-pointer"
            />
            <Input
              value={backdrop.solid}
              onChange={(e) =>
                setBackdrop({ ...backdrop, solid: e.target.value })
              }
              onBlur={() => {
                if (solidColour && solidColour !== backdrop.solid) {
                  setBackdrop({ ...backdrop, solid: solidColour });
                }
              }}
              placeholder="#f3f1ec"
              spellCheck={false}
              className="h-8 max-w-[140px] font-mono text-[11px]"
            />
            {!solidColour && (
              <span className="text-[10px] text-destructive">
                {t("settings.backdrop.invalidColor")}
              </span>
            )}
          </div>
        </div>
      )}

      {backdrop.mode === "gradient" && (
        <>
          <div className="grid grid-cols-4 gap-2" role="radiogroup">
            {BACKDROP_PRESETS.map((preset) => (
              <SwatchButton
                key={preset.id}
                label={t(preset.labelKey)}
                selected={!backdrop.custom && backdrop.preset === preset.id}
                preview={resolveBackdropBackground(
                  { ...backdrop, preset: preset.id, custom: "" },
                  resolvedTheme
                )}
                opacity={backdropLayerOpacity({
                  ...backdrop,
                  preset: preset.id,
                  custom: "",
                })}
                onSelect={() =>
                  setBackdrop({
                    ...backdrop,
                    mode: "gradient",
                    preset: preset.id,
                    custom: "",
                  })
                }
              />
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium">
              {t("settings.backdrop.customLabel")}
            </label>
            <Input
              value={customGradient}
              onChange={(e) => setCustomGradient(e.target.value)}
              placeholder="linear-gradient(160deg, #a18cd1 0%, #fbc2eb 100%)"
              spellCheck={false}
              className="h-8 font-mono text-[11px]"
            />
            <p className="text-[10px] leading-tight text-muted-foreground">
              {t("settings.backdrop.customHint")}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs cursor-pointer"
                disabled={
                  customGradient.trim().length > 0 &&
                  !isValidCustomGradient(customGradient)
                }
                onClick={() =>
                  setBackdrop({
                    ...backdrop,
                    mode: "gradient",
                    custom: customGradient.trim(),
                  })
                }
              >
                {t("settings.backdrop.applyCustom")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs cursor-pointer"
                disabled={!backdrop.custom}
                onClick={() =>
                  setBackdrop({ ...backdrop, custom: "" })
                }
              >
                {t("settings.backdrop.clearCustom")}
              </Button>
              {backdrop.custom && (
                <span className="text-[10px] text-muted-foreground">
                  {t("settings.backdrop.customActive")}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {backdrop.mode === "image" && (
        <div className="space-y-1.5">
          <label htmlFor="backdrop-image" className="text-[11px] font-medium">
            {t("settings.backdrop.imageLabel")}
          </label>
          <Input
            id="backdrop-image"
            value={backdropImageInput}
            onChange={(e) => setBackdropImageInput(e.target.value)}
            placeholder="file:///Users/you/Pictures/wallpaper.jpg"
            spellCheck={false}
            className="h-8 font-mono text-[11px]"
          />
          <p className="text-[10px] leading-tight text-muted-foreground">
            {t("settings.backdrop.imageHint")}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs cursor-pointer"
              disabled={
                backdropImageInput.trim().length > 0 &&
                !isValidBackdropImage(backdropImageInput)
              }
              onClick={() =>
                setBackdrop({
                  ...backdrop,
                  mode: "image",
                  image: backdropImageInput.trim(),
                })
              }
            >
              {t("settings.backdrop.applyImage")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs cursor-pointer"
              disabled={!backdrop.image}
              onClick={() => {
                setBackdropImageInput("");
                setBackdrop({ ...backdrop, image: "" });
              }}
            >
              {t("settings.backdrop.clearImage")}
            </Button>
            {backdrop.image && (
              <span className="text-[10px] text-muted-foreground">
                {t("settings.backdrop.imageActive")}
              </span>
            )}
          </div>
          {backdropImageInput.trim().length > 0 &&
            !isValidBackdropImage(backdropImageInput) && (
              <p className="text-[10px] text-destructive">
                {t("settings.backdrop.invalidImage")}
              </p>
            )}
        </div>
      )}

      {/* Opacity applies to the colour and gradient fills only: "default" is the
          theme's own surface and "transparent" is already fully clear. */}
      {backdropUsesOpacity(backdrop.mode) && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="backdrop-opacity" className="text-[11px] font-medium">
              {t("settings.backdrop.opacityLabel")}
            </label>
            <span className="font-mono text-[11px] text-muted-foreground">
              {backdropOpacity}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Slider
              id="backdrop-opacity"
              min={BACKDROP_OPACITY_MIN}
              max={BACKDROP_OPACITY_MAX}
              step={1}
              value={[backdropOpacity]}
              onValueChange={(value) =>
                setBackdrop({
                  ...backdrop,
                  opacity: Array.isArray(value) ? value[0] : value,
                })
              }
              className="flex-1"
            />
            <div className="checker h-6 w-10 shrink-0 overflow-hidden rounded-md border border-border/40">
              <div
                className="size-full"
                style={{
                  background: resolveBackdropBackground(backdrop, resolvedTheme),
                  opacity: backdropOpacity / 100,
                }}
              />
            </div>
          </div>
          <p className="text-[10px] leading-tight text-muted-foreground">
            {t("settings.backdrop.opacityHint")}
          </p>
        </div>
      )}

      <p className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
        {t("settings.backdrop.modesHint")}
      </p>


    </section>
  );
}

/** One preview tile: a background sample under its label, with a tick on select. */
function SwatchButton({
  label,
  selected,
  preview,
  checkered,
  opacity = 1,
  onSelect,
}: {
  label: string;
  selected: boolean;
  /** A CSS `background` value for the sample. */
  preview: string;
  /** Shows the transparency checkerboard behind the sample. */
  checkered?: boolean;
  /** The layer's own opacity, so a faded fill previews as faded. */
  opacity?: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col items-stretch gap-1.5 rounded-xl border p-1.5 transition-colors cursor-pointer",
        selected
          ? "border-primary bg-primary/10"
          : "border-border/60 bg-muted/30 hover:border-border hover:bg-muted/60"
      )}
    >
      <div
        className={cn(
          "h-12 w-full rounded-lg border border-border/40",
          checkered && "checker"
        )}
        style={{ background: preview, opacity }}
      />
      <span className="truncate text-center text-[10px] font-medium">
        {label}
      </span>
      {selected && (
        <span className="absolute right-1 top-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-2" />
        </span>
      )}
    </button>
  );
}

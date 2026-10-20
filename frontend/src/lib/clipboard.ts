import { Clipboard } from "@/lib/host-runtime";

/**
 * Writes plain text to the native OS clipboard via the Wails runtime, falling
 * back to the browser Clipboard API or a temporary textarea when running in a
 * standalone dev browser.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    await Clipboard.SetText(text);
    return true;
  } catch {
    // Fallback for standalone browser dev mode
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback to execCommand
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

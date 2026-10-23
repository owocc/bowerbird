/** Convert a KeyboardEvent into the stored accelerator format (CmdOrCtrl+Alt+A). */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  if ((isMac && e.metaKey) || (!isMac && e.ctrlKey) || e.metaKey) {
    mods.push("CmdOrCtrl");
  } else if (e.ctrlKey) {
    mods.push("Ctrl");
  }
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  let key = "";
  if (e.code.startsWith("Key") && e.code.length === 4) {
    key = e.code.slice(3);
  } else if (e.code.startsWith("Digit")) {
    key = e.code.slice(5);
  } else if (e.code.startsWith("F") && /^F\d{1,2}$/.test(e.code)) {
    key = e.code;
  } else {
    switch (e.code) {
      case "Comma":
        key = ",";
        break;
      case "Period":
        key = ".";
        break;
      case "Equal":
      case "NumpadAdd":
        key = "=";
        break;
      case "Minus":
      case "NumpadSubtract":
        key = "-";
        break;
      case "Slash":
        key = "/";
        break;
      case "Space":
        key = "Space";
        break;
      default:
        if (e.key.length === 1) key = e.key.toUpperCase();
        else key = e.key;
    }
  }
  if (!key || ["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
    return null;
  }
  return [...mods, key].join("+");
}

export function displayAccelerator(accel: string, isMac: boolean): string {
  if (!accel) return "";
  const parts = accel.split("+");
  const out: string[] = [];
  let key = "";
  for (const p of parts) {
    switch (p.toLowerCase()) {
      case "cmdorctrl":
        out.push(isMac ? "⌘" : "Ctrl");
        break;
      case "ctrl":
        out.push(isMac ? "⌃" : "Ctrl");
        break;
      case "alt":
        out.push(isMac ? "⌥" : "Alt");
        break;
      case "shift":
        out.push(isMac ? "⇧" : "Shift");
        break;
      default:
        key = p;
    }
  }
  if (isMac) return out.join("") + key;
  return [...out, key].filter(Boolean).join("+");
}

export function eventMatchesAccelerator(e: KeyboardEvent, accel: string): boolean {
  const got = eventToAccelerator(e);
  if (!got || !accel) return false;
  return normalizeAccel(got) === normalizeAccel(accel);
}

function normalizeAccel(accel: string): string {
  return accel
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .join("+");
}

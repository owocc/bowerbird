import type {
  NativeRenderer,
  PluginHookName,
  PluginKind,
  PluginManifest,
  PluginPermissions,
  PluginSetting,
} from "./types";

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

const KINDS: PluginKind[] = ["preview", "metadata", "resolver", "action"];
const HOOKS: PluginHookName[] = ["resolveUrl", "inspect", "actions", "runAction", "thumbnail"];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Validates a `plugin.json` object against the native plugin schema.
 *
 * This function is safe to use in tests and tooling. The desktop host performs
 * the same validation in Go before a plugin is loaded.
 */
export function validatePluginManifest(manifest: unknown): ManifestValidationResult {
  const errors: string[] = [];
  if (!manifest || typeof manifest !== "object") {
    return { valid: false, errors: ["Manifest must be a non-null object"] };
  }

  const m = manifest as Record<string, unknown>;

  if (typeof m.id !== "string" || !m.id.trim()) {
    errors.push("Missing or invalid 'id': must be a non-empty string");
  } else if (!/^[a-zA-Z0-9_\-.]+$/.test(m.id)) {
    errors.push("Invalid 'id': only alphanumeric characters, dots, dashes and underscores are allowed");
  }
  if (typeof m.name !== "string" || !m.name.trim()) {
    errors.push("Missing or invalid 'name': must be a non-empty string");
  }
  if (typeof m.version !== "string" || !m.version.trim()) {
    errors.push("Missing or invalid 'version': must be a non-empty semver string");
  }
  if (m.kind !== undefined && !KINDS.includes(m.kind as PluginKind)) {
    errors.push(`Invalid 'kind': expected one of ${KINDS.join(", ")}`);
  }

  const native = m.native ?? (m.preview && (m.preview as Record<string, unknown>).renderer);
  if (native !== undefined && (typeof native !== "string" || !native.trim())) {
    errors.push("Invalid 'native': must be a non-empty renderer id");
  }
  if (m.main !== undefined && (typeof m.main !== "string" || !m.main.trim())) {
    errors.push("If specified, 'main' must be a non-empty string");
  }
  if (m.main === undefined && native === undefined) {
    errors.push("A plugin must declare either 'main' (JS hooks) or 'native' (host renderer)");
  }

  if (m.extensions !== undefined && !isStringArray(m.extensions)) {
    errors.push("If specified, 'extensions' must be an array of strings");
  }
  if (m.mimePrefixes !== undefined && !isStringArray(m.mimePrefixes)) {
    errors.push("If specified, 'mimePrefixes' must be an array of strings");
  }
  if (m.urlHosts !== undefined && !isStringArray(m.urlHosts)) {
    errors.push("If specified, 'urlHosts' must be an array of strings");
  }
  if (m.urlPatterns !== undefined) {
    if (!isStringArray(m.urlPatterns)) {
      errors.push("If specified, 'urlPatterns' must be an array of strings");
    } else {
      for (const pattern of m.urlPatterns) {
        try {
          new RegExp(pattern);
        } catch {
          errors.push(`Invalid regular expression in 'urlPatterns': ${pattern}`);
        }
      }
    }
  }
  if (m.hooks !== undefined) {
    if (!isStringArray(m.hooks)) {
      errors.push("If specified, 'hooks' must be an array of strings");
    } else {
      for (const hook of m.hooks) {
        if (!HOOKS.includes(hook as PluginHookName)) {
          errors.push(`Unknown hook '${hook}'`);
        }
      }
    }
  }
  if (typeof m.main === "string" && m.main.trim() && (!Array.isArray(m.hooks) || m.hooks.length === 0)) {
    errors.push("JavaScript plugins must declare the hooks they export in 'hooks'");
  }
  if (m.permissions !== undefined) {
    const permissions = m.permissions as Record<string, unknown>;
    if (permissions.network !== undefined && !isStringArray(permissions.network)) {
      errors.push("'permissions.network' must be an array of strings");
    }
    if (permissions.process !== undefined && !isStringArray(permissions.process)) {
      errors.push("'permissions.process' must be an array of strings");
    }
    if (permissions.openExternal !== undefined && typeof permissions.openExternal !== "boolean") {
      errors.push("'permissions.openExternal' must be a boolean");
    }
    if (Array.isArray(permissions.network)) {
      for (const host of permissions.network) {
        if (typeof host !== "string" || !host.trim() || host === "*" || host.includes("://") || /[\\/]/.test(host)) {
          errors.push(`Invalid network permission host: ${String(host)}`);
        }
      }
    }
    if (Array.isArray(permissions.process)) {
      for (const command of permissions.process) {
        if (typeof command !== "string" || !command.trim() || command === "*") {
          errors.push(`Invalid process permission: ${String(command)}`);
        }
      }
    }
  }

  if (m.priority !== undefined && (typeof m.priority !== "number" || Number.isNaN(m.priority))) {
    errors.push("If specified, 'priority' must be a number");
  }
  if (m.settings !== undefined && !Array.isArray(m.settings)) {
    errors.push("If specified, 'settings' must be an array");
  }

  return { valid: errors.length === 0, errors };
}

function normalizeList(values?: string[], lower = false): string[] {
  if (!values) return [];
  return values
    .map((value) => {
      let v = String(value).trim();
      if (lower) v = v.replace(/^\./, "").toLowerCase();
      return v;
    })
    .filter(Boolean);
}

/** Applies runtime defaults without changing hook implementations. */
export function normalizePluginManifest(manifest: PluginManifest): PluginManifest {
  const preview = manifest.preview;
  const normalized: PluginManifest = {
    ...manifest,
    kind: manifest.kind ?? (manifest.native || preview ? "preview" : "metadata"),
    native: manifest.native ?? preview?.renderer,
    extensions: normalizeList(manifest.extensions ?? preview?.extensions, true),
    mimePrefixes: normalizeList(manifest.mimePrefixes ?? preview?.mimePrefixes).map((v) => v.toLowerCase()),
    urlHosts: normalizeList(manifest.urlHosts).map((v) => v.toLowerCase()),
    urlPatterns: normalizeList(manifest.urlPatterns),
    priority: manifest.priority ?? preview?.priority ?? 50,
    supportsZoom: manifest.supportsZoom ?? preview?.supportsZoom ?? false,
    permissions: {
      network: normalizeList(manifest.permissions?.network),
      process: normalizeList(manifest.permissions?.process),
      openExternal: manifest.permissions?.openExternal ?? false,
    } satisfies PluginPermissions,
    settings: (manifest.settings ?? []) as PluginSetting[],
    hooks: normalizeList(manifest.hooks) as PluginHookName[],
  };
  if (!normalized.main && normalized.native) {
    delete normalized.main;
  } else if (!normalized.main) {
    normalized.main = "index.js";
  }
  return normalized;
}

/** Convenience helper for tooling that wants a normalized renderer id. */
export function nativeRenderer(manifest: PluginManifest): NativeRenderer | undefined {
  return manifest.native ?? manifest.preview?.renderer;
}

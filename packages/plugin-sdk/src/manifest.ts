import type { PluginKind } from "./types";

/**
 * Manifest schema for remote Bowerbird plugins.
 */
export interface PluginManifest {
  /** Unique reverse-domain or namespaced plugin id (e.g. "official.markdown-preview") */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Semantic version string (e.g. "1.0.0") */
  version: string;
  /** Concise description of plugin functionality */
  description: string;
  /** Author or publisher name */
  author: string;
  /** Capability kind: "preview" or "metadata" */
  kind: PluginKind;
  /** Evaluation priority (1-85) */
  priority: number;
  /** List of lowercase file extensions supported (without dot, e.g. ["md", "markdown"]) */
  extensions: string[];
  /** Optional MIME prefixes or types (e.g. ["text/markdown", "audio/"]) */
  mimePrefixes?: string[];
  /** Whether the plugin Viewport supports zooming and zoom controls */
  supportsZoom?: boolean;
  /** Entrypoint JavaScript file relative to plugin folder (default: "index.js") */
  main?: string;
  /** Optional stylesheet file relative to plugin folder (e.g. "style.css") */
  style?: string;
  /** Optional icon filename or URL */
  icon?: string;
  /** Optional homepage URL */
  homepage?: string;
  /** Optional source code repository URL */
  repository?: string;
  /** Optional software license (e.g. "MIT", "Apache-2.0") */
  license?: string;
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a plugin manifest object against the Bowerbird manifest schema.
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
    errors.push("Invalid 'id': only alphanumeric characters, dots, dashes, and underscores allowed");
  }

  if (typeof m.name !== "string" || !m.name.trim()) {
    errors.push("Missing or invalid 'name': must be a non-empty string");
  }

  if (typeof m.version !== "string" || !m.version.trim()) {
    errors.push("Missing or invalid 'version': must be a non-empty semver string");
  }

  if (typeof m.description !== "string") {
    errors.push("Missing or invalid 'description': must be a string");
  }

  if (typeof m.author !== "string" || !m.author.trim()) {
    errors.push("Missing or invalid 'author': must be a non-empty string");
  }

  if (m.kind !== "preview" && m.kind !== "metadata") {
    errors.push("Invalid 'kind': must be 'preview' or 'metadata'");
  }

  if (typeof m.priority !== "number" || isNaN(m.priority) || m.priority < 0 || m.priority > 100) {
    errors.push("Invalid 'priority': must be a number between 0 and 100");
  }

  if (!Array.isArray(m.extensions)) {
    errors.push("Missing or invalid 'extensions': must be an array of strings");
  } else if (m.extensions.some((ext) => typeof ext !== "string")) {
    errors.push("All elements of 'extensions' must be strings");
  }

  if (m.mimePrefixes !== undefined) {
    if (!Array.isArray(m.mimePrefixes) || m.mimePrefixes.some((p) => typeof p !== "string")) {
      errors.push("If specified, 'mimePrefixes' must be an array of strings");
    }
  }

  if (m.main !== undefined && typeof m.main !== "string") {
    errors.push("If specified, 'main' must be a string");
  }

  if (m.style !== undefined && typeof m.style !== "string") {
    errors.push("If specified, 'style' must be a string");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalizes and sets defaults for a PluginManifest.
 */
export function normalizePluginManifest(manifest: PluginManifest): PluginManifest {
  return {
    ...manifest,
    main: manifest.main || "index.js",
    extensions: (manifest.extensions || []).map((ext) => ext.toLowerCase().replace(/^\./, "")),
    mimePrefixes: (manifest.mimePrefixes || []).map((m) => m.toLowerCase()),
    supportsZoom: manifest.supportsZoom ?? false,
  };
}

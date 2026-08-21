export const MANUAL_REFRESH_RETRY_DELAY_MS = 500;
export const MANUAL_REFRESH_RETRY_ATTEMPTS = 20;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

/**
 * Produces a stable signature for plugin data regardless of object key order.
 * This is intentionally not a cryptographic hash; it is used only to detect
 * whether another device replaced data.json while Obsidian is running.
 */
export function settingsFingerprint(value: unknown): string {
  return JSON.stringify(canonicalize(value ?? null));
}

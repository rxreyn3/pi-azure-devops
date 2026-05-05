/**
 * Centralized byte-limit constants for log content fetched via the REST client.
 *
 * Notes:
 * - These caps bound the JS string slice returned to callers, not on-the-wire
 *   bytes. The underlying fetch always reads the full response body before
 *   slicing in `rest.getText`.
 * - Slicing is by JS string code units (UTF-16). For typical log content
 *   (predominantly ASCII) one code unit ≈ one byte, so the historical
 *   `maxBytes` naming remains a useful approximation. The `truncated` and
 *   `totalBytes` fields returned alongside the data make truncation observable
 *   to callers regardless of the encoding skew.
 * - For build logs where the failure typically appears late in the stream,
 *   prefer `startLine`/`endLine` range fetches over raising `maxBytes`.
 */
export const DEFAULT_LOG_MAX_BYTES = 8_000;
export const MAX_LOG_MAX_BYTES = 100_000;

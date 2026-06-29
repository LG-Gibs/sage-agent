/**
 * Canonical, stable error codes. These appear in two places that must agree:
 *  - ToolResult.error.code  (mobile + cloud tool failures)
 *  - SSE `error` events       (backend inference failures)
 *
 * The ReActLoop branches on these codes to decide between graceful
 * degradation and surfacing to the user, so the set is intentionally small
 * and closed.
 */
export type SageErrorCode =
  | 'OFFLINE' // cloud tool/target invoked without connectivity
  | 'PERMISSION_DENIED' // OS permission refused (contacts, calendar, files)
  | 'TIMEOUT' // device or upstream operation exceeded its budget
  | 'NOT_INSTALLED' // required GGUF model / native asset missing
  | 'UNSUPPORTED' // capability absent on this device
  | 'INVALID_REQUEST' // failed schema validation at the server boundary
  | 'MODEL_NOT_ALLOWED' // server allowlist rejected the requested model
  | 'UPSTREAM_ERROR' // frontier provider returned an error
  | 'SANDBOX_ERROR' // QuickJS / E2B execution fault
  | 'INTERNAL'; // unclassified

export interface SageError {
  code: SageErrorCode;
  message: string;
  /**
   * Whether the ReActLoop may retry — possibly by descending the graceful
   * degradation hierarchy (capable cloud -> efficient cloud -> local -> error).
   */
  retryable: boolean;
}

/** Error codes that are never retryable regardless of context. */
export const NON_RETRYABLE: ReadonlySet<SageErrorCode> = new Set<SageErrorCode>([
  'PERMISSION_DENIED',
  'INVALID_REQUEST',
  'MODEL_NOT_ALLOWED',
  'UNSUPPORTED',
]);

export function isRetryable(code: SageErrorCode): boolean {
  return !NON_RETRYABLE.has(code);
}

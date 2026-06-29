/**
 * Constitutional Constraint 2 — server-side model selection is a security
 * allowlist check, NOT a routing decision. The server accepts the model the
 * client (ArbiterRouter) selected and never overrides it; it only refuses to
 * proxy models that are not on the allowlist.
 */
export function isModelAllowed(model: string, allowed: string[]): boolean {
  return allowed.includes(model);
}

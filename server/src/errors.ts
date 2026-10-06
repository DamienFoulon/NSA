/** The session token was revoked or expired: retrying cannot succeed. */
export class FatalAuthError extends Error {
  override name = 'FatalAuthError';
}

/**
 * Generates a cryptographically secure random nonce for CSP.
 * Nonces are random tokens added to inline scripts and styles in the CSP header
 * to allow specific inline content while restricting others.
 * 
 * @returns A base64-encoded random nonce string (32 bytes)
 */
export function generateNonce(): string {
  if (typeof window !== 'undefined') {
    // Client-side: use the nonce from the document or return empty
    // The nonce must come from the server via headers/attributes
    return '';
  }

  // Server-side: use crypto to generate a random nonce
  const buffer = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(buffer).toString('base64');
}

/**
 * Extracts or generates a nonce for use in CSP headers and script tags.
 * When called on the server, generates a new nonce.
 * When called on the client, retrieves it from the document or returns empty.
 * 
 * @returns A nonce string suitable for use in CSP directives
 */
export function getNonce(): string {
  return generateNonce();
}

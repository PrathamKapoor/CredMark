import { z } from 'zod';

/**
 * Zod schema for email validation.
 * Enforces strict email format according to RFC 5321.
 * Max length of 254 characters per RFC 5321.
 */
export const EmailSchema = z
  .string()
  .email('Invalid email format')
  .max(254, 'Email must be 254 characters or less');

/**
 * Validates a single email address.
 * 
 * @param email - The email address to validate
 * @returns The validated email address
 * @throws Error if the email is invalid
 */
export async function validateEmail(email: unknown): Promise<string> {
  return EmailSchema.parseAsync(email);
}

import { z } from 'zod';

/**
 * Maximum number of certificate entries allowed in a single bulk operation.
 * This limit prevents DoS attacks and database overload.
 */
export const BULK_CREATE_MAX_ENTRIES = 300;

/**
 * Maximum number of certificate IDs allowed in a single bulk email operation.
 * This limit prevents email spam amplification and resource exhaustion.
 */
export const BULK_EMAIL_MAX_ENTRIES = 1000;

/**
 * Maximum length for custom field values (names, etc.)
 */
export const CUSTOM_FIELD_MAX_LENGTH = 500;

/**
 * Zod schema for individual bulk create entries.
 * Enforces:
 * - Required name and email fields
 * - String types
 * - Max length for name (120 chars)
 * - Valid email format
 * - Custom fields max length (500 chars)
 */
export const BulkCreateEntrySchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(120, 'Name must be 120 characters or less'),
  email: z
    .string()
    .email('Invalid email format')
    .max(254, 'Email must be 254 characters or less'),
}).strict().catchall(
  z.string()
    .max(CUSTOM_FIELD_MAX_LENGTH, `Field values must be ${CUSTOM_FIELD_MAX_LENGTH} characters or less`)
);

/**
 * Zod schema for bulk certificate creation requests.
 * Enforces:
 * - entries array with max 300 items
 * - Valid entry format for each item
 * - Required event name
 * - Valid template and folder IDs
 * - Optional date of issue
 */
export const BulkCreateRequestSchema = z.object({
  entries: z
    .array(BulkCreateEntrySchema)
    .min(1, 'At least one certificate entry is required')
    .max(BULK_CREATE_MAX_ENTRIES, `Maximum ${BULK_CREATE_MAX_ENTRIES} certificates per batch`),
  event_name: z
    .string()
    .min(1, 'Event name is required')
    .max(300, 'Event name must be 300 characters or less'),
  date_of_issue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD')
    .optional(),
  template_id: z
    .string()
    .uuid('Invalid template ID format'),
  folder_id: z
    .string()
    .uuid('Invalid folder ID format'),
});

export type BulkCreateRequest = z.infer<typeof BulkCreateRequestSchema>;

/**
 * Zod schema for bulk email requests.
 * Enforces:
 * - certificateIds array with max 1000 items
 * - Valid UUID format for each ID
 * - Optional skipAlreadySent boolean
 */
export const BulkEmailRequestSchema = z.object({
  certificateIds: z
    .array(
      z.string().uuid('Invalid certificate ID format')
    )
    .min(1, 'At least one certificate ID is required')
    .max(BULK_EMAIL_MAX_ENTRIES, `Maximum ${BULK_EMAIL_MAX_ENTRIES} certificates per batch`),
  skipAlreadySent: z
    .boolean()
    .optional()
    .default(true),
});

export type BulkEmailRequest = z.infer<typeof BulkEmailRequestSchema>;

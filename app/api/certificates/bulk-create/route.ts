import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/auth/roles';
import { generateBatchCertificateCodes, generateCertificateCode } from '@/lib/utils/certificate-code';
import type { Certificate } from '@/lib/types/database';
import { isTrustedOrigin } from '@/lib/utils/origin-validation';
import {
  createIncidentId,
  internalServerErrorResponse,
  logWithIncident,
} from '@/lib/utils/api-security';
import { BulkCreateRequestSchema } from '@/lib/validation/bulk-operations';

interface BulkCreateResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    name: string;
    email: string;
    success: boolean;
    certificateCode?: string;
    error?: string;
  }>;
}

interface BulkCreateProgressEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  total?: number;
  current?: number;
  certificate?: {
    name: string;
    email: string;
  };
  status?: 'success' | 'failed';
  certificateCode?: string;
  reason?: string;
  stats?: {
    successful: number;
    failed: number;
  };
  result?: BulkCreateResult;
}

function writeEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: BulkCreateProgressEvent
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminUser(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!isTrustedOrigin(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Validate request payload against Zod schema
    const parseResult = BulkCreateRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { entries, event_name, date_of_issue, template_id, folder_id } = parseResult.data;

    const { data: template } = await supabase
      .from('templates')
      .select('image_url')
      .eq('id', template_id)
      .single();

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const { data: folder } = await supabase
      .from('folders')
      .select('id')
      .eq('id', folder_id)
      .single();

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const results: BulkCreateResult['results'] = [];
        let successful = 0;
        let failed = 0;

        writeEvent(controller, encoder, {
          type: 'start',
          total: entries.length,
        });

        // Pre-generate candidate codes and resolve collisions up front.
        const candidateCodes = generateBatchCertificateCodes(entries.length, {
          strategy: 'hybrid',
          length: 12,
        });

        const { data: existingCodes } = await supabase
          .from('certificates')
          .select('certificate_code')
          .in('certificate_code', candidateCodes);

        const codeSet = new Set((existingCodes || []).map((row) => row.certificate_code));
        const finalCodes: string[] = [];

        for (let i = 0; i < entries.length; i++) {
          let code = candidateCodes[i];
          let attempts = 0;

          while (codeSet.has(code) && attempts < 5) {
            code = generateCertificateCode({ strategy: 'hybrid', length: 12 });
            attempts++;
          }

          finalCodes.push(code);
          codeSet.add(code);
        }

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const certificateCode = finalCodes[i];

          try {
            const customFields: Record<string, string> = {};
            Object.entries(entry).forEach(([key, value]) => {
              if (key !== 'name' && key !== 'email' && typeof value === 'string') {
                customFields[key] = value;
              }
            });

            const { data, error } = await supabase
              .from('certificates')
              .insert({
                certificate_code: certificateCode,
                name: entry.name,
                email: entry.email,
                event_name: event_name.trim(),
                date_of_issue: date_of_issue || new Date().toISOString().split('T')[0],
                template_id,
                folder_id,
                template_image_url: template.image_url || null,
                is_valid: true,
                custom_fields: Object.keys(customFields).length > 0 ? customFields : {},
              })
              .select()
              .single();

            if (error) {
              const incidentId = createIncidentId();
              logWithIncident('Bulk create insert failed', incidentId, error);
              const safeError = `Failed to create certificate entry (ref: ${incidentId})`;

              failed++;
              results.push({
                name: entry.name,
                email: entry.email,
                success: false,
                error: safeError,
              });

              writeEvent(controller, encoder, {
                type: 'progress',
                current: i + 1,
                total: entries.length,
                certificate: {
                  name: entry.name,
                  email: entry.email,
                },
                status: 'failed',
                reason: safeError,
                stats: { successful, failed },
              });
              continue;
            }

            successful++;
            results.push({
              name: entry.name,
              email: entry.email,
              success: true,
              certificateCode: (data as Certificate).certificate_code,
            });

            writeEvent(controller, encoder, {
              type: 'progress',
              current: i + 1,
              total: entries.length,
              certificate: {
                name: entry.name,
                email: entry.email,
              },
              status: 'success',
              certificateCode: (data as Certificate).certificate_code,
              stats: { successful, failed },
            });
          } catch (entryError) {
            const incidentId = createIncidentId();
            logWithIncident('Bulk create entry failed', incidentId, entryError);
            const errorMessage = `Failed to create certificate entry (ref: ${incidentId})`;

            failed++;
            results.push({
              name: entry.name,
              email: entry.email,
              success: false,
              error: errorMessage,
            });

            writeEvent(controller, encoder, {
              type: 'progress',
              current: i + 1,
              total: entries.length,
              certificate: {
                name: entry.name,
                email: entry.email,
              },
              status: 'failed',
              reason: errorMessage,
              stats: { successful, failed },
            });
          }
        }

        const result: BulkCreateResult = {
          total: entries.length,
          successful,
          failed,
          results,
        };

        revalidatePath('/admin');
        revalidatePath('/admin/certificates');

        writeEvent(controller, encoder, {
          type: 'complete',
          result,
        });

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    const incidentId = createIncidentId();
    logWithIncident('Bulk create request failed', incidentId, error);
    return internalServerErrorResponse(incidentId, 'BULK_CREATE_START_FAILED');
  }
}

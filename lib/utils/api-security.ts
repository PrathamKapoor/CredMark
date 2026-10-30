import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

export function createIncidentId(): string {
    return randomUUID();
}

export function logWithIncident(context: string, incidentId: string, error: unknown): void {
    console.error(context, { incidentId, error });
}

export function internalServerErrorResponse(incidentId: string, code = 'INTERNAL_SERVER_ERROR') {
    return NextResponse.json(
        {
            error: 'Internal server error',
            incidentId,
            code,
        },
        {
            status: 500,
            headers: { 'Cache-Control': 'no-store' },
        }
    );
}

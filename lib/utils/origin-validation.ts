import { NextRequest } from 'next/server';

const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

function normalizeOrigin(value: string): string | null {
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function getAllowedOrigins(): Set<string> {
    const allowedOrigins = new Set<string>();

    const envOrigins = process.env.ALLOWED_ORIGINS
        ?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean) ?? [];

    for (const origin of envOrigins) {
        const normalized = normalizeOrigin(origin);
        if (normalized) {
            allowedOrigins.add(normalized);
        }
    }

    const baseUrlOrigin = process.env.NEXT_PUBLIC_BASE_URL
        ? normalizeOrigin(process.env.NEXT_PUBLIC_BASE_URL)
        : null;

    if (baseUrlOrigin) {
        allowedOrigins.add(baseUrlOrigin);
    }

    if (process.env.NODE_ENV !== 'production') {
        for (const origin of DEV_ORIGINS) {
            allowedOrigins.add(origin);
        }
    }

    return allowedOrigins;
}

export function isTrustedOrigin(request: NextRequest): boolean {
    const allowedOrigins = getAllowedOrigins();

    if (allowedOrigins.size === 0) {
        return process.env.NODE_ENV !== 'production';
    }

    const originHeader = request.headers.get('origin');
    const normalizedOrigin = originHeader ? normalizeOrigin(originHeader) : null;

    if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
        return true;
    }

    const refererHeader = request.headers.get('referer');
    const refererOrigin = refererHeader ? normalizeOrigin(refererHeader) : null;

    return Boolean(refererOrigin && allowedOrigins.has(refererOrigin));
}

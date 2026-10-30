import dns from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_TEMPLATE_IMAGE_REDIRECTS = 3;

function normalizeHostname(hostname: string): string {
    return hostname.trim().toLowerCase();
}

function parseHostname(value: string): string | null {
    try {
        return normalizeHostname(new URL(value).hostname);
    } catch {
        return null;
    }
}

function getAllowedTemplateImageHosts(): Set<string> {
    const allowedHosts = new Set<string>();

    const explicitHosts = process.env.TEMPLATE_IMAGE_ALLOWED_HOSTS
        ?.split(',')
        .map((host) => host.trim())
        .filter(Boolean) ?? [];

    for (const host of explicitHosts) {
        allowedHosts.add(normalizeHostname(host));
    }

    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
        ? parseHostname(process.env.NEXT_PUBLIC_SUPABASE_URL)
        : null;

    if (supabaseHost) {
        allowedHosts.add(supabaseHost);
    }

    return allowedHosts;
}

function isPrivateOrReservedIpv4(address: string): boolean {
    const octets = address.split('.').map((value) => Number.parseInt(value, 10));
    if (octets.length !== 4 || octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
        return true;
    }

    const [a, b] = octets;

    if (a === 10 || a === 127 || a === 0) {
        return true;
    }

    if (a === 169 && b === 254) {
        return true;
    }

    if (a === 172 && b >= 16 && b <= 31) {
        return true;
    }

    if (a === 192 && b === 168) {
        return true;
    }

    if (a === 100 && b >= 64 && b <= 127) {
        return true;
    }

    if (a >= 224) {
        return true;
    }

    return false;
}

function isPrivateOrReservedIpv6(address: string): boolean {
    const normalized = address.toLowerCase();

    if (normalized === '::1' || normalized === '::') {
        return true;
    }

    if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
        return true;
    }

    if (
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb')
    ) {
        return true;
    }

    if (normalized.startsWith('::ffff:')) {
        const embeddedIpv4 = normalized.split(':').pop();
        if (embeddedIpv4) {
            return isPrivateOrReservedIpv4(embeddedIpv4);
        }
    }

    return false;
}

function isPrivateOrReservedIp(address: string): boolean {
    const ipVersion = isIP(address);

    if (ipVersion === 4) {
        return isPrivateOrReservedIpv4(address);
    }

    if (ipVersion === 6) {
        return isPrivateOrReservedIpv6(address);
    }

    return true;
}

async function resolvesToPrivateOrReservedIp(hostname: string): Promise<boolean> {
    const ipVersion = isIP(hostname);
    if (ipVersion !== 0) {
        return isPrivateOrReservedIp(hostname);
    }

    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    return addresses.some((record) => isPrivateOrReservedIp(record.address));
}

function isRedirectStatus(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export async function assertSafeTemplateImageUrl(url: string): Promise<string> {
    let parsedUrl: URL;

    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error('Template image URL is invalid.');
    }

    if (parsedUrl.protocol !== 'https:') {
        throw new Error('Template image URL must use HTTPS.');
    }

    if (parsedUrl.username || parsedUrl.password) {
        throw new Error('Template image URL cannot include credentials.');
    }

    const allowedHosts = getAllowedTemplateImageHosts();
    if (allowedHosts.size === 0) {
        throw new Error('Template image host allowlist is not configured.');
    }

    const hostname = normalizeHostname(parsedUrl.hostname);
    if (!allowedHosts.has(hostname)) {
        throw new Error('Template image URL host is not allowed.');
    }

    const pointsToPrivateAddress = await resolvesToPrivateOrReservedIp(hostname);
    if (pointsToPrivateAddress) {
        throw new Error('Template image URL host resolves to a private or reserved IP address.');
    }

    return parsedUrl.toString();
}

export async function fetchSafeTemplateImage(url: string, init?: RequestInit): Promise<Response> {
    let currentUrl = await assertSafeTemplateImageUrl(url);

    for (let redirectCount = 0; redirectCount <= MAX_TEMPLATE_IMAGE_REDIRECTS; redirectCount += 1) {
        const response = await fetch(currentUrl, {
            ...init,
            redirect: 'manual',
        });

        if (!isRedirectStatus(response.status)) {
            return response;
        }

        const location = response.headers.get('location');
        if (!location) {
            throw new Error('Template image URL redirect is missing a location header.');
        }

        const redirectedUrl = new URL(location, currentUrl).toString();
        currentUrl = await assertSafeTemplateImageUrl(redirectedUrl);
    }

    throw new Error('Template image URL exceeded the maximum number of redirects.');
}

/**
 * Validates a URL intended for use as a clickable link in PDF certificates.
 * Enforces HTTPS protocol, rejects embedded credentials, and blocks private IP ranges.
 * 
 * @param url - The URL to validate
 * @returns The validated URL as a string
 * @throws Error if the URL is invalid or unsafe
 */
export async function validateCertificateLinkUrl(url: string): Promise<string> {
    // Allow empty strings (optional links)
    if (!url || typeof url !== 'string') {
        return '';
    }

    const trimmedUrl = url.trim();
    if (trimmedUrl === '') {
        return '';
    }

    let parsedUrl: URL;

    try {
        parsedUrl = new URL(trimmedUrl);
    } catch {
        throw new Error('Certificate link URL is invalid.');
    }

    // Enforce HTTPS protocol only
    if (parsedUrl.protocol !== 'https:') {
        throw new Error('Certificate link URLs must use HTTPS protocol.');
    }

    // Reject URLs with embedded credentials
    if (parsedUrl.username || parsedUrl.password) {
        throw new Error('Certificate link URLs cannot include username or password.');
    }

    // Check if hostname resolves to a private or reserved IP
    const hostname = normalizeHostname(parsedUrl.hostname);
    const pointsToPrivateAddress = await resolvesToPrivateOrReservedIp(hostname);
    if (pointsToPrivateAddress) {
        throw new Error('Certificate link URL cannot point to a private or reserved IP address.');
    }

    return parsedUrl.toString();
}
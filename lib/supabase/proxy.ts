import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAdminUser } from '@/lib/auth/roles';

const isProduction = process.env.NODE_ENV === 'production';

function generateCspNonce(): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(16));
    let binary = '';

    randomBytes.forEach((value) => {
        binary += String.fromCharCode(value);
    });

    return btoa(binary);
}

function buildContentSecurityPolicy(nonce: string): string {
    return [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https:",
        "style-src 'self' 'unsafe-inline' https:",
        `script-src 'self' 'nonce-${nonce}'${isProduction ? '' : " 'unsafe-eval'"}`,
        "connect-src 'self' https: wss:",
        "worker-src 'self' blob:",
        "media-src 'self' data: blob: https:",
        isProduction ? 'upgrade-insecure-requests' : '',
    ]
        .filter(Boolean)
        .join('; ');
}

function applySecurityHeaders(response: NextResponse, contentSecurityPolicy: string): NextResponse {
    response.headers.set('Content-Security-Policy', contentSecurityPolicy);
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

    if (isProduction) {
        response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }

    return response;
}

/**
 * Security Proxy for Certificate Verification System
 * 
 * Route Protection Rules:
 * - /verify/* : Public access allowed (certificate verification)
 * - /admin/* : Protected, requires authentication AND admin panel must be enabled
 * - /login : Public access allowed
 * - /api/* : Protected admin routes require authentication
 * - / : Redirects to /verify if admin panel is disabled
 */
export async function updateSession(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const nonce = generateCspNonce();
    const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);

    const createNextResponse = () =>
        applySecurityHeaders(
            NextResponse.next({
                request: {
                    headers: requestHeaders,
                },
            }),
            contentSecurityPolicy
        );

    const createRedirectResponse = (url: URL) =>
        applySecurityHeaders(NextResponse.redirect(url), contentSecurityPolicy);

    const createJsonResponse = (body: unknown, status: number) =>
        applySecurityHeaders(
            NextResponse.json(body, {
                status,
            }),
            contentSecurityPolicy
        );

    // Check if admin panel is enabled via environment variable
    const isAdminEnabled = process.env.ADMIN_PANEL_ENABLED === 'true';

    // Public routes that are always accessible
    const publicRoutes = ['/verify', '/login'];
    const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

    // API routes that need protection
    const isProtectedApiRoute = pathname.startsWith('/api/certificates');

    // Admin routes
    const isAdminRoute = pathname.startsWith('/admin');

    // Home page
    const isHomePage = pathname === '/';

    // If accessing home page and admin panel is disabled, redirect to verify
    if (isHomePage && !isAdminEnabled) {
        const url = request.nextUrl.clone();
        url.pathname = '/verify';
        return createRedirectResponse(url);
    }

    // Allow public routes always (no session refresh needed for verify pages)
    if (isPublicRoute && !pathname.startsWith('/login')) {
        const response = createNextResponse();

        // Instruct crawlers not to index public verification routes.
        if (pathname.startsWith('/verify')) {
            response.headers.set('X-Robots-Tag', 'noindex, nofollow');
        }

        return response;
    }

    // If admin panel is disabled, block access to admin routes
    if (isAdminRoute && !isAdminEnabled) {
        const url = request.nextUrl.clone();
        url.pathname = '/verify';
        return createRedirectResponse(url);
    }

    // If admin panel is disabled, block protected API routes
    if (isProtectedApiRoute && !isAdminEnabled) {
        return createJsonResponse(
            { error: 'Admin panel is disabled' },
            403
        );
    }

    // Create Supabase client for session handling
    let supabaseResponse = createNextResponse();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = createNextResponse();
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Refresh session if expired
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Protect admin routes - require authentication + admin role
    if (isAdminRoute && !user) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return createRedirectResponse(url);
    }

    if (isAdminRoute && !isAdminUser(user)) {
        return createRedirectResponse(new URL('/verify', request.url));
    }

    // Protect admin API routes - require authentication + admin role
    if (isProtectedApiRoute && !user) {
        return createJsonResponse(
            { error: 'Unauthorized' },
            401
        );
    }

    if (isProtectedApiRoute && !isAdminUser(user)) {
        return createJsonResponse(
            { error: 'Forbidden' },
            403
        );
    }

    // Redirect authenticated users away from login page based on role
    if (pathname === '/login' && user) {
        const url = request.nextUrl.clone();
        url.pathname = isAdminUser(user) ? '/admin' : '/verify';
        return createRedirectResponse(url);
    }

    return applySecurityHeaders(supabaseResponse, contentSecurityPolicy);
}

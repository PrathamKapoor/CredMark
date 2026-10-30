import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

interface RateLimitDecision {
    allowed: boolean;
    retryAfter?: number;
    remainingAttempts?: number;
    message?: string;
}

const LOGIN_MAX_ATTEMPTS = 5;
const PUBLIC_PDF_MAX_REQUESTS = 10;
const SUPER_DELETE_MAX_ATTEMPTS = 3;

const LOGIN_RATE_LIMIT_PREFIX = 'ratelimit:login';
const PUBLIC_PDF_RATE_LIMIT_PREFIX = 'ratelimit:public-pdf';
const SUPER_DELETE_RATE_LIMIT_PREFIX = 'ratelimit:super-delete';

const hasUpstashConfig = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const redisClient = hasUpstashConfig
    ? new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL!,
          token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      })
    : null;

const loginRateLimiter = redisClient
    ? new Ratelimit({
          redis: redisClient,
          limiter: Ratelimit.slidingWindow(LOGIN_MAX_ATTEMPTS, '15 m'),
          prefix: LOGIN_RATE_LIMIT_PREFIX,
      })
    : null;

const publicPdfRateLimiter = redisClient
    ? new Ratelimit({
          redis: redisClient,
          limiter: Ratelimit.slidingWindow(PUBLIC_PDF_MAX_REQUESTS, '60 s'),
          prefix: PUBLIC_PDF_RATE_LIMIT_PREFIX,
      })
    : null;

const superDeleteRateLimiter = redisClient
    ? new Ratelimit({
          redis: redisClient,
          limiter: Ratelimit.slidingWindow(SUPER_DELETE_MAX_ATTEMPTS, '15 m'),
          prefix: SUPER_DELETE_RATE_LIMIT_PREFIX,
      })
    : null;
let hasWarnedAboutMissingUpstash = false;

function getIpFromHeaders(headers: Headers): string {
    const vercelForwardedFor = headers.get('x-vercel-forwarded-for');
    const cfConnectingIp = headers.get('cf-connecting-ip');
    const realIp = headers.get('x-real-ip');
    const forwardedFor = headers.get('x-forwarded-for');

    return (
        vercelForwardedFor?.split(',')[0]?.trim() ||
        cfConnectingIp ||
        realIp ||
        forwardedFor?.split(',')[0]?.trim() ||
        'unknown'
    );
}

async function checkUpstashRateLimit(
    limiter: Ratelimit | null,
    key: string,
    blockMessage: string
): Promise<RateLimitDecision | null> {
    if (!limiter) {
        return null;
    }

    const result = await limiter.limit(key);
    if (!result.success) {
        return {
            allowed: false,
            retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
            message: blockMessage,
        };
    }

    return {
        allowed: true,
        remainingAttempts: result.remaining,
    };
}

export function getClientIdentifier(headers: Headers): string {
    const ip = getIpFromHeaders(headers);
    return `login:${ip}`;
}

export async function checkRateLimit(identifier: string): Promise<RateLimitDecision> {
    const blockedMessage = 'Too many login attempts. Please try again later.';

    const upstashDecision = await checkUpstashRateLimit(loginRateLimiter, identifier, blockedMessage);
    if (upstashDecision) {
        return upstashDecision;
    }

    if (!hasWarnedAboutMissingUpstash) {
        console.warn('Upstash rate limiting is not configured; distributed limits are disabled.');
        hasWarnedAboutMissingUpstash = true;
    }

    return { allowed: true };
}

export async function clearRateLimit(identifier: string): Promise<void> {
    if (!redisClient) {
        return;
    }

    await redisClient.del(`${LOGIN_RATE_LIMIT_PREFIX}:${identifier}`);
}

export async function checkPublicPdfRateLimit(headers: Headers): Promise<RateLimitDecision> {
    const ip = getIpFromHeaders(headers);
    const key = `public-pdf:${ip}`;
    const blockedMessage = 'Too many PDF download requests. Please try again shortly.';

    const upstashDecision = await checkUpstashRateLimit(publicPdfRateLimiter, key, blockedMessage);
    if (upstashDecision) {
        return upstashDecision;
    }

    if (!hasWarnedAboutMissingUpstash) {
        console.warn('Upstash rate limiting is not configured; distributed limits are disabled.');
        hasWarnedAboutMissingUpstash = true;
    }

    return { allowed: true };
}

export async function checkSuperDeleteRateLimit(identifier: string): Promise<RateLimitDecision> {
    const blockedMessage = 'Too many Super Delete attempts. Please try again later.';

    const upstashDecision = await checkUpstashRateLimit(superDeleteRateLimiter, identifier, blockedMessage);
    if (upstashDecision) {
        return upstashDecision;
    }

    if (!hasWarnedAboutMissingUpstash) {
        console.warn('Upstash rate limiting is not configured; distributed limits are disabled.');
        hasWarnedAboutMissingUpstash = true;
    }

    return { allowed: true };
}

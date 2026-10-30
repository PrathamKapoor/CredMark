/**
 * Email utility functions for cooldown calculations
 * These are pure functions that can be used on both client and server
 */

export const EMAIL_RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelayMs: 5 * 1000,
    maxDelayMs: 60 * 1000,
};

function toSeconds(ms: number): number {
    return Math.round(ms / 1000);
}

/**
 * Calculate dynamic cooldown based on batch size
 * Larger batches = longer cooldowns to avoid spam filters
 * 
 * @param batchSize Total number of emails to send
 * @returns Cooldown in milliseconds
 */
export function calculateCooldown(batchSize: number): number {
    if (batchSize <= 10) {
        return 2000;
    } else if (batchSize <= 25) {
        return 3000;
    } else if (batchSize <= 50) {
        return 4000;
    } else if (batchSize <= 100) {
        return 5000;
    } else {
        return 6000;
    }
}

export function calculateRetryDelayMs(
    attempt: number,
    baseDelayMs: number = EMAIL_RETRY_CONFIG.baseDelayMs,
    maxDelayMs: number = EMAIL_RETRY_CONFIG.maxDelayMs
): number {
    const safeAttempt = Math.max(1, attempt);
    const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, safeAttempt - 1));
    const jitter = Math.floor(Math.random() * 1000);
    return Math.min(maxDelayMs, exponentialDelay + jitter);
}

/**
 * Get a human-readable cooldown description
 */
export function getCooldownDescription(batchSize: number): string {
    const cooldownMs = calculateCooldown(batchSize);
    const seconds = toSeconds(cooldownMs);

    if (batchSize <= 10) {
        return `${seconds}s between emails (small batch)`;
    } else if (batchSize <= 25) {
        return `${seconds}s between emails (medium batch)`;
    } else if (batchSize <= 50) {
        return `${seconds}s between emails (large batch)`;
    } else if (batchSize <= 100) {
        return `${seconds}s between emails (very large batch)`;
    } else {
        return `${seconds}s between emails (huge batch - consider splitting)`;
    }
}

/**
 * Estimate total time for bulk email sending
 */
export function estimateTotalTime(batchSize: number): string {
    if (batchSize === 0) return '0 seconds';

    const cooldownMs = calculateCooldown(batchSize);
    // First email has no cooldown, subsequent emails have cooldown
    const totalMs = (batchSize - 1) * cooldownMs;

    const totalSeconds = Math.ceil(totalMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes === 0) {
        return `~${seconds} seconds`;
    } else if (seconds === 0) {
        return `~${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
        return `~${minutes}m ${seconds}s`;
    }
}

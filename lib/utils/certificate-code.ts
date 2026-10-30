import { randomBytes } from 'crypto';

/**
 * Character set for certificate codes
 * Excludes confusing characters: 0, O, I, L, 1
 */
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CHARSET_LENGTH = CHARSET.length; // 30 characters

/**
 * Generate a cryptographically secure random string
 * @param length Number of characters to generate
 */
function generateRandomString(length: number): string {
    const bytes = randomBytes(length);
    let result = '';

    for (let i = 0; i < length; i++) {
        result += CHARSET[bytes[i] % CHARSET_LENGTH];
    }

    return result;
}

/**
 * Convert a number to base-30 using our charset
 * @param num Number to convert
 * @param minLength Minimum length (pad with first charset char)
 */
function toBase30(num: number, minLength: number = 4): string {
    if (num === 0) return CHARSET[0].repeat(minLength);

    let result = '';
    let remaining = num;

    while (remaining > 0) {
        result = CHARSET[remaining % CHARSET_LENGTH] + result;
        remaining = Math.floor(remaining / CHARSET_LENGTH);
    }

    // Pad to minimum length
    while (result.length < minLength) {
        result = CHARSET[0] + result;
    }

    return result;
}

/**
 * Generate a time-based prefix for certificate codes
 * This provides natural ordering and reduces collision probability
 * Format: 4 characters representing time since epoch (minutes resolution)
 */
function generateTimePrefix(): string {
    // Use minutes since a recent epoch to keep the number smaller
    // Using 2024-01-01 as our epoch
    const epochStart = new Date('2024-01-01T00:00:00Z').getTime();
    const minutesSinceEpoch = Math.floor((Date.now() - epochStart) / 60000);

    return toBase30(minutesSinceEpoch, 4);
}

/**
 * Certificate code generation strategies
 */
export type CodeStrategy = 'random' | 'time-prefixed' | 'hybrid';

export interface CodeGenerationOptions {
    /**
     * Total length of the certificate code
     * @default 12
     */
    length?: number;

    /**
     * Strategy for code generation
     * - 'random': Pure random (original behavior)
     * - 'time-prefixed': Time prefix + random (best for high volume)
     * - 'hybrid': Short time component + longer random (balanced)
     * @default 'hybrid'
     */
    strategy?: CodeStrategy;

    /**
     * Custom separator between components (for time-prefixed/hybrid)
     * Set to empty string for no separator
     * @default ''
     */
    separator?: string;
}

/**
 * Generate a cryptographically secure certificate code with collision resistance
 * 
 * The hybrid strategy (default) uses:
 * - 4-char time component (minutes since 2024-01-01)
 * - 8-char random component
 * 
 * This provides:
 * - Natural chronological ordering
 * - ~39 bits of randomness in the random component
 * - Virtually zero collision probability for certificates created in different minutes
 * - Only random collisions possible within the same minute
 * 
 * Example outputs:
 * - Random:        "LDNYEW7K23BA"
 * - Time-prefixed: "AGHK-7K23BANM"
 * - Hybrid:        "AGHK7K23BANM" (default)
 */
export function generateCertificateCode(options: CodeGenerationOptions = {}): string {
    const {
        length = 12,
        strategy = 'hybrid',
        separator = ''
    } = options;

    switch (strategy) {
        case 'random':
            return generateRandomString(length);

        case 'time-prefixed': {
            const timePrefix = generateTimePrefix();
            const randomLength = Math.max(length - timePrefix.length - separator.length, 6);
            const randomPart = generateRandomString(randomLength);
            return `${timePrefix}${separator}${randomPart}`;
        }

        case 'hybrid':
        default: {
            // Hybrid: shorter time component, more randomness
            const timePrefix = generateTimePrefix();
            const randomLength = length - timePrefix.length;
            const randomPart = generateRandomString(Math.max(randomLength, 6));
            return `${timePrefix}${randomPart}`;
        }
    }
}

/**
 * Generate multiple unique certificate codes in batch
 * This is more efficient than generating codes one by one
 * 
 * @param count Number of codes to generate
 * @param options Generation options
 * @returns Array of unique certificate codes
 */
export function generateBatchCertificateCodes(
    count: number,
    options: CodeGenerationOptions = {}
): string[] {
    const codes = new Set<string>();

    // Generate codes until we have enough unique ones
    // With time-prefixed strategy, collisions are extremely rare
    let attempts = 0;
    const maxAttempts = count * 3; // Safety limit

    while (codes.size < count && attempts < maxAttempts) {
        codes.add(generateCertificateCode(options));
        attempts++;
    }

    if (codes.size < count) {
        throw new Error(`Failed to generate ${count} unique codes after ${maxAttempts} attempts`);
    }

    return Array.from(codes);
}

/**
 * Build the full verification URL for a certificate
 */
export function buildVerificationUrl(certificateCode: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) throw new Error('NEXT_PUBLIC_BASE_URL is required');
    return new URL(`/verify/${encodeURIComponent(certificateCode)}`, baseUrl).toString();
}

/**
 * Validate certificate code format
 * Accepts 10-16 character uppercase alphanumeric codes
 */
export function isValidCertificateCode(code: string): boolean {
    // Must be 10-16 uppercase alphanumeric characters (from our charset)
    const pattern = /^[A-HJ-NP-Z2-9]{10,16}$/;
    return pattern.test(code);
}

/**
 * Parse a certificate code to extract components (if time-prefixed)
 * Useful for debugging and analytics
 */
export function parseCertificateCode(code: string): {
    timeComponent?: string;
    randomComponent: string;
    estimatedCreationTime?: Date;
} {
    if (code.length < 10) {
        return { randomComponent: code };
    }

    // Assume first 4 characters are time component for hybrid/time-prefixed codes
    const timeComponent = code.substring(0, 4);
    const randomComponent = code.substring(4);

    // Try to decode the time component
    let estimatedCreationTime: Date | undefined;
    try {
        let timeValue = 0;
        for (const char of timeComponent) {
            const index = CHARSET.indexOf(char);
            if (index === -1) {
                throw new Error('Invalid character in time component');
            }
            timeValue = timeValue * CHARSET_LENGTH + index;
        }

        const epochStart = new Date('2024-01-01T00:00:00Z').getTime();
        estimatedCreationTime = new Date(epochStart + timeValue * 60000);
    } catch {
        // If we can't decode, it might be a pure random code
        return { randomComponent: code };
    }

    return {
        timeComponent,
        randomComponent,
        estimatedCreationTime
    };
}

/**
 * Check if a code appears to be a time-prefixed code
 * Useful for migration scenarios
 */
export function isTimePrefixedCode(code: string): boolean {
    if (code.length < 10) return false;

    const parsed = parseCertificateCode(code);
    if (!parsed.estimatedCreationTime) return false;

    // Check if the estimated time is reasonable (between 2024 and now + 1 year)
    const minDate = new Date('2024-01-01T00:00:00Z');
    const maxDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    return parsed.estimatedCreationTime >= minDate && parsed.estimatedCreationTime <= maxDate;
}

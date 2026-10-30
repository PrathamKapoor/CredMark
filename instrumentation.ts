/**
 * Sensitive field names that should be redacted from logs
 */
const SENSITIVE_FIELDS = [
    'password',
    'pwd',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'authorization',
    'auth',
    'credentials',
    'sessionId',
    'session_id',
    'refreshToken',
    'refresh_token',
    'accessToken',
    'access_token',
    'privateKey',
    'private_key',
    'clientSecret',
    'client_secret',
    'encryptionKey',
    'encryption_key',
];

/**
 * Redacts sensitive data from an object by replacing sensitive field values with [REDACTED]
 */
function redactSensitiveData(obj: unknown, depth = 0, maxDepth = 10): unknown {
    // Prevent infinite recursion
    if (depth > maxDepth) return '[REDACTED: maximum depth]';
    if (obj === null) return obj;

    if (typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => redactSensitiveData(item, depth + 1, maxDepth));
    }

    if (obj instanceof Error) return { name: obj.name, message: '[REDACTED: error message]', cause: obj.cause ? redactSensitiveData(obj.cause, depth + 1, maxDepth) : undefined };
    const redacted: Record<string, unknown> = Object.create(null);
    const source = obj as Record<string, unknown>;

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const descriptor = Object.getOwnPropertyDescriptor(source, key);
            const value: unknown = descriptor && 'value' in descriptor ? descriptor.value : '[REDACTED: accessor]';

            // Check if this is a sensitive field
            if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
                redacted[key] = '[REDACTED]';
            } else if (typeof value === 'object' && value !== null) {
                redacted[key] = redactSensitiveData(value, depth + 1, maxDepth);
            } else {
                redacted[key] = value;
            }
        }
    }

    return redacted;
}

/**
 * Wraps console methods to redact sensitive data before logging
 */
function setupConsoleRedaction() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalDebug = console.debug;

    const redactAndLog = (originalMethod: (...args: unknown[]) => void) => {
        return function (...args: unknown[]) {
            // Redact sensitive data from each argument
            const redactedArgs = args.map((arg) => {
                if (typeof arg === 'object') {
                    return redactSensitiveData(arg);
                }
                return arg;
            });

            // Call the original method with redacted arguments
            return originalMethod.apply(console, redactedArgs);
        };
    };

    console.log = redactAndLog(originalLog);
    console.error = redactAndLog(originalError);
    console.warn = redactAndLog(originalWarn);
    console.debug = redactAndLog(originalDebug);
}

/**
 * Main instrumentation setup
 * This is called automatically by Next.js when NODE_ENV is production or when explicitly enabled
 */
export function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        setupConsoleRedaction();
    }
}

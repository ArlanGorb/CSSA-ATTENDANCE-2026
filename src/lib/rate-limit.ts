/**
 * Rate Limiting Utility
 * Simple in-memory rate limiting for API routes
 * 
 * For production, consider using Redis or Supabase RPC with rate limiting
 */

type RateLimitConfig = {
  interval: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
};

type RateLimitStore = {
  [key: string]: {
    count: number;
    resetTime: number;
  };
};

// In-memory store (for production, use Redis or database)
const store: RateLimitStore = {};

// Default configuration
const DEFAULT_CONFIG: RateLimitConfig = {
  interval: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 requests per minute
};

// Different limits for different endpoints
const ENDPOINT_CONFIGS: Record<string, RateLimitConfig> = {
  '/api/attendance': {
    interval: 60 * 1000, // 1 minute
    maxRequests: 5, // 5 requests per minute (strict for attendance)
  },
  '/api/face-profiles': {
    interval: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 requests per minute (for face recognition)
  },
  DEFAULT: DEFAULT_CONFIG,
};

/**
 * Get or create rate limit entry for an identifier
 */
function getRateLimitEntry(identifier: string, config: RateLimitConfig) {
  const now = Date.now();
  
  if (!store[identifier] || now > store[identifier].resetTime) {
    store[identifier] = {
      count: 0,
      resetTime: now + config.interval,
    };
  }
  
  return store[identifier];
}

/**
 * Check if request is rate limited
 * @param identifier - Unique identifier (IP address, user ID, device ID, etc.)
 * @param endpoint - API endpoint path
 * @returns Object with limit status and headers
 */
export function checkRateLimit(
  identifier: string,
  endpoint: string = 'DEFAULT'
): {
  limited: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
} {
  const config = ENDPOINT_CONFIGS[endpoint] || ENDPOINT_CONFIGS.DEFAULT;
  const entry = getRateLimitEntry(identifier, config);
  
  entry.count++;
  
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetTime = entry.resetTime;
  const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
  
  return {
    limited: entry.count > config.maxRequests,
    remaining,
    resetTime,
    retryAfter: entry.count > config.maxRequests ? retryAfter : undefined,
  };
}

/**
 * Clean up old entries from the store
 * Run this periodically to prevent memory leaks
 */
export function cleanupRateLimitStore() {
  const now = Date.now();
  
  for (const [key, value] of Object.entries(store)) {
    if (now > value.resetTime) {
      delete store[key];
    }
  }
}

// Auto cleanup every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);

/**
 * Get client identifier from request
 * Uses IP address, with fallback to user agent
 */
export function getClientIdentifier(request: Request): string {
  // Try to get IP from headers (works behind proxy/CDN)
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  
  let ip = 'unknown';
  
  if (cfConnectingIp) {
    ip = cfConnectingIp;
  } else if (realIp) {
    ip = realIp;
  } else if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs: client, proxy1, proxy2, ...
    ip = forwardedFor.split(',')[0].trim();
  }
  
  // Combine with user agent for more unique identification
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  return `${ip}:${userAgent.substring(0, 20)}`;
}

/**
 * Rate limiting middleware for Next.js API routes
 * 
 * Usage:
 * ```typescript
 * import { withRateLimit } from '@/lib/rate-limit';
 * 
 * export async function POST(request: Request) {
 *   const limited = await withRateLimit(request, '/api/attendance');
 *   if (limited) {
 *     return limited;
 *   }
 *   // ... rest of your handler
 * }
 * ```
 */
export async function withRateLimit(
  request: Request,
  endpoint: string = 'DEFAULT'
): Promise<Response | null> {
  const identifier = getClientIdentifier(request);
  const result = checkRateLimit(identifier, endpoint);
  
  if (result.limited) {
    return new Response(
      JSON.stringify({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: result.retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': result.resetTime.toString(),
          'Retry-After': result.retryAfter?.toString() || '60',
        },
      }
    );
  }
  
  // Return null if not limited (caller should continue with their logic)
  return null;
}

/**
 * Decorator for rate limiting API route handlers
 * 
 * Usage:
 * ```typescript
 * export const POST = rateLimit('/api/attendance', async (request: Request) => {
 *   // ... your handler logic
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */
export function rateLimit(endpoint: string = 'DEFAULT', handler: (request: Request) => Promise<Response>) {
  return async function (request: Request): Promise<Response> {
    const limited = await withRateLimit(request, endpoint);
    if (limited) {
      return limited;
    }
    
    return handler(request);
  };
}

/**
 * @fileoverview Configurable rate limiter middleware.
 *
 * Mini-README
 * -----------
 * This module centralises configuration for API rate limiting so that limits can
 * be tuned without code changes and to ensure consistent messaging/logging
 * across the application.
 *
 * Structure
 * 1. Environment parsing helpers that safely coerce configuration values.
 * 2. Factory that builds an express-rate-limit instance with a custom handler
 *    which logs every breach for easier diagnostics.
 * 3. Exported middleware instances for general API traffic and the more
 *    restrictive authentication endpoints.
 */
import type { Request, Response } from 'express';
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

/**
 * Safely parse a positive integer from an environment variable.
 * Provides verbose console output when defaults are used, aiding debugging.
 */
const getPositiveIntFromEnv = (envKey: string, fallback: number): number => {
  const rawValue = process.env[envKey];
  if (!rawValue) {
    console.debug(
      `[rateLimiter] ${envKey} is not set; defaulting to ${fallback}.`
    );
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.warn(
      `[rateLimiter] Invalid value "${rawValue}" for ${envKey}; falling back to ${fallback}.`
    );
    return fallback;
  }

  return parsed;
};

/**
 * Creates a rate limiter with consistent logging and response payloads.
 */
const createLimiter = (
  name: string,
  windowMinutesEnv: string,
  maxRequestsEnv: string,
  defaults: { windowMinutes: number; maxRequests: number }
): RateLimitRequestHandler => {
  const windowMinutes = getPositiveIntFromEnv(windowMinutesEnv, defaults.windowMinutes);
  const maxRequests = getPositiveIntFromEnv(maxRequestsEnv, defaults.maxRequests);

  console.info(
    `[rateLimiter] ${name} configured for ${maxRequests} requests every ${windowMinutes} minute(s).`
  );

  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      console.warn(
        `[rateLimiter] ${name} limit exceeded by ${req.ip} for ${req.method} ${req.originalUrl}.`
      );
      res.status(429).json({
        message: 'Too many requests, please try again later.',
        retryAfterMinutes: windowMinutes,
        limitName: name
      });
    }
  });
};

/**
 * General API limiter applied to all `/api` routes.
 * Defaults are intentionally generous to prevent legitimate application traffic
 * from being throttled, while still providing a safety net against abuse.
 */
export const generalRateLimiter = createLimiter(
  'general',
  'GENERAL_RATE_LIMIT_WINDOW_MINUTES',
  'GENERAL_RATE_LIMIT_MAX_REQUESTS',
  {
    windowMinutes: 1,
    maxRequests: 600
  }
);

/**
 * Authentication specific limiter for endpoints like `/login` where brute force
 * attacks are a concern. Defaults are much tighter than the general limiter.
 */
export const authRateLimiter = createLimiter(
  'auth',
  'AUTH_RATE_LIMIT_WINDOW_MINUTES',
  'AUTH_RATE_LIMIT_MAX_REQUESTS',
  {
    windowMinutes: 15,
    maxRequests: 20
  }
);

import { z } from 'zod';

const integerString = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/)
    .refine((value) => {
      const parsed = Number(value);
      return parsed >= min && parsed <= max;
    });

const booleanString = z.enum(['true', 'false']);
const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() || undefined : value),
  z.string().optional(),
);
const optionalSecret = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  z
    .string()
    .refine((value) => value === value.trim(), {
      message: 'Secret values must not contain surrounding whitespace',
    })
    .optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    PORT: integerString(1, 65_535).optional(),
    DATABASE_URL: z.string().trim().startsWith('postgresql://').optional(),
    DATABASE_POOL_MAX: integerString(1, 30).optional(),
    DATABASE_POOL_IDLE_TIMEOUT_MS: integerString(1_000, 600_000).optional(),
    DATABASE_POOL_CONNECTION_TIMEOUT_MS: integerString(
      1_000,
      60_000,
    ).optional(),
    DATABASE_SSL: booleanString.optional(),
    JWT_SECRET: optionalSecret,
    ENABLE_AUTO_REFUND: booleanString.optional(),
    REQUIRE_JOURNEY_PAYMENT: booleanString.optional(),
    CHART_TASK_CONCURRENCY: integerString(1, 10).optional(),
    CHART_TASK_DEADLINE_SECONDS: integerString(30, 900).optional(),
    ALTERNATIVE_SEARCH_CONCURRENCY: integerString(1, 10).optional(),
    IRCTC_CHART_MAX_ATTEMPTS: integerString(1, 10).optional(),
    BROWSER_USE_API_KEY: optionalTrimmedString,
    BROWSER_USE_WEBHOOK_SECRET: optionalSecret,
    WHATSAPP_PROVIDER: optionalTrimmedString,
    WASENDER_WEBHOOK_SECRET: optionalSecret,
    RAZORPAY_KEY_ID: optionalTrimmedString,
    RAZORPAY_KEY_SECRET: optionalSecret,
    RAZORPAY_WEBHOOK_SECRET: optionalSecret,
  })
  .passthrough()
  .superRefine((env, context) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['DATABASE_URL', 'JWT_SECRET'] as const) {
      if (!env[key]) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
    if (env.JWT_SECRET && env.JWT_SECRET.length < 32) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must contain at least 32 characters in production',
      });
    }
    if (
      env.WHATSAPP_PROVIDER &&
      !['msg91', 'wasender'].includes(env.WHATSAPP_PROVIDER)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['WHATSAPP_PROVIDER'],
        message: 'WHATSAPP_PROVIDER must be msg91 or wasender in production',
      });
    }
    if (Boolean(env.RAZORPAY_KEY_ID) !== Boolean(env.RAZORPAY_KEY_SECRET)) {
      context.addIssue({
        code: 'custom',
        path: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'],
        message:
          'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured together',
      });
    }
    if (
      env.BROWSER_USE_API_KEY &&
      (!env.BROWSER_USE_WEBHOOK_SECRET ||
        env.BROWSER_USE_WEBHOOK_SECRET.length < 16)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['BROWSER_USE_WEBHOOK_SECRET'],
        message:
          'BROWSER_USE_WEBHOOK_SECRET is required when Browser Use is configured',
      });
    }
    if (
      env.WHATSAPP_PROVIDER === 'wasender' &&
      (!env.WASENDER_WEBHOOK_SECRET || env.WASENDER_WEBHOOK_SECRET.length < 16)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['WASENDER_WEBHOOK_SECRET'],
        message: 'WASENDER_WEBHOOK_SECRET is required for Wasender',
      });
    }
    if (
      env.RAZORPAY_KEY_ID &&
      (!env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_WEBHOOK_SECRET.length < 16)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['RAZORPAY_WEBHOOK_SECRET'],
        message:
          'RAZORPAY_WEBHOOK_SECRET is required when Razorpay is configured',
      });
    }
  });

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result = environmentSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const configModuleOptions = {
  isGlobal: true,
  cache: true,
  validate: validateEnvironment,
} as const;

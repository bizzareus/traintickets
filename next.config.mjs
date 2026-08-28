import { withSentryConfig } from "@sentry/nextjs";
import { PHASE_PRODUCTION_BUILD } from "next/constants.js";

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @param {string} phase */
export default function configFactory(phase) {

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  turbopack: {
    root: __dirname,
  },
  outputFileTracingExcludes: {
    "*": ["./next.config.mjs", "content/chart-times/**"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "flowbite", "clsx", "tailwind-merge"],
  },
  env: {
    IS_BUILD_PHASE: phase === PHASE_PRODUCTION_BUILD ? "1" : "",
  },
  webpack: (config) => {
    config.module = {
      ...config.module,
      exprContextCritical: false,
    };
    return config;
  },
  async redirects() {
    return [
      {
        // Chart-vacancy tool moved from /seat-status; keep the old URL working (301).
        source: "/seat-status",
        destination: "/chart-vacancy",
        statusCode: 301,
      },
      {
        source: "/irctc-train-food-menu/ac-2a-3a-cc",
        destination: "/irctc-train-food-menu/ac-coach-food-menu-prices",
        statusCode: 308,
      },
      {
        source: "/irctc-train-food-menu/duronto-sleeper",
        destination: "/irctc-train-food-menu/duronto-sleeper-class-food-menu-prices",
        statusCode: 308,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(chart-times|blog|irctc-train-food-menu|glossary|pnr-status|chart-vacancy)/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

  if (phase !== PHASE_PRODUCTION_BUILD) {
    return nextConfig;
  }

  return withSentryConfig(nextConfig, {
    silent: !process.env.CI,
    widenClientFileUpload: true,
    tunnelRoute: "/monitoring",
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
    },
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
  });
}

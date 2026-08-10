import { withSentryConfig } from "@sentry/nextjs";
import { PHASE_PRODUCTION_BUILD } from "next/constants.js";

/** @param {string} phase */
export default function configFactory(phase) {

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "flowbite", "clsx", "tailwind-merge"],
  },
  env: {
    IS_BUILD_PHASE: phase === PHASE_PRODUCTION_BUILD ? "1" : "",
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
    ];
  },
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
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

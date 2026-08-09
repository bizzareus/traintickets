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
    ];
  },
  async headers() {
    return [
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

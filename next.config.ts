import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow larger FormData payloads for template image/font uploads.
      bodySizeLimit: "32mb",
    },
  },
  allowedDevOrigins: [
    "http://localhost:3000",
    "c4a6-106-222-207-125.ngrok-free.app",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;

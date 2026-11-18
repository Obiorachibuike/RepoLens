import type { NextConfig } from "next";

const arenaPreview = process.env.ARENA_PREVIEW === "1";
const nextConfig: NextConfig = {
  ...(arenaPreview ? { allowedDevOrigins: ["*.e2b.app"] } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  // Remote images (GitHub avatars) are rendered with plain <img> elements so the
  // app never depends on the Next.js image optimizer reaching third-party hosts.
  images: { unoptimized: true },
  experimental: {
    // Keeps server-only modules out of the client bundle.
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          ...(arenaPreview ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

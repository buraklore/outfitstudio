import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

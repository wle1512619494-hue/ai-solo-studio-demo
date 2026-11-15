import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep PDF.js as a real Node.js package at runtime. Bundling it into
  // .next/vendor-chunks breaks its relative worker-module resolution.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;

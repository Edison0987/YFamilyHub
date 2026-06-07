import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Next doesn't get confused by
  // other lockfiles elsewhere on the machine. (Harmless on Vercel.)
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;

import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["glamprobe"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/glamprobe/**/*"],
  },
};

export default withWorkflow(nextConfig);

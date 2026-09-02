import { isIP } from "node:net";

export function validateTargetUrl(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return "Target endpoint URL is invalid."; }
  if (url.protocol !== "https:") return "Hosted targets must use HTTPS.";
  if (url.username || url.password) return "Put credentials in headers, not the endpoint URL.";
  if (isPrivateHost(url.hostname)) return "Private, loopback, and link-local target addresses are not allowed.";
  return null;
}

function isPrivateHost(host: string): boolean {
  const hostname = host.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (isIP(hostname) === 4) {
    const [first, second] = hostname.split(".").map(Number);
    return first === 0 || first === 10 || first === 127 || first === 169 && second === 254 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168 || first === 100 && second >= 64 && second <= 127;
  }
  if (isIP(hostname) === 6) return hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe8") || hostname.startsWith("fe9") || hostname.startsWith("fea") || hostname.startsWith("feb");
  return false;
}

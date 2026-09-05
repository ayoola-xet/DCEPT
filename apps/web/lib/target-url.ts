import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export function validateTargetUrl(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return "Target endpoint URL is invalid."; }
  if (url.protocol !== "https:") return "Hosted targets must use HTTPS.";
  if (url.username || url.password) return "Put credentials in headers, not the endpoint URL.";
  if (isNonPublicHost(url.hostname)) return "Only public target addresses are allowed.";
  return null;
}

/** Validate a target for a public server route after DNS resolution. */
export async function validatePublicTargetUrl(value: string): Promise<string | null> {
  const basicError = validateTargetUrl(value);
  if (basicError) return basicError;
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some((address) => isNonPublicHost(address.address))) {
      return "Only public target addresses are allowed.";
    }
  } catch {
    return "Target endpoint host could not be resolved.";
  }
  return null;
}

function isNonPublicHost(host: string): boolean {
  const hostname = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (isIP(hostname) === 4) {
    const [first, second] = hostname.split(".").map(Number);
    return first === 0
      || first === 10
      || first === 100 && second >= 64 && second <= 127
      || first === 127
      || first === 169 && second === 254
      || first === 172 && second >= 16 && second <= 31
      || first === 192 && (second === 0 || second === 168)
      || first === 198 && (second === 18 || second === 19 || second === 51)
      || first === 203 && second === 0
      || first >= 224;
  }
  if (isIP(hostname) === 6) {
    const mappedIpv4 = mappedIpv4Address(hostname);
    if (mappedIpv4) return isNonPublicHost(mappedIpv4);
    return hostname === "::"
      || hostname === "::1"
      || hostname.startsWith("fc")
      || hostname.startsWith("fd")
      || /^fe[89ab]/.test(hostname)
      || /^fe[c-f]/.test(hostname)
      || hostname.startsWith("ff");
  }
  return false;
}

function mappedIpv4Address(hostname: string): string | null {
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(hostname);
  if (!match) return null;
  const high = Number.parseInt(match[1], 16);
  const low = Number.parseInt(match[2], 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

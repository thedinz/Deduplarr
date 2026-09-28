import net from "node:net";

export const DEFAULT_TRUSTED_PROXIES = [
  "127.0.0.0/8",
  "::1/128",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "fc00::/7",
  "fe80::/10"
];

export function normalizeAddress(address) {
  let value = String(address || "").trim();
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mapped ? mapped[1] : value;
}

function parseEntry(entry) {
  const [rawAddress, rawPrefix] = String(entry).trim().split("/");
  const address = normalizeAddress(rawAddress);
  const family = net.isIP(address);
  if (!family) return null;

  const type = family === 6 ? "ipv6" : "ipv4";
  const maxPrefix = family === 6 ? 128 : 32;
  if (rawPrefix === undefined) return { address, prefix: maxPrefix, type };

  const prefix = Number(rawPrefix);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) return null;
  return { address, prefix, type };
}

export function cleanTrustedProxies(value) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(",");
  const entries = source
    .map((entry) => String(entry).trim())
    .filter((entry) => entry && parseEntry(entry));
  return [...new Set(entries)];
}

export function compileTrustedProxies(list) {
  const blockList = new net.BlockList();
  for (const entry of list) {
    const parsed = parseEntry(entry);
    if (parsed) blockList.addSubnet(parsed.address, parsed.prefix, parsed.type);
  }

  return (address) => {
    const normalized = normalizeAddress(address);
    const family = net.isIP(normalized);
    if (!family) return false;
    return blockList.check(normalized, family === 6 ? "ipv6" : "ipv4");
  };
}

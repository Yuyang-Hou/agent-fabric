export function resolveServerBaseUrl(runtimeValue?: string, packagedValue?: string): string | undefined {
  const candidate = runtimeValue?.trim() || packagedValue?.trim();
  if (!candidate) return undefined;

  const parsed = new URL(candidate);
  const isLoopback = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  if ((!isLoopback && parsed.protocol !== "https:") || (isLoopback && !["http:", "https:"].includes(parsed.protocol))) {
    throw new Error("agent-fabric-server-url-insecure");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("agent-fabric-server-url-invalid");
  }
  return parsed.origin;
}

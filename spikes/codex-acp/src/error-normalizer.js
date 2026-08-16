const SECRET_PATTERNS = [
  /(?:sk|sess)-[A-Za-z0-9_-]{8,}/g,
  /(?:api[_-]?key|token|authorization)\s*[:=]\s*[^\s,;]+/gi,
];

function rawMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "Unknown ACP failure");
}

function sanitizedMessage(message) {
  for (const pattern of SECRET_PATTERNS) {
    message = message.replace(pattern, "[redacted]");
  }
  return message.slice(0, 240);
}

export function normalizeAcpFailure(error) {
  const raw = rawMessage(error);
  const message = sanitizedMessage(raw);
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;

  if (code === -32800 || /cancel(?:led|ed)|aborted/i.test(raw)) {
    return { code: "runtime_cancelled", retryable: false, message: "Runtime request was cancelled" };
  }

  if (/session.*(?:not found|missing|unknown)|unknown.*session/i.test(raw)) {
    return { code: "runtime_session_lost", retryable: true, message };
  }

  if (/auth|login|unauthori[sz]ed|credential/i.test(raw)) {
    return { code: "runtime_auth_required", retryable: false, message };
  }

  if (/spawn|enoent|executable|connection|closed|unavailable/i.test(raw)) {
    return { code: "runtime_unavailable", retryable: true, message };
  }

  return { code: "runtime_failed", retryable: false, message };
}

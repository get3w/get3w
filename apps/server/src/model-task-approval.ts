/** Host-owned quote data only. Never populate this record from Agent arguments. */
export interface ModelTaskApprovalQuote {
  quoteId: string;
  slug: string;
  sessionId: string;
  amountUsd: string;
  /** Unix milliseconds; convert the server expires_at seconds in the trusted adapter. */
  expiresAt: number;
}

export interface ModelTaskApprovalPolicy {
  autoApproveBelowUsd: string;
  maxSessionUsd: string;
}

function usdMicros(value: string): bigint {
  if (!/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(value)) throw new Error("Invalid USD amount");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export function modelTaskApprovalDecision(input: {
  quote: ModelTaskApprovalQuote;
  policy: ModelTaskApprovalPolicy;
  sessionCommittedUsd: string;
  now: number;
}): "allow" | "ask" {
  const { quote, policy } = input;
  if (!quote.quoteId || !quote.slug || !quote.sessionId || !Number.isFinite(quote.expiresAt) ||
      !Number.isFinite(input.now) || quote.expiresAt <= input.now) throw new Error("Quote expired or invalid");
  const amount = usdMicros(quote.amountUsd);
  const committed = usdMicros(input.sessionCommittedUsd);
  const threshold = usdMicros(policy.autoApproveBelowUsd);
  const maximum = usdMicros(policy.maxSessionUsd);
  // Exact threshold asks; session overflow asks even for a small task. This
  // host decision never overrides the server's hard admission limits.
  return amount < threshold && committed + amount <= maximum ? "allow" : "ask";
}

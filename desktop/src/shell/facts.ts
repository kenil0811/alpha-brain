import type { Fact } from "../core/client";
import { when } from "../modules/format";

/**
 * Where a fact came from, in words a person can check: what they said and when, what Alpha
 * noticed and from which words, or where it was looked up (design §7: every value with its
 * source; an idea from pull request #3's About you).
 */
export function factOrigin(f: Fact): string {
  const at = f.recorded_at ? when(f.recorded_at) : "";
  const quote = f.why ? ` — “${f.why.length > 90 ? `${f.why.slice(0, 90)}…` : f.why}”` : "";
  if (f.source === "stated") return `You said so${at ? `, ${at}` : ""}${quote}`;
  if (f.source.startsWith("turn:")) {
    if (f.state === "suggested") return `Alpha noticed it${at ? ` ${at}` : ""}${quote}`;
    return f.confidence >= 0.9 ? `From your own words${at ? `, ${at}` : ""}${quote}` : `Alpha noticed it${at ? ` ${at}` : ""}${quote}`;
  }
  if (f.source === "alpha") return `Alpha worked it out${at ? `, ${at}` : ""}${quote}`;
  return `From ${f.source}${at ? `, ${at}` : ""}${quote}`;
}

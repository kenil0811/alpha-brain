/**
 * Agents (Q33): an automation's last run is judged by code; its verdict reads the same wherever it
 * shows (the Agents and automations data view, an automation's page).
 */
/** A run's verdict, judged by code (Q33), as one of the five chip tones. */
export const VERDICT: Record<"succeeded" | "partial" | "failed", { tone: "good" | "warn" | "bad"; words: string }> = {
  succeeded: { tone: "good", words: "Succeeded" },
  partial: { tone: "warn", words: "Partial" },
  failed: { tone: "bad", words: "Failed" },
};

/**
 * What every card shows the same way (P3 of the tasks-and-cards proposal): a No that says why in
 * one tap, the line saying where the card came from, and a decision's state in words and colour.
 */
import type { CardFrom, DecisionCard } from "../core/client";
import { REASONS } from "../core/client";
import { when } from "../modules/format";
import { Button } from "../ui";
import { Menu, MenuHeading, MenuItem } from "../ui/Menu";

/** A No with its reason: the button opens the six reasons; picking one is the No. */
export function NoWithReason({ label = "Not now", disabled, onNo }: { label?: string; disabled?: boolean; onNo: (reason: string) => void }) {
  return (
    <Menu
      align="start"
      trigger={
        <Button variant="ghost" disabled={disabled}>
          {label}
        </Button>
      }
    >
      <MenuHeading>Why not?</MenuHeading>
      {REASONS.map((r) => (
        <MenuItem key={r} onSelect={() => onNo(r)}>
          {r}
        </MenuItem>
      ))}
    </Menu>
  );
}

/** "Drafted by Deal Analyst · from its run of 10:48 · for Ask the broker for the P&L", and
 *  what it rests on. Nothing when Alpha drafted it in the conversation. */
export function CardFromLine({ from }: { from?: CardFrom | null }) {
  if (!from || (!from.by && !from.task && !from.rests_on.length)) return null;
  const parts = [from.by ? `Drafted by ${from.by} for you` : null, from.run_at ? `from its run of ${when(from.run_at)}` : null, from.task ? `for ${from.task.title ?? "a task"}` : null].filter(Boolean);
  return (
    <div className="cardfrom faint">
      {parts.length ? <span>{parts.join(" · ")}</span> : null}
      {from.rests_on.length ? (
        <span>
          Rests on:{" "}
          {from.rests_on.map((r, i) => (
            <span key={`${r.text}-${i}`}>
              {i ? "; " : ""}
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.text}
                </a>
              ) : (
                r.text
              )}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** A decision's state in words and colour (P3 item 8): yes and edited green, no red with its
 *  reason, allowed blue, withdrawn and skipped grey, waiting yellow. */
export const DECISION: Record<DecisionCard["state"], { words: string; cls: string }> = {
  waiting: { words: "Waiting", cls: "badge--waiting" },
  answered: { words: "Answered", cls: "badge--good" },
  yes: { words: "Yes", cls: "badge--good" },
  edited: { words: "Yes, edited", cls: "badge--good" },
  no: { words: "No", cls: "badge--failed" },
  allowed: { words: "Allowed", cls: "badge--running" },
  skipped: { words: "Skipped", cls: "" },
  withdrawn: { words: "Withdrawn", cls: "" },
};

/**
 * A hypothesis's ✓ and ✕ (the owner, 12 Oct): shown on hover or focus at the end of its row.
 * ✓ asks whether it becomes a fact or a goal; ✕ rejects it. A hypothesis is a fact Alpha
 * suggested (state "suggested"); the core has no call that makes a goal of one, so "Make it a
 * goal" asks Alpha to propose the goal and to drop the hypothesis once the goal is approved; the
 * hypothesis stays until then (core-changes G11).
 */
import { say, type Client } from "../../core/client";
import { IconButton, useAssistant, useContextMenu } from "../../ui";
import { Check, ICON_SM, X } from "../../ui/icons";

export function HypothesisButtons({ client, id, text, done }: { client: Client; id: string; text: string; done: (words: string, ok?: boolean) => void }) {
  const assistant = useAssistant();
  const run = (work: () => Promise<unknown>, words: string) =>
    void work().then(
      () => done(words),
      (e: unknown) => done(say(e), false),
    );
  const approve = useContextMenu([
    { label: "Keep as a fact", onSelect: () => run(() => client.decideFact(id, true), "Kept as a fact.") },
    {
      label: "Make it a goal",
      disabled: assistant ? undefined : "Open the assistant to make goals.",
      onSelect: () =>
        run(async () => assistant!.say(`Add a goal: ${text}. It is your hypothesis (fact ${id}); once I approve the goal, reject that fact.`), "Alpha proposes it as a goal; approve it in the panel."),
    },
  ]);
  return (
    <span className="hypo">
      <IconButton size="sm" label="Approve" icon={<Check size={ICON_SM} />} aria-haspopup="menu" onClick={(e) => approve.openFrom(undefined, e.currentTarget)} />
      <IconButton size="sm" label="Reject" icon={<X size={ICON_SM} />} onClick={() => run(() => client.decideFact(id, false), "Rejected.")} />
      {approve.menu}
    </span>
  );
}

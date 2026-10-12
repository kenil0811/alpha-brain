/**
 * A page action that asks Alpha (9 Oct; 12 Oct, the owner: in the data view's toolbar). The core
 * has no call that makes a goal, an agent or an automation, so the action opens a small dialog
 * asking for a description, whose Send hands Alpha the request through the assistant
 * (`useAssistant().say`). Alpha then proposes it and asks for a yes.
 */
import { useState } from "react";
import { Button, Dialog, useAssistant } from "../ui";

export interface Describe {
  /** The dialog's title ("New", "Add goal"). */
  title: string;
  /** The box's words ("Describe the goal you want"). */
  placeholder: string;
  /** What Alpha is told, given the person's words. */
  ask: (text: string) => string;
}

/** New in Agents and automations (Intelligence's, or a project's): Alpha decides which fits, and
 *  asks when it is unclear (12 Oct, the owner). */
export const newAgentOrAutomation = (project?: string): Describe => ({
  title: "New",
  placeholder: "Describe what you want done",
  ask: (text) =>
    `${project ? `In ${project}, build` : "Build"} what's needed for this: ${text}\n` +
    "Decide whether it should be an automation (fixed steps that run the same way every time, no model, cheap and predictable) " +
    "or an agent (owns a recurring process and uses judgement, so it handles change but costs more and can be wrong). " +
    "If it's unclear which fits, ask me first and explain the trade-offs.",
});

export const ADD_GOAL: Describe = { title: "Add goal", placeholder: "Describe the goal you want", ask: (text) => `Add a goal: ${text}` };

/** `open(d)` shows the dialog for `d`; render `dialog` once on the page. */
export function useDescribe() {
  const assistant = useAssistant();
  const [open, setOpen] = useState<Describe | null>(null);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const send = () => {
    if (!open) return;
    assistant?.say(open.ask(text.trim()));
    setText("");
    setSent(true);
  };
  const dialog = (
    <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} title={open?.title ?? ""}>
      {sent ? (
        <p className="describe__sent" role="status">
          Sent to Alpha — it will ask you to approve.
        </p>
      ) : (
        <div className="dropdown__ask">
          <textarea autoFocus className="dropdown__askbox" aria-label={open?.placeholder} placeholder={open?.placeholder} value={text} onChange={(e) => setText(e.target.value)} />
          <Button variant="primary" size="sm" onClick={send} disabledReason={!assistant ? "The assistant isn't reachable here." : text.trim() ? undefined : "Describe it first."}>
            Send
          </Button>
        </div>
      )}
    </Dialog>
  );
  return {
    open: (d: Describe) => {
      setSent(false);
      setOpen(d);
    },
    dialog,
  };
}

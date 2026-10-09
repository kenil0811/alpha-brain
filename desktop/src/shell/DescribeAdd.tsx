/**
 * "Add goal", "Add agent", "Add automation" (9 Oct, the owner): the core has no call that makes
 * one, so the button opens the kit's describe box (the dropdown's "Add new…" pattern): a small
 * popover asking for a description, whose Send hands Alpha "Add a goal: …" through the assistant
 * (`useAssistant().say`). Alpha then proposes it and asks for a yes.
 */
import { useState } from "react";
import { Button, Popover, useAssistant } from "../ui";
import { ICON_SM, PlusIcon } from "../ui/icons";

export function DescribeAdd({ thing }: { thing: "goal" | "agent" | "automation" }) {
  const assistant = useAssistant();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const article = thing === "automation" ? "an" : "a";
  const send = () => {
    assistant?.say(`Add ${article} ${thing}: ${text.trim()}`);
    setText("");
    setSent(true);
  };
  return (
    <Popover
      label={`Add ${article} ${thing}`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSent(false);
      }}
      trigger={
        <Button size="sm">
          <PlusIcon size={ICON_SM} aria-hidden="true" /> Add {thing}
        </Button>
      }
    >
      {sent ? (
        <p className="describe__sent" role="status">
          Sent to Alpha — it will ask you to approve.
        </p>
      ) : (
        <div className="dropdown__ask">
          <textarea autoFocus className="dropdown__askbox" aria-label={`Describe the ${thing} you want`} placeholder={`Describe the ${thing} you want`} value={text} onChange={(e) => setText(e.target.value)} />
          <Button variant="primary" size="sm" onClick={send} disabledReason={!assistant ? "The assistant isn't reachable here." : text.trim() ? undefined : "Describe it first."}>
            Send
          </Button>
        </div>
      )}
    </Popover>
  );
}

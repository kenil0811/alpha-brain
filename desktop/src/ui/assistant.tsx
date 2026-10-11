import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

/** A way for any kit part to hand the assistant a request (the dropdown's "Add new…"). Null when
 *  no provider is mounted: the part then says the assistant isn't reachable. (9 Oct.)
 *  `describe` opens the one describe dialog the provider keeps, so it outlives the part that
 *  asked (a table cell's dropdown unmounts as its list closes). */
export const AssistantContext = createContext<{ say: (text: string) => void; describe?: (label: string, text: string) => void } | null>(null);

export function AssistantProvider({ say, children }: { say: (text: string) => void; children: ReactNode }) {
  const [asking, setAsking] = useState<{ label: string; text: string } | null>(null);
  const value = useMemo(() => ({ say, describe: (label: string, text: string) => setAsking({ label, text }) }), [say]);
  return (
    <AssistantContext.Provider value={value}>
      {children}
      {asking ? <DescribeDialog key={asking.label + asking.text} label={asking.label} initial={asking.text} onClose={() => setAsking(null)} /> : null}
    </AssistantContext.Provider>
  );
}

export const useAssistant = () => useContext(AssistantContext);

/** "Add new…": the person describes the option, and Send to Alpha puts it to the builder in this
 *  page's conversation (fixed rule 30, 11 Oct). */
export function DescribeDialog({ label, initial, onClose }: { label: string; initial: string; onClose: () => void }) {
  const assistant = useAssistant();
  const [text, setText] = useState(initial);
  const [sent, setSent] = useState(false);
  const send = () => {
    if (!assistant || !text.trim()) return;
    assistant.say(`Add a new option to "${label}": ${text.trim()}`);
    setText("");
    setSent(true);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Add to ${label}`}>
      {sent ? (
        <>
          <p className="describe__sent" role="status">
            Sent to Alpha — it will ask you to approve.
          </p>
          <div className="row dialog__actions">
            <Button onClick={onClose}>Close</Button>
          </div>
        </>
      ) : (
        <div className="dropdown__ask">
          <textarea
            autoFocus
            className="dropdown__askbox"
            aria-label="Describe what you'd like to add"
            placeholder="Describe what you'd like to add"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row dialog__actions">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={send} disabled={!text.trim()} disabledReason={assistant ? undefined : "The assistant isn't reachable here."}>
              Send to Alpha
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

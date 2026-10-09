/**
 * The add row (9 Oct, the UI rulebook §6): always at the bottom of a collection, in every view.
 * A sentence typed here goes to Alpha as a turn in the module's conversation, naming the table,
 * so the record is made the one way everything is made: each value known, estimated and said so,
 * or asked for (design §7), and the sentence kept as the record's source; this form writes
 * nothing itself (an idea from pull request #3, rebuilt on main's conversation model). "Add with
 * all fields" opens a new record page. When either cannot be done the control stays, disabled,
 * with the reason on hover. It took over from QuickEntry and the inline AddRow form.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { Button, InfoTip } from "../../ui";
import { Reason } from "../../ui/Reason";
import { PlusIcon } from "../../ui/icons";

export function AddRecordBar({ table, onSay, onNew }: { table: { name: string; title: string }; onSay?: (sentence: string) => void; onNew?: () => void }) {
  const [text, setText] = useState("");
  const label = `Add to ${table.title} in a sentence`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || !onSay) return;
    onSay(`Add to ${table.title}: ${clean}`);
    setText("");
  };
  const reason = "Alpha's panel is not open to this page, so there is no one to take a sentence.";
  return (
    <form className="addbar" onSubmit={submit} aria-label={label}>
      <span className="addbar__ico" aria-hidden="true">
        <PlusIcon />
      </span>
      {onSay ? (
        <input className="addbar__input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Add to ${table.title.toLowerCase()} in a sentence…`} aria-label={label} />
      ) : (
        <Reason reason={reason} render={(id) => <input className="addbar__input" disabled aria-describedby={id} placeholder={`Add to ${table.title.toLowerCase()} in a sentence…`} aria-label={label} />} />
      )}
      <InfoTip text="Say it in words and press Enter. Alpha fills the fields, keeps your sentence as the record's source, and says what it assumed or asks." />
      <Button size="sm" onClick={onNew} disabledReason={onNew ? undefined : "Record pages are not open from here."}>
        Add with all fields
      </Button>
    </form>
  );
}

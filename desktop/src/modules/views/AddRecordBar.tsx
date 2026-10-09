/**
 * The add row (9 Oct, the UI rulebook §6): always at the bottom of a collection, in every view.
 * A sentence typed here goes to Alpha as a turn in the module's conversation, naming the table,
 * so the record is made the one way everything is made: each value known, estimated and said so,
 * or asked for (design §7), and the sentence kept as the record's source; this form writes
 * nothing itself (an idea from pull request #3, rebuilt on main's conversation model). "Add with
 * all fields" opens a new record page. When either cannot be done the control stays, disabled,
 * with the reason on hover. It took over from QuickEntry and the inline AddRow form. The bar is
 * as wide as the table's window, not the table (in a table it sticks to the left, so a wide table
 * scrolling sideways never clips it); the sentence shrinks first, and below `ICON_ONLY_BELOW` px
 * the "Add with all fields" button keeps only its icon, its name in a tooltip.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { Button, IconButton, InfoTip, Tooltip, useWidth } from "../../ui";
import { Reason } from "../../ui/Reason";
import { FormIcon, ICON, PlusIcon } from "../../ui/icons";

/** Where the button gives up its words, in the bar's own width in px (a calibration). */
const ICON_ONLY_BELOW = 440;
const ALL_FIELDS = "Add with all fields";

export function AddRecordBar({ table, onSay, onNew }: { table: { name: string; title: string }; onSay?: (sentence: string) => void; onNew?: () => void }) {
  const [text, setText] = useState("");
  const [bar, width] = useWidth<HTMLFormElement>(ICON_ONLY_BELOW);
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
    <form className="addbar" ref={bar} onSubmit={submit} aria-label={label}>
      <span className="addbar__ico" aria-hidden="true">
        <PlusIcon />
      </span>
      {onSay ? (
        <input className="addbar__input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Add to ${table.title.toLowerCase()} in a sentence…`} aria-label={label} />
      ) : (
        <Reason reason={reason} render={(id) => <input className="addbar__input" disabled aria-describedby={id} placeholder={`Add to ${table.title.toLowerCase()} in a sentence…`} aria-label={label} />} />
      )}
      <InfoTip text="Say it in words and press Enter. Alpha fills the fields, keeps your sentence as the record's source, and says what it assumed or asks." />
      {width < ICON_ONLY_BELOW ? (
        onNew ? (
          <Tooltip text={ALL_FIELDS}>
            <IconButton size="sm" label={ALL_FIELDS} title="" icon={<FormIcon size={ICON} />} onClick={onNew} />
          </Tooltip>
        ) : (
          <IconButton size="sm" label={ALL_FIELDS} icon={<FormIcon size={ICON} />} disabledReason="Record pages are not open from here." />
        )
      ) : (
        <Button size="sm" onClick={onNew} disabledReason={onNew ? undefined : "Record pages are not open from here."}>
          {ALL_FIELDS}
        </Button>
      )}
    </form>
  );
}

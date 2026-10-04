import { useState } from "react";
import type { FormEvent } from "react";
import { Button, InfoTip } from "../../ui";

/**
 * Quick entry: a sentence becomes a row. The sentence goes to Alpha as a turn in the module's
 * conversation, naming the table, so the row is made the one way everything is made: with each
 * value known, estimated and said so, or asked for (design §7), and the sentence kept as the
 * row's source. The form itself writes nothing. (An idea from pull request #3, rebuilt on main's
 * conversation model: there a sentence became a row through a route of its own.)
 */
export function QuickEntry({ table, onSay }: { table: { name: string; title: string }; onSay: (sentence: string) => void }) {
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    onSay(`Add to ${table.title}: ${clean}`);
    setText("");
  };
  return (
    <form className="quick quick--table" onSubmit={submit} aria-label={`Add to ${table.title} in a sentence`}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Add to ${table.title.toLowerCase()} in a sentence…`} aria-label={`Add to ${table.title} in a sentence`} />
      <InfoTip text="Say it in words. Zazoo fills the fields, keeps your sentence as the row's source, and says what it assumed or asks." />
      <Button type="submit" size="sm" disabled={!text.trim()}>
        Add
      </Button>
    </form>
  );
}

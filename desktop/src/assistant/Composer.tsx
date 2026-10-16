/**
 * The composer (visual 11 of `docs/design/conversation-proposal.md`, slice 3, 16 Oct 2026): one
 * rounded box, the text area growing from one to six lines, under it one row with a plus for
 * files (the Mac's picker; they take the same route as a drop on a module's page), the mic,
 * and a round send button; "@" offers the agents as before. Enter sends, Shift+Enter adds a
 * line. Under the box, "Uses your Claude subscription" (§8) and the key hint.
 */
import { type KeyboardEvent, type RefObject, useEffect, useRef } from "react";
import type { Agent } from "../core/client";
import { MicButton, SendingSoon } from "../shell/voice";
import { IconButton } from "../ui";
import { ArrowUp, PlusIcon } from "../ui/icons";

const MOST_LINES = 6;

export function Composer({
  text,
  onChange,
  onSend,
  onKeyDown,
  onFiles,
  canSend,
  placeholder,
  inputRef,
  mentionable,
  onMention,
  mic,
  due,
}: {
  text: string;
  onChange: (text: string) => void;
  onSend: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onFiles: (files: File[]) => void;
  canSend: boolean;
  placeholder: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  mentionable: Agent[];
  onMention: (agent: Agent) => void;
  mic: { listening: boolean; supported: boolean; onToggle: () => void; onHoldStart: () => void; onHoldEnd: () => void };
  due: { text: string; onStop: () => void } | null;
}) {
  const picker = useRef<HTMLInputElement>(null);
  // The box grows with the words, one line to six, then scrolls; never a jump in the page.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    if (el.scrollHeight > 0) el.style.height = `${Math.min(el.scrollHeight, line * MOST_LINES + 8)}px`;
  }, [text, inputRef]);
  return (
    <div className="composer">
      {due ? <SendingSoon text={due.text} onStop={due.onStop} /> : null}
      {mentionable.length ? (
        <div className="mention" role="listbox" aria-label="Agents">
          {mentionable.map((a) => (
            <button key={a.id} type="button" role="option" aria-selected={false} className="mention__pick" onClick={() => onMention(a)}>
              @{a.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="composer__box">
        <textarea ref={inputRef} rows={1} value={text} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} aria-label="Message Alpha" />
        <div className="composer__tools">
          <input ref={picker} type="file" multiple hidden aria-hidden="true" tabIndex={-1} onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) onFiles(files); }} />
          <IconButton size="sm" label="Add files" icon={<PlusIcon size={16} />} onClick={() => picker.current?.click()} />
          <MicButton listening={mic.listening} supported={mic.supported} onToggle={mic.onToggle} onHoldStart={mic.onHoldStart} onHoldEnd={mic.onHoldEnd} small />
          <IconButton size="sm" className="composer__send" label="Send" icon={<ArrowUp size={16} />} disabled={!canSend} onClick={onSend} />
        </div>
      </div>
      <div className="composer__row">
        <span>Uses your Claude subscription</span>
        <span className="composer__keys">⏎ to send · ⇧⏎ new line</span>
      </div>
    </div>
  );
}

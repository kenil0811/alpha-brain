/**
 * Where the person speaks to Alpha (9 Oct, the UI rulebook §9): one rounded box, a borderless text
 * area that grows as you type above a row with attach, the depth, the microphone and a round send
 * button. Depth is Quick overview or Deep thinking, never a model (the route is chosen in Settings ›
 * Thinks with); the core takes no depth with a message yet, so Deep thinking shows disabled with
 * the reason. Enter sends, Shift+Enter adds a line. Typing @ offers other agents: the rule
 * is here, the capability is not (Alpha is the only agent today), so the offer is one disabled
 * line that says so. The box owns no words of its own: the panel keeps them, so a lost send can
 * put them back and a draft from the window can land in it.
 */
import { type KeyboardEvent, type RefObject, useLayoutEffect, useRef, useState } from "react";
import type { Client, ModuleCard, Turn } from "../core/client";
import { MicButton } from "../shell/voice";
import { Dropdown, type DropdownOption, IconButton, Notice } from "../ui";
import { ArrowUp, AttachIcon } from "../ui/icons";

/** The line the @ offer shows. Alpha is the only agent today (Intelligence › Agents lists them). */
export const MENTION_REASON = "Alpha is the only agent today, so there is no one else to address yet.";

/** Why Deep thinking can't be chosen: `client.ask` carries no depth, tier or model. */
export const DEPTH_REASON = "Choosing depth needs Alpha's core; every answer is a quick overview for now.";
const DEPTH_DEFAULT_KEY = "alpha.depth.default";
type Depth = "quick" | "deep";
const DEPTHS: DropdownOption<Depth>[] = [
  { value: "quick", label: "Quick overview" },
  { value: "deep", label: "Deep thinking", disabled: DEPTH_REASON },
];
const storedDepth = (): Depth => {
  try {
    return localStorage.getItem(DEPTH_DEFAULT_KEY) === "deep" ? "deep" : "quick";
  } catch {
    return "quick";
  }
};

const GROWS_TO = 160;

export function Composer({
  client,
  module,
  text,
  onText,
  onSend,
  busy,
  placeholder,
  speech,
  inputRef,
  onFollow,
}: {
  client: Client;
  module: ModuleCard | null;
  text: string;
  onText: (text: string) => void;
  onSend: () => void;
  /** A turn is running: the words wait, the send button says why it cannot send. */
  busy: boolean;
  placeholder: string;
  speech: { listening: boolean; supported: boolean; toggle: () => void };
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Files that started a turn of their own: the panel follows it. */
  onFollow: (turn: Turn | null) => void;
}) {
  // ponytail: one depth until the core takes one with a message; then send `depth` with ask.
  const [depthDefault, setDepthDefault] = useState<Depth>(storedDepth);
  const [depth, setDepth] = useState<Depth>(() => (DEPTHS.find((d) => d.value === depthDefault)?.disabled ? "quick" : depthDefault));
  const [note, setNote] = useState<{ ok: boolean; text: string; files?: boolean } | null>(null);
  const [mentionOff, setMentionOff] = useState(false);
  const files = useRef<HTMLInputElement>(null);

  // The box grows with its words, up to a ceiling, then scrolls. (jsdom measures nothing: skipped.)
  useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    if (box.scrollHeight > 0) box.style.height = `${Math.min(box.scrollHeight, GROWS_TO)}px`;
  }, [text, inputRef]);

  const makeDefault = (d: Depth) => {
    setDepthDefault(d);
    try {
      localStorage.setItem(DEPTH_DEFAULT_KEY, d);
    } catch {
      /* the default lasts this session */
    }
  };

  const attach = async (picked: File[]) => {
    if (!picked.length) return;
    setNote({ ok: true, text: picked.length === 1 ? "Adding 1 file…" : `Adding ${picked.length} files…` });
    try {
      const out = await client.addFiles(picked, module ? { module: module.id } : {});
      setNote({ ok: true, text: `${picked.length === 1 ? "Added 1 file" : `Added ${picked.length} files`}${module ? ` to ${module.name}` : ""}.${out.turn ? " Alpha is reading it." : ""}` });
      onFollow(out.turn);
    } catch (e) {
      setNote({ ok: false, files: true, text: `Couldn't add the files: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const mention = !mentionOff && /(^|\s)@\S*$/.test(text);
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && mention) {
      e.stopPropagation(); // the offer closes first; the panel steps back only on the next one
      setMentionOff(true);
    } else if (e.key === "Enter" && (!e.shiftKey || e.metaKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  };
  const sendReason = !text.trim() ? "Write something to send." : busy ? "Alpha is still answering. Stop it, or wait." : undefined;

  return (
    <div className="composer">
      {mention ? (
        <div className="composer__mention" role="group" aria-label="Other agents">
          <div className="composer__mention-head">Other agents</div>
          <div className="composer__mention-row" aria-disabled="true">
            {MENTION_REASON}
          </div>
        </div>
      ) : null}
      <div className="composer__box">
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => {
            setMentionOff(false);
            onText(e.target.value);
          }}
          onKeyDown={key}
          placeholder={placeholder}
          aria-label="Message Alpha"
        />
        <div className="composer__row">
          <input ref={files} type="file" multiple hidden onChange={(e) => { void attach(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <IconButton size="sm" label="Attach files" title={module ? `Attach files to ${module.name}` : "Attach files"} icon={<AttachIcon />} onClick={() => files.current?.click()} />
          <Dropdown size="sm" className="composer__model" label="Depth" value={depth} options={DEPTHS} onChange={setDepth} defaultValue={depthDefault} onSetDefault={makeDefault} />
          <span className="composer__gap" />
          <MicButton listening={speech.listening} supported={speech.supported} onToggle={speech.toggle} small />
          <IconButton className="composer__send" label="Send" icon={<ArrowUp />} disabledReason={sendReason} onClick={onSend} />
        </div>
      </div>
      {note ? (
        <Notice tone={note.ok ? "ok" : "bad"} onRetry={note.files ? () => files.current?.click() : undefined} retryLabel="Choose files">
          {note.text}
        </Notice>
      ) : null}
    </div>
  );
}

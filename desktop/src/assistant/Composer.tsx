/**
 * Where the person speaks to Alpha (9 Oct, the UI rulebook §9): one rounded box, a borderless text
 * area that grows as you type above a row with attach, the choice of model, the microphone and a
 * round send button. Enter sends, Shift+Enter adds a line. Typing @ offers other agents: the rule
 * is here, the capability is not (Alpha is the only agent today), so the offer is one disabled
 * line that says so. The box owns no words of its own: the panel keeps them, so a lost send can
 * put them back and a draft from the window can land in it.
 */
import { type KeyboardEvent, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Client, ClaudeStatus, ModuleCard, ThinkRoute, Thinking, Turn } from "../core/client";
import { MicButton } from "../shell/voice";
import { Dropdown, type DropdownOption, IconButton, Notice } from "../ui";
import { ArrowUp, AttachIcon } from "../ui/icons";

/** The line the @ offer shows. Alpha is the only agent today (Intelligence › Agents lists them). */
export const MENTION_REASON = "Alpha is the only agent today, so there is no one else to address yet.";

const GROWS_TO = 160;
const ROUTE_NAME: Record<ThinkRoute, string> = { claude: "Claude", codex: "ChatGPT" };

/** Why a route cannot be chosen right now, or undefined when it can. */
function routeReason(route: ThinkRoute, status: ClaudeStatus | undefined): string | undefined {
  if (!status) return "Checking which models are ready.";
  if (!status.installed) return `${ROUTE_NAME[route]} isn't installed on this Mac. Set it up in Settings.`;
  if (!status.signed_in) return `${ROUTE_NAME[route]} isn't signed in. Sign in from Settings.`;
  return undefined;
}

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
  const [thinking, setThinking] = useState<Thinking | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string; files?: boolean } | null>(null);
  const [mentionOff, setMentionOff] = useState(false);
  const files = useRef<HTMLInputElement>(null);

  useEffect(() => {
    client.thinking().then(setThinking).catch(() => setThinking(null));
  }, [client]);
  // The box grows with its words, up to a ceiling, then scrolls. (jsdom measures nothing: skipped.)
  useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    if (box.scrollHeight > 0) box.style.height = `${Math.min(box.scrollHeight, GROWS_TO)}px`;
  }, [text, inputRef]);

  const options: DropdownOption<ThinkRoute>[] = (["claude", "codex"] as const).map((r) => ({ value: r, label: ROUTE_NAME[r], disabled: routeReason(r, thinking?.[r]) }));
  const choose = (route: ThinkRoute) => {
    client.setThinking(route).then(setThinking).catch((e: unknown) => setNote({ ok: false, text: `Couldn't change the model: ${e instanceof Error ? e.message : String(e)}` }));
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
          <Dropdown size="sm" className="composer__model" label="Model" value={thinking?.route ?? "claude"} options={options} onChange={choose} />
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

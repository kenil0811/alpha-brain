/**
 * The companion: Alpha's character in a small always-on-top window. It shows what Alpha is
 * really doing, most pressing first (pr1's avatar state): not connected, something failed,
 * waiting for the person, making a project, thinking, working, here. A bubble carries the one
 * thing that needs the person; a click opens a compact bubble with only the same composer as
 * Zazoo's panel (growing box, mic), then the working line, then only the reply. Expand shows the
 * whole chat (turns, questions as choices, action cards); a final spoken sentence sends by itself.
 * Anything that needs the full window is handed to the workspace.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { AppWindow, ArrowUp, Maximize2, Minimize2, X } from "lucide-react";
import type { ClaudeStatus, Client, Companion, Home, JournalEntry, Thread, Turn } from "../core/client";
import { Message } from "../assistant/AssistantPanel";
import { MicButton, useSpeech } from "../shell/voice";
import { IconButton } from "../ui";
import { type AvatarState, Character, type Mood } from "./Character";
import { Button } from "../ui/Button";
import { bindingOf, matches } from "../shell/shortcuts";

export const HANDOFF_KEY = "alpha.handoff";

export type AvatarMode = "idle" | "bubble" | "open";

export interface AvatarHost {
  layout(mode: AvatarMode): Promise<void>;
  showMain(): Promise<void>;
  /** What is drawn, as [left, top, width, height] in the window; clicks anywhere else pass
   * through to whatever is behind the companion. */
  hotAreas?(areas: number[][]): Promise<void>;
}

const HOT = ".avatar__panel, .avatar__bubble, .avatar__dock";
const GREETING = "Tell me what to do: log a meal, check the boards, open a project, or ask for something new.";
const BUBBLE_MS = 9_000;
const THINKING = "Working out your request";
/** A failed request is shown for this long, then the companion lets it go (Activity keeps it). */
const FAILURE_SHOWN_MS = 15 * 60 * 1000;

/** What the companion shows, from real state only, most pressing first (pr1 avatar/state.ts). */
export function avatarView(s: { busy: boolean; claude: ClaudeStatus | null; turns: JournalEntry[]; needs: number; threads: Thread[]; running: number }, now = Date.now()): { state: AvatarState; text: string } {
  if (s.claude && !s.claude.signed_in) return { state: "disconnected", text: "Connect Claude in Settings to start" };
  const last = s.turns[s.turns.length - 1];
  if (last?.kind === "failed" && now - new Date(last.at).getTime() < FAILURE_SHOWN_MS) return { state: "error", text: "Your last request didn't work out" };
  if (s.needs) return { state: "awaiting", text: needsText(s.needs) };
  const making = s.threads.find((t) => t.kind === "build" && t.state === "working");
  if (making) return { state: "building", text: making.title };
  if (s.busy) return { state: "thinking", text: THINKING };
  const active = s.running + s.threads.filter((t) => t.state === "working").length;
  if (active) return { state: "working", text: "Working on it…" };
  return { state: "idle", text: "Here" };
}

function needsText(n: number) {
  return n === 1 ? "One thing needs you" : `${n} things need you`;
}

/** A reply shown in the compact bubble, shaped like a journal entry so it renders as the panel's. */
function replyEntry(text: string, ok: boolean): JournalEntry {
  return { id: `reply-${Date.now()}`, at: new Date().toISOString(), kind: ok ? "replied" : "failed", actor: "alpha", text, data: {}, module: null, thread: null, entity_ids: [], source: null };
}

/** The composer grows with its text up to its CSS max-height. */
function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function handOff(value: Record<string, unknown>, host?: AvatarHost) {
  try {
    localStorage.setItem(HANDOFF_KEY, JSON.stringify({ ...value, at: Date.now() }));
  } catch {
    /* no shared storage: the workspace isn't told */
  }
  void host?.showMain();
}

export function AvatarWindow({ client, host }: { client: Client; host?: AvatarHost }) {
  const [expanded, setExpanded] = useState(false);
  // Compact (only the box, then only the reply) or the whole chat; kept while this window lives.
  const [full, setFull] = useState(false);
  const [reply, setReply] = useState<JournalEntry | null>(null);
  const [turns, setTurns] = useState<JournalEntry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<Mood>("idle");
  const [bubble, setBubble] = useState<string | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [claude, setClaude] = useState<ClaudeStatus | null>(null);
  const [running, setRunning] = useState<Turn[]>([]);
  const [done, setDone] = useState(0);
  const [comp, setComp] = useState<Companion | null>(null);
  const [routing, setRouting] = useState<{ ask: string; options: string[]; text: string } | null>(null);
  const [whereNote, setWhereNote] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    client
      .companion()
      .then((c) => {
        setComp(c);
        return client.conversation(null, c.focus?.id ?? null);
      })
      .then((c) => {
        setTurns(c.turns.slice(-12));
        setRunning(c.running);
      })
      .catch(() => undefined);
    client.home().then(setHome).catch(() => undefined);
    client.claude().then(setClaude).catch(() => undefined);
  }, [client]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10_000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight });
  }, [turns, expanded, busy]);

  const toggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (!next) setReply(null);
  }, [expanded]);
  // The box is focused on open and again when the view switches (it is drawn anew).
  useEffect(() => {
    if (expanded) setTimeout(() => inputRef.current?.focus(), 50);
  }, [expanded, full]);

  // Drag the character itself: past a small threshold the window moves with the pointer (the
  // host's own window drag); a press without movement stays a click.
  const dragged = useRef(false);
  const press = useRef<{ x: number; y: number } | null>(null);
  const dragHandlers = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      press.current = { x: e.screenX, y: e.screenY };
      dragged.current = false;
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      const p = press.current;
      if (!p || dragged.current || Math.hypot(e.screenX - p.x, e.screenY - p.y) < 4) return;
      dragged.current = true;
      press.current = null;
      void import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
        .catch(() => undefined);
    },
    onPointerUp: () => {
      press.current = null;
    },
  };

  const say = useCallback(
    (reply: string, tone: Mood) => {
      setMood(tone);
      setBubble(reply.length > 220 ? `${reply.slice(0, 217)}…` : reply);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      bubbleTimer.current = setTimeout(() => {
        setBubble(null);
        setMood("idle");
      }, BUBBLE_MS);
    },
    [],
  );

  /** Follow a routed turn to its answer; a routing question comes back as choices. */
  const finish = useCallback(
    async (started: Turn, before: string | null) => {
      // Routing happens in the core's worker now: the sentence may come back at once or after
      // a judge has looked, as a question with choices either way.
      const turn = await client.waitTurn(started);
      if (turn.state === "asked" && turn.ask) {
        setRouting({ ask: turn.ask, options: turn.options ?? [], text: turn.text });
        setMood("idle");
        return;
      }
      const went = turn.conversation;
      const moved = went && went.id !== before ? `In ${went.scope}: ` : "";
      setWhereNote(went ? `${went.scope}: ${went.title}` : null);
      setReply(replyEntry(`${moved}${turn.reply ?? ""}`, turn.state === "done"));
      say(`${moved}${turn.reply ?? ""}`, turn.state === "done" ? "talking" : "sorry");
      if (turn.state === "done") setDone((n) => n + 1);
    },
    [client, say],
  );
  const send = useCallback(
    async (sentence: string) => {
      const clean = sentence.trim();
      if (!clean || busy) return;
      setBusy(true);
      setMood("thinking");
      setText("");
      if (inputRef.current) inputRef.current.style.height = "";
      setRouting(null);
      try {
        // No conversation named: the core routes it (structure first, the judge when there
        // is a real choice, a question when unsure).
        await finish(await client.ask(clean), comp?.focus?.id ?? null);
      } catch (e) {
        setReply(replyEntry(e instanceof Error ? e.message : String(e), false));
        say(e instanceof Error ? e.message : String(e), "sorry");
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [busy, client, say, refresh, finish, comp?.focus?.id],
  );
  const choose = useCallback(
    async (askId: string, option: string) => {
      setBusy(true);
      setMood("thinking");
      try {
        const out = await client.answerAsk(askId, option);
        setRouting(null);
        if (out.turn) await finish(out.turn, comp?.focus?.id ?? null);
      } catch (e) {
        setReply(replyEntry(e instanceof Error ? e.message : String(e), false));
        say(e instanceof Error ? e.message : String(e), "sorry");
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [client, finish, say, refresh, comp?.focus?.id],
  );

  // A final spoken sentence goes at once, as in Alpha; while speaking, the words show in the box.
  const sendRef = useRef(send);
  sendRef.current = send;
  const speech = useSpeech((final, interim) => {
    setText(final || interim);
    if (final) void sendRef.current(final);
  });
  useEffect(() => {
    setMood((m) => (speech.listening ? "listening" : m === "listening" ? "idle" : m));
  }, [speech.listening]);

  const needs = home?.needs_you ?? [];
  const view = avatarView({ busy, claude, turns, needs: needs.length, threads: home?.threads ?? [], running: running.length });
  // The ring and dot keep their four looks: listening, working, needs you, here.
  const state = speech.listening ? "listening" : view.state === "thinking" || view.state === "working" || view.state === "building" ? "working" : view.state === "idle" ? "idle" : "needs";
  // At rest the companion names the conversation it is in.
  const focusName = comp?.focus ? `${comp.focus.scope}: ${comp.focus.title}` : whereNote;
  const label = speech.listening ? "Listening…" : view.state === "idle" && focusName ? focusName : view.text;
  const openAsk = needs.find((n) => n.kind === "ask");
  const openAction = needs.find((n) => n.kind === "action" && n.action);
  const shownBubble = bubble ?? (!expanded && needs.length ? needs[0].text : !expanded && view.state === "disconnected" ? view.text : null);
  const mode: AvatarMode = expanded ? "open" : shownBubble ? "bubble" : "idle";
  useEffect(() => {
    host?.layout(mode).catch(() => undefined);
  }, [host, mode]);

  // Tell the host where the companion is drawn, whenever that moves or changes size.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !host?.hotAreas) return;
    const report = () => {
      const areas = Array.from(root.querySelectorAll<HTMLElement>(HOT)).map((el) => {
        const r = el.getBoundingClientRect();
        return [r.left, r.top, r.width, r.height];
      });
      host.hotAreas?.(areas).catch(() => undefined);
    };
    report();
    const watcher = new ResizeObserver(report);
    watcher.observe(root);
    root.querySelectorAll<HTMLElement>(HOT).forEach((el) => watcher.observe(el));
    window.addEventListener("resize", report);
    return () => {
      watcher.disconnect();
      window.removeEventListener("resize", report);
    };
  }, [host, mode, shownBubble, full]);

  const composer = (
    <form
      className="avatar__composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (speech.listening) speech.stop();
        void send(text);
      }}
    >
      <div className="avatar__ask">
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={(e) => {
            if (!e.nativeEvent.isComposing && matches(e, bindingOf("send"))) {
              e.preventDefault();
              if (speech.listening) speech.stop();
              void send(text);
            }
          }}
          placeholder="Ask…"
          aria-label="What should Zazoo do"
          disabled={busy}
        />
        {full ? null : (
          <IconButton size="sm" aria-label="Show the whole chat" title="Show the whole chat" onClick={() => setFull(true)}>
            <Maximize2 size={14} aria-hidden="true" />
          </IconButton>
        )}
        <MicButton listening={speech.listening} supported={speech.supported} onToggle={speech.toggle} small />
        <IconButton type="submit" size="sm" className="avatar__send" aria-label="Send" title="Enter to send, Shift+Enter for a new line" disabled={busy || !text.trim()}>
          <ArrowUp size={14} aria-hidden="true" />
        </IconButton>
      </div>
    </form>
  );
  const routingChoices = routing ? (
    <div className="avatar__pills" role="group" aria-label="Which conversation">
      <p className="panel__hint">Which is this about?</p>
      {routing.options.map((o) => (
        <Button key={o} variant="outline" size="sm" className="askcard__opt" disabled={busy} onClick={() => void choose(routing.ask, o)}>
          {o}
        </Button>
      ))}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`avatar${expanded ? " avatar--open" : ""}`} onKeyDown={(e) => e.key === "Escape" && expanded && toggle()}>
      {expanded && !full ? (
        <section className="avatar__panel avatar__panel--compact" aria-label="Zazoo">
          {needs.length ? (
            <Button variant="ghost" size="sm" className="avatar__needs" onClick={() => setFull(true)}>
              <span className="presence presence--needs" aria-hidden="true" />
              {needsText(needs.length)}
            </Button>
          ) : null}
          {busy ? (
            <p className="avatar__working" role="status">
              <span className="presence presence--working" aria-hidden="true" />
              {THINKING}
            </p>
          ) : routingChoices ? (
            <div className="avatar__last">{routingChoices}</div>
          ) : reply ? (
            <div className="avatar__last">
              <Message e={reply} />
            </div>
          ) : null}
          {composer}
        </section>
      ) : expanded ? (
        <section className="avatar__panel" aria-label="Zazoo">
          <header className="avatar__head" data-tauri-drag-region>
            <span className={`presence presence--${state}`} aria-hidden="true" />
            <b data-tauri-drag-region>Zazoo</b>
            <span className="faint avatar__state" data-tauri-drag-region>
              {label}
            </span>
            <IconButton size="sm" aria-label="Collapse the chat" title="Show only the last reply" onClick={() => setFull(false)}>
              <Minimize2 size={14} aria-hidden="true" />
            </IconButton>
            <IconButton size="sm" aria-label="Open the workspace" title="Open this conversation in the workspace" onClick={() => handOff({ panel: true, conversation: comp?.focus?.id, surface: comp?.focus?.module ? { kind: "module", id: comp.focus.module } : { kind: "home" } }, host)}>
              <AppWindow size={14} aria-hidden="true" />
            </IconButton>
            <IconButton size="sm" aria-label="Close" title="Close" onClick={() => toggle()}>
              <X size={14} aria-hidden="true" />
            </IconButton>
          </header>
          <div className="avatar__turns" ref={listRef}>
            {!turns.length ? <p className="panel__hint">{GREETING}</p> : null}
            {turns.map((t) => (
              <div key={t.id} className={t.kind === "said" ? "avatar__said" : "avatar__reply"}>
                {t.text}
              </div>
            ))}
            {routingChoices}
            {!busy && !routing && openAsk ? (
              <div className="avatar__pills" role="group" aria-label="Zazoo asks">
                <p className="panel__hint">{openAsk.text}</p>
                {(openAsk.options ?? []).map((o) => (
                  <Button key={o} variant="outline" size="sm" className="askcard__opt" onClick={() => void choose(openAsk.id, o)}>
                    {o}
                  </Button>
                ))}
              </div>
            ) : null}
            {!busy && openAction?.action ? (
              <div className="avatar__pills" role="group" aria-label="Zazoo proposes">
                <p className="panel__hint">
                  {openAction.action.effect === "send" ? "Send" : "Make"}: {openAction.action.title}
                </p>
                <Button size="sm" disabled={!openAction.action.preview} onClick={() => void client.approveAction(openAction.action!.id, false).then(() => { say(openAction.action!.effect === "send" ? "Sending it." : "Doing it.", "talking"); refresh(); })}>
                  {openAction.action.effect === "send" ? "Send it" : "Do it"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void client.declineAction(openAction.action!.id).then(refresh)}>
                  Not now
                </Button>
                <Button size="sm" variant="outline" onClick={() => handOff({ panel: true, surface: { kind: "home" } }, host)}>
                  See it
                </Button>
              </div>
            ) : null}
            {busy ? (
              <p className="panel__hint" role="status">
                Working on it…
              </p>
            ) : null}
          </div>
          {composer}
        </section>
      ) : null}
      <div className="avatar__dock">
        {!expanded && shownBubble ? (
          <div className="avatar__bubble" role="status">
            <p>{shownBubble}</p>
            {!bubble && needs.length ? (
              <div className="row">
                <Button size="sm" onClick={() => handOff({ surface: { kind: "home" } }, host)}>
                  Open
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="avatar__grip" data-tauri-drag-region title="Drag to move Alpha" aria-hidden="true">
          ⋯
        </div>
        <button type="button" className={`avatar__button is-${state}`} {...dragHandlers} onClick={() => (dragged.current ? (dragged.current = false) : toggle())} aria-label={expanded ? "Hide Zazoo's panel" : "Ask Zazoo"} aria-expanded={expanded} title={label}>
          <Character mood={busy ? "thinking" : speech.listening ? "listening" : mood} state={view.state} done={done} size={expanded ? 56 : 88} />
        </button>
      </div>
    </div>
  );
}

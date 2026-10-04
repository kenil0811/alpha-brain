/**
 * The companion: Alpha's character in a small always-on-top window. It shows what Alpha is
 * doing (here, listening, working, needs you); a bubble carries the one thing that needs the
 * person; a click opens a small panel to say or type one thing, answered at once. Anything that
 * needs the full window is handed to the workspace, which comes forward.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Client, Companion, Home, JournalEntry, Turn } from "../core/client";
import { useVisible } from "../core/changes";
import { MicButton, useSpeech } from "../shell/voice";
import { Character, type Mood } from "./Character";
import { moved, press, released, type Press } from "./drag";
import { SIZE_PX, normaliseLook } from "./looks";
import { rigWidth } from "./Rig";
import { hasTauri } from "../core/session";
import { Button, IconButton, Rich } from "../ui";
import { X, Maximize2 } from "../ui/icons";

export const HANDOFF_KEY = "alpha.handoff";

export type AvatarMode = "idle" | "bubble" | "open";

export interface AvatarHost {
  /** Size the window to what it shows (the page says what it needs, which follows the
   * character's size), keeping its bottom-right corner in place. */
  layout(mode: AvatarMode, width: number, height: number): Promise<void>;
  showMain(): Promise<void>;
  /** What is drawn, as [left, top, width, height] in the window; clicks anywhere else pass
   * through to whatever is behind the companion. */
  hotAreas?(areas: number[][]): Promise<void>;
}

const HOT = ".avatar__panel, .avatar__bubble, .avatar__dock";

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
  const [turns, setTurns] = useState<JournalEntry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<Mood>("idle");
  const [bubble, setBubble] = useState<string | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [comp, setComp] = useState<Companion | null>(null);
  const [routing, setRouting] = useState<{ ask: string; options: string[]; text: string } | null>(null);
  const [whereNote, setWhereNote] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [trouble, setTrouble] = useState<string | null>(null);
  const refresh = useCallback(() => {
    client
      .companion()
      .then((c) => {
        setComp(c);
        return client.conversation(null, c.focus?.id ?? null);
      })
      .then((c) => {
        setTurns(c.turns.slice(-12));
        setTrouble(null);
      })
      .catch((e: unknown) => setTrouble(e instanceof Error ? e.message : String(e)));
    client.home().then(setHome).catch(() => undefined);
  }, [client]);
  // One cheap poll asks what changed (every 3 s while Alpha works, 10 s when quiet, nothing
  // while the window is hidden) and the companion refreshes only when something did.
  const visible = useVisible();
  const since = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      let every = 10_000;
      try {
        const c = await client.changes(since.current);
        const first = since.current === null;
        since.current = c.at;
        if (first || c.journal > 0 || c.threads || c.plans || c.actions) refresh();
        if (c.working) every = 3_000;
        setTrouble(null);
      } catch (e) {
        setTrouble(e instanceof Error ? e.message : String(e));
        every = 5_000;
      }
      if (!cancelled) timer = setTimeout(() => void tick(), every);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, refresh, visible]);
  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight });
  }, [turns, expanded, busy]);

  const toggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next) setTimeout(() => inputRef.current?.focus(), 50);
  }, [expanded]);

  const talkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A reply: the mouth moves for a moment, then the mood it came with holds while the
   * bubble shows (happy for an answer, concerned for a failure, celebrating for a thing done). */
  const say = useCallback((reply: string, tone: Mood) => {
    setMood("talking");
    if (talkTimer.current) clearTimeout(talkTimer.current);
    talkTimer.current = setTimeout(() => setMood(tone), 2_200);
    setBubble(reply.length > 220 ? `${reply.slice(0, 217)}…` : reply);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => {
      setBubble(null);
      setMood("idle");
    }, 12_000);
  }, []);

  /** Follow a routed turn to its answer; a routing question comes back as choices. */
  const finish = useCallback(
    async (started: Turn, before: string | null) => {
      // Routing happens in the core's worker now: the sentence may come back at once or after
      // a judge has looked, as a question with choices either way.
      const turn = await client.waitTurn(started);
      if (turn.state === "asked" && turn.ask) {
        setRouting({ ask: turn.ask, options: turn.options ?? [], text: turn.text });
        setMood("unsure");
        return;
      }
      const went = turn.conversation;
      setWhereNote(went ? `${went.scope}: ${went.title}` : null);
      say(`${went && went.id !== before ? `In ${went.scope}: ` : ""}${turn.reply ?? ""}`, turn.state === "done" ? "happy" : "concerned");
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
      setRouting(null);
      try {
        // No conversation named: the core routes it (structure first, the judge when there
        // is a real choice, a question when unsure).
        await finish(await client.ask(clean), comp?.focus?.id ?? null);
      } catch (e) {
        say(e instanceof Error ? e.message : String(e), "concerned");
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
        say(e instanceof Error ? e.message : String(e), "concerned");
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [client, finish, say, refresh, comp?.focus?.id],
  );

  const speech = useSpeech((final, interim) => {
    setText(final || interim);
  });
  useEffect(() => {
    setMood((m) => (speech.listening ? "listening" : m === "listening" ? "idle" : m));
  }, [speech.listening]);

  // Ten minutes with nothing happening and the companion dozes; anything wakes it.
  const [drowsy, setDrowsy] = useState(false);
  useEffect(() => {
    setDrowsy(false);
    if (busy || expanded || mood !== "idle") return;
    const timer = setTimeout(() => setDrowsy(true), 10 * 60_000);
    return () => clearTimeout(timer);
  }, [busy, expanded, mood, text, bubble]);
  const typing = expanded && text.trim().length > 0 && !busy && !speech.listening;
  const shownMood: Mood = busy ? "thinking" : speech.listening ? "listening" : mood !== "idle" ? mood : typing ? "curious" : drowsy ? "sleepy" : "idle";
  const look = normaliseLook(comp?.look);
  const px = SIZE_PX[look.size];

  // Drag from the character itself: a press that moves becomes a drag of the window; one
  // that does not is the click that opens the panel. Only the host can move a window.
  const pressed = useRef<Press | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pressed.current = press(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pressed.current;
    if (!p || p.dragging) return;
    const next = moved(p, e.clientX, e.clientY);
    pressed.current = next;
    if (next.dragging && hasTauri()) {
      void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().startDragging()).catch(() => undefined);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const outcome = released(pressed.current);
    pressed.current = null;
    // A pointer leaves no focus ring behind; the keyboard still gets one.
    (e.currentTarget as HTMLElement).blur();
    if (outcome === "click") toggle();
  };

  const needs = home?.needs_you ?? [];
  const state = busy ? "working" : speech.listening ? "listening" : needs.length ? "needs" : "idle";
  const focusName = comp?.focus ? `${comp.focus.scope}: ${comp.focus.title}` : whereNote;
  const label = trouble ? "Core not answering" : { working: "Working on it…", listening: "Listening…", needs: needs.length === 1 ? "One thing needs you" : `${needs.length} things need you`, idle: focusName ?? "Here" }[state];
  const openAsk = needs.find((n) => n.kind === "ask");
  const openAction = needs.find((n) => n.kind === "action" && n.action);
  const shownBubble = bubble ?? (!expanded && needs.length ? needs[0].text : null);
  const mode: AvatarMode = expanded ? "open" : shownBubble ? "bubble" : "idle";
  useEffect(() => {
    // The window covers what it shows: the character with room for its shadow, the character
    // under a bubble, or the open panel.
    const [width, height] = mode === "open" ? [380, 560] : mode === "bubble" ? [320, 150 + px] : [rigWidth(px) + 32, px + 44];
    host?.layout(mode, width, height).catch(() => undefined);
  }, [host, mode, px]);

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
  }, [host, mode, shownBubble]);

  return (
    <div ref={rootRef} className={`avatar${expanded ? " avatar--open" : ""}`} onKeyDown={(e) => e.key === "Escape" && expanded && toggle()}>
      {expanded ? (
        <section className="avatar__panel" aria-label="Alpha companion">
          <header className="avatar__head" data-tauri-drag-region>
            <span className={`presence presence--${state}`} aria-hidden="true" />
            <span className="faint" data-tauri-drag-region>
              {label}
            </span>
            <IconButton size="sm" label="Open the workspace" title="Open this conversation in the workspace" icon={<Maximize2 />} onClick={() => handOff({ panel: true, conversation: comp?.focus?.id, surface: comp?.focus?.module ? { kind: "module", id: comp.focus.module } : { kind: "home" } }, host)} />
            <IconButton size="sm" label="Close" icon={<X />} onClick={() => toggle()} />
          </header>
          <div className="avatar__turns" ref={listRef}>
            {!turns.length ? <p className="panel__hint">Tell me what to do: log a meal, check a board, ask what's coming up.</p> : null}
            {turns.map((t) => (
              <div key={t.id} className={t.kind === "said" ? "avatar__said" : "avatar__reply"}>
                {t.kind === "said" ? t.text : <Rich text={t.text} />}
              </div>
            ))}
            {routing ? (
              <div className="avatar__pills" role="group" aria-label="Which conversation">
                <p className="panel__hint">Which is this about?</p>
                {routing.options.map((o) => (
                  <Button size="sm" className="askcard__opt" key={o} disabled={busy} onClick={() => void choose(routing.ask, o)}>
                    {o}
                  </Button>
                ))}
              </div>
            ) : null}
            {!busy && !routing && openAsk ? (
              <div className="avatar__pills" role="group" aria-label="Alpha asks">
                <p className="panel__hint">{openAsk.text}</p>
                {(openAsk.options ?? []).map((o) => (
                  <Button size="sm" className="askcard__opt" key={o} onClick={() => void choose(openAsk.id, o)}>
                    {o}
                  </Button>
                ))}
              </div>
            ) : null}
            {!busy && openAction?.action ? (
              <div className="avatar__pills" role="group" aria-label="Alpha proposes">
                <p className="panel__hint">
                  {openAction.action.effect === "send" ? "Send" : "Make"}: {openAction.action.title}
                </p>
                <Button size="sm" variant="primary" disabled={!openAction.action.preview} onClick={() => void client.approveAction(openAction.action!.id, false).then(() => { say(openAction.action!.effect === "send" ? "Sending it." : "Doing it.", "celebrating"); refresh(); })}>
                  {openAction.action.effect === "send" ? "Send it" : "Do it"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void client.declineAction(openAction.action!.id).then(refresh)}>
                  Not now
                </Button>
                <Button size="sm" onClick={() => handOff({ panel: true, surface: { kind: "home" } }, host)}>
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
          <form className="avatar__ask" onSubmit={(e) => { e.preventDefault(); if (speech.listening) speech.stop(); void send(text); }}>
            <MicButton listening={speech.listening} supported={speech.supported} onToggle={speech.toggle} small />
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Log two eggs… what's on today…" aria-label="What should Alpha do" disabled={busy} />
            <Button size="sm" variant="primary" type="submit" disabled={busy || !text.trim()}>
              Do it
            </Button>
          </form>
        </section>
      ) : null}
      <div className="avatar__dock">
        {!expanded && shownBubble ? (
          <div className="avatar__bubble" role="status">
            <p>{shownBubble}</p>
            {!bubble && needs.length ? (
              <div className="row" style={{ marginTop: 6 }}>
                <Button size="sm" variant="primary" onClick={() => handOff({ surface: { kind: "home" } }, host)}>
                  Open
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          className={`avatar__button is-${state}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { pressed.current = null; }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
          aria-label={expanded ? "Hide Alpha's panel" : "Ask Alpha"}
          aria-expanded={expanded}
          title={`${label} · drag to move`}
        >
          <Character mood={shownMood} size={expanded ? Math.round(px * 0.7) : px} look={look} />
        </button>
      </div>
    </div>
  );
}

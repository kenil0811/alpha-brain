/**
 * The companion: Alpha's character in a small always-on-top window. It shows what Alpha is
 * doing (here, listening, working, needs you); a bubble carries the one thing that needs the
 * person; a click opens a small panel to say or type one thing, answered at once. Anything that
 * needs the full window is handed to the workspace, which comes forward.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Client, Companion, Home, JournalEntry, Turn } from "../core/client";
import { MicButton, useSpeech } from "../shell/voice";
import { Character, type Mood } from "./Character";
import { Button, IconButton } from "../ui";
import { X, Maximize2 } from "../ui/icons";

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

  const refresh = useCallback(() => {
    client
      .companion()
      .then((c) => {
        setComp(c);
        return client.conversation(null, c.focus?.id ?? null);
      })
      .then((c) => setTurns(c.turns.slice(-12)))
      .catch(() => undefined);
    client.home().then(setHome).catch(() => undefined);
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
    if (next) setTimeout(() => inputRef.current?.focus(), 50);
  }, [expanded]);

  const say = useCallback((reply: string, tone: Mood) => {
    setMood(tone);
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
        setMood("idle");
        return;
      }
      const went = turn.conversation;
      const moved = went && went.id !== before ? `In ${went.scope}: ` : "";
      setWhereNote(went ? `${went.scope}: ${went.title}` : null);
      say(`${moved}${turn.reply ?? ""}`, turn.state === "done" ? "talking" : "sorry");
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
        say(e instanceof Error ? e.message : String(e), "sorry");
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

  const needs = home?.needs_you ?? [];
  const state = busy ? "working" : speech.listening ? "listening" : needs.length ? "needs" : "idle";
  const focusName = comp?.focus ? `${comp.focus.scope}: ${comp.focus.title}` : whereNote;
  const label = { working: "Working on it…", listening: "Listening…", needs: needs.length === 1 ? "One thing needs you" : `${needs.length} things need you`, idle: focusName ?? "Here" }[state];
  const openAsk = needs.find((n) => n.kind === "ask");
  const openAction = needs.find((n) => n.kind === "action" && n.action);
  const shownBubble = bubble ?? (!expanded && needs.length ? needs[0].text : null);
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
                {t.text}
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
                <Button size="sm" variant="primary" disabled={!openAction.action.preview} onClick={() => void client.approveAction(openAction.action!.id, false).then(() => { say(openAction.action!.effect === "send" ? "Sending it." : "Doing it.", "talking"); refresh(); })}>
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
        <div className="avatar__grip" data-tauri-drag-region title="Drag to move Alpha" aria-hidden="true">
          ⋯
        </div>
        <button type="button" className={`avatar__button is-${state}`} onClick={() => toggle()} aria-label={expanded ? "Hide Alpha's panel" : "Ask Alpha"} aria-expanded={expanded} title={label}>
          <Character mood={busy ? "thinking" : mood} size={expanded ? 56 : 80} />
        </button>
      </div>
    </div>
  );
}

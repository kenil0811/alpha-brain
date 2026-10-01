/**
 * The companion: Alpha's character in a small always-on-top window. It shows what Alpha is
 * doing (here, listening, working, needs you); a bubble carries the one thing that needs the
 * person; a click opens a small panel to say or type one thing, answered at once. Anything that
 * needs the full window is handed to the workspace, which comes forward.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Client, Home, JournalEntry } from "../core/client";
import { MicButton, useSpeech } from "../shell/voice";
import { Character, type Mood } from "./Character";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    client.conversation().then((c) => setTurns(c.turns.slice(-12))).catch(() => undefined);
    client.home().then(setHome).catch(() => undefined);
  }, [client]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30_000);
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

  const send = useCallback(
    async (sentence: string) => {
      const clean = sentence.trim();
      if (!clean || busy) return;
      setBusy(true);
      setMood("thinking");
      setText("");
      try {
        const turn = await client.askAndWait(clean);
        say(turn.reply ?? "", turn.state === "done" ? "talking" : "sorry");
      } catch (e) {
        say(e instanceof Error ? e.message : String(e), "sorry");
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [busy, client, say, refresh],
  );

  const speech = useSpeech((final, interim) => {
    setText(final || interim);
  });
  useEffect(() => {
    setMood((m) => (speech.listening ? "listening" : m === "listening" ? "idle" : m));
  }, [speech.listening]);

  const needs = home?.needs_you ?? [];
  const state = busy ? "working" : speech.listening ? "listening" : needs.length ? "needs" : "idle";
  const label = { working: "Working on it…", listening: "Listening…", needs: needs.length === 1 ? "One thing needs you" : `${needs.length} things need you`, idle: "Here" }[state];
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
            <button type="button" className="iconbtn iconbtn--sm" aria-label="Open the workspace" title="Open the workspace" onClick={() => handOff({ panel: true }, host)}>
              ⤢
            </button>
            <button type="button" className="iconbtn iconbtn--sm" aria-label="Close" onClick={() => toggle()}>
              ×
            </button>
          </header>
          <div className="avatar__turns" ref={listRef}>
            {!turns.length ? <p className="panel__hint">Tell me what to do: log a meal, check a board, ask what's coming up.</p> : null}
            {turns.map((t) => (
              <div key={t.id} className={t.kind === "said" ? "avatar__said" : "avatar__reply"}>
                {t.text}
              </div>
            ))}
            {busy ? (
              <p className="panel__hint" role="status">
                Working on it…
              </p>
            ) : null}
          </div>
          <form className="avatar__ask" onSubmit={(e) => { e.preventDefault(); if (speech.listening) speech.stop(); void send(text); }}>
            <MicButton listening={speech.listening} supported={speech.supported} onToggle={speech.toggle} small />
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Log two eggs… what's on today…" aria-label="What should Alpha do" disabled={busy} />
            <button type="submit" className="btn btn--sm btn--primary" disabled={busy || !text.trim()}>
              Do it
            </button>
          </form>
        </section>
      ) : null}
      <div className="avatar__dock">
        {!expanded && shownBubble ? (
          <div className="avatar__bubble" role="status">
            <p>{shownBubble}</p>
            {!bubble && needs.length ? (
              <div className="row" style={{ marginTop: 6 }}>
                <button type="button" className="btn btn--sm btn--primary" onClick={() => handOff({ surface: { kind: "home" } }, host)}>
                  Open
                </button>
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

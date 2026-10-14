/**
 * Speaking instead of typing: one button that starts listening on a click, shows that it is
 * listening, puts words into the field as they come, and stops on the next click. Held down
 * instead (14 Oct, slice 2 E3, Kenil: "hold the mic"), it listens while held and, let go, sends
 * what was said after a moment that shows the words with Stop, so a mis-heard sentence can be
 * caught; no setting. Uses the browser's own recognition when the window offers it; otherwise it
 * points at the Mac's dictation, which works in any text field.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui";
import { Mic, Circle } from "../ui/icons";

/** A press this long on the mic is a hold (talk and send), not a click. */
export const HOLD_MS = 350;
/** How long the words show with Stop before a held sentence is sent: time to read one line. */
export const SEND_AFTER_MS = 2000;
/** How long to wait for the last words after letting go, when recognition never says it ended. */
const LAST_WORDS_MS = 1500;

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionClass(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return recognitionClass() !== null;
}

/**
 * `onText(final, interim)` is called as words arrive: `final` is everything settled since
 * listening started, `interim` the words still being recognised.
 */
export function useSpeech(onText: (final: string, interim: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<Recognition | null>(null);
  const settled = useRef("");
  const lastInterim = useRef("");
  const finishing = useRef<((said: string) => void) | null>(null);
  const latest = useRef(onText);
  latest.current = onText;
  const said = () => `${settled.current} ${lastInterim.current}`.trim();
  const finished = () => {
    const done = finishing.current;
    finishing.current = null;
    done?.(said());
  };

  const stop = useCallback(() => {
    active.current?.stop();
    active.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionClass();
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-GB";
    settled.current = "";
    lastInterim.current = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const piece = e.results[i][0].transcript;
        if (e.results[i].isFinal) settled.current = `${settled.current} ${piece}`.trim();
        else interim += piece;
      }
      lastInterim.current = interim.trim();
      latest.current(settled.current, interim.trim());
    };
    r.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Alpha needs permission to use the microphone." : "Listening stopped.");
      setListening(false);
      active.current = null;
      finished();
    };
    r.onend = () => {
      if (active.current === r) {
        active.current = null;
        setListening(false);
      }
      finished();
    };
    setError(null);
    active.current = r;
    setListening(true);
    r.start();
  }, []);

  /** Stop listening and give everything said, once the last words are in. */
  const finish = useCallback(
    () =>
      new Promise<string>((resolve) => {
        const r = active.current;
        setListening(false);
        if (!r) return resolve(said());
        finishing.current = resolve;
        r.stop();
        setTimeout(() => {
          if (finishing.current === resolve) finished();
        }, LAST_WORDS_MS);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => () => active.current?.stop(), []);
  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);
  return { supported: speechSupported(), listening, error, start, stop, toggle, finish };
}

/** A sentence spoken with the mic held: due to be sent after a moment unless stopped. */
export function useSendSoon(send: (text: string) => void) {
  const [due, setDue] = useState<string | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (due === null) return;
    const timer = setTimeout(() => {
      setDue(null);
      sendRef.current(due);
    }, SEND_AFTER_MS);
    return () => clearTimeout(timer);
  }, [due]);
  return { due, soon: (text: string) => setDue(text.trim() ? text.trim() : null), stop: () => setDue(null) };
}

/** The mic held, wired to a box: listening while held; let go, the words fill the box and go
 *  after a moment unless stopped (`due`, `stop`). */
export function useHoldToSend(speech: { start: () => void; finish: () => Promise<string> }, send: (text: string) => void, setText: (text: string) => void) {
  const spoken = useSendSoon(send);
  return {
    due: spoken.due,
    stop: spoken.stop,
    holdStart: () => {
      spoken.stop();
      speech.start();
    },
    holdEnd: () =>
      void speech.finish().then((said) => {
        setText(said);
        spoken.soon(said);
      }),
  };
}

/** The moment before a held sentence goes: the words, and Stop, which keeps them to fix. */
export function SendingSoon({ text, onStop }: { text: string; onStop: () => void }) {
  return (
    <div className="sendsoon" role="status">
      <span className="sendsoon__words">Sending “{text}”</span>
      <Button size="sm" onClick={onStop}>
        Stop
      </Button>
    </div>
  );
}

/** The mic itself: red and pulsing while it listens, quiet otherwise. A click starts and stops
 *  listening; held down (`onHoldStart`, `onHoldEnd`), it listens until let go. */
export function MicButton({ listening, supported, onToggle, onHoldStart, onHoldEnd, small = false }: { listening: boolean; supported: boolean; onToggle: () => void; onHoldStart?: () => void; onHoldEnd?: () => void; small?: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const wasHold = useRef(false);
  const press = () => {
    if (!supported || listening || !onHoldStart) return;
    held.current = false;
    timer.current = setTimeout(() => {
      held.current = true;
      onHoldStart();
    }, HOLD_MS);
  };
  const letGo = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!held.current) return;
    held.current = false;
    wasHold.current = true; // the click that follows letting go is not a click
    onHoldEnd?.();
  };
  const click = () => {
    if (wasHold.current) {
      wasHold.current = false;
      return;
    }
    onToggle();
  };
  const title = supported ? (listening ? "Stop listening" : onHoldStart ? "Click to speak; hold to speak and send" : "Speak instead of typing") : "Speaking isn't available in this window; press your Mac's dictation key instead";
  return (
    <button type="button" className={`iconbtn${small ? " iconbtn--sm" : ""}${listening ? " iconbtn--live" : ""}`} title={title} aria-label={listening ? "Stop listening" : "Speak"} aria-pressed={listening} onClick={click} onPointerDown={press} onPointerUp={letGo} onPointerLeave={letGo} onPointerCancel={letGo} disabled={!supported}>
      <span aria-hidden="true" className="iconbtn__ico">{listening ? <Circle size={12} fill="currentColor" /> : <Mic size={16} />}</span>
      {listening ? <span className="live__word">Listening</span> : null}
    </button>
  );
}

/**
 * Speaking instead of typing: one button that starts listening on a click, shows that it is
 * listening, puts words into the field as they come, and stops on the next click. In the app it
 * uses the Mac's own listening through the host (one utterance at a time); in a browser, the
 * window's own recognition; failing both, it points at the Mac's dictation key.
 */
import { Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton } from "../ui/IconButton";
import { nativeSpeech } from "./nativeSpeech";

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
  return nativeSpeech() !== null || recognitionClass() !== null;
}

const NO_MIC = "Zazoo needs permission to use the microphone.";

/**
 * `onText(final, interim)` is called as words arrive: `final` is everything settled since
 * listening started, `interim` the words still being recognised.
 */
export function useSpeech(onText: (final: string, interim: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stops whatever is listening now; also its identity, so a late end from an old session is ignored.
  const active = useRef<(() => void) | null>(null);
  const settled = useRef("");
  const latest = useRef(onText);
  latest.current = onText;

  const stop = useCallback(() => {
    active.current?.();
    active.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    settled.current = "";
    setError(null);
    setListening(true);
    const native = nativeSpeech();
    if (native) {
      let stopNative: (() => void) | null = null;
      const session = () => (stopNative ? stopNative() : undefined);
      const ended = () => {
        if (active.current === session) {
          active.current = null;
          setListening(false);
        }
      };
      // Words still arrive after a stop (the host hands over what it heard), unless a newer
      // session has started since.
      const superseded = () => active.current !== null && active.current !== session;
      active.current = session;
      native
        .listen(
          (partial) => {
            if (!superseded()) latest.current(settled.current, partial);
          },
          (final) => {
            if (superseded()) return;
            settled.current = final;
            latest.current(final, "");
            ended();
          },
          (message) => {
            if (active.current === session) setError(message.startsWith("permission_denied") ? NO_MIC : message);
            ended();
          },
        )
        .then((stopFn) => {
          stopNative = stopFn;
          // Stopped while the host was still starting: stop it now.
          if (active.current !== session) stopFn();
        })
        .catch(() => {
          if (active.current === session) setError("Listening stopped.");
          ended();
        });
      return;
    }
    const Ctor = recognitionClass();
    if (!Ctor) {
      setListening(false);
      return;
    }
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-GB";
    const session = () => r.stop();
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const piece = e.results[i][0].transcript;
        if (e.results[i].isFinal) settled.current = `${settled.current} ${piece}`.trim();
        else interim += piece;
      }
      latest.current(settled.current, interim.trim());
    };
    r.onerror = (e) => {
      setError(e.error === "not-allowed" ? NO_MIC : "Listening stopped.");
      setListening(false);
      active.current = null;
    };
    r.onend = () => {
      if (active.current === session) {
        active.current = null;
        setListening(false);
      }
    };
    active.current = session;
    r.start();
  }, []);

  useEffect(() => () => active.current?.(), []);
  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);
  return { supported: speechSupported(), listening, error, start, stop, toggle };
}

/** The mic itself: red and pulsing while it listens, quiet otherwise. */
export function MicButton({ listening, supported, onToggle, small = false }: { listening: boolean; supported: boolean; onToggle: () => void; small?: boolean }) {
  const title = supported ? (listening ? "Stop listening" : "Speak instead of typing") : "Speaking isn't available in this window; press your Mac's dictation key instead";
  return (
    <IconButton size={small ? "sm" : "default"} className={listening ? "iconbtn--live" : undefined} title={title} aria-label={listening ? "Stop listening" : "Speak"} aria-pressed={listening} onClick={onToggle} disabled={!supported}>
      {listening ? <Square size={10} fill="currentColor" aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
      {listening ? <span className="live__word">Listening</span> : null}
    </IconButton>
  );
}

/**
 * The Mac's own listening and speaking, through the native host (the app's WebKit has no speech
 * recognition). Null in a browser tab, where the window's own recognition and voices are used.
 */
import { hasTauri } from "../core/session";

export interface NativeSpeech {
  /** Starts listening. The host listens for one utterance: partials, then one final (or an
   *  error), then it stops by itself. The function given back stops it early; the words heard so
   *  far still arrive as the final. */
  listen(onPartial: (text: string) => void, onFinal: (text: string) => void, onError: (message: string) => void): Promise<() => void>;
  /** Says `text` aloud, replacing anything already being said; settles once it has been said,
   *  stopped, or replaced. */
  speak(text: string): Promise<void>;
  stopSpeaking(): Promise<void>;
}

type Unlisten = () => void;

// The speak() still waiting for its end: a new speak replaces it, and the host sends no end for
// a replaced utterance, so it is settled here instead.
let pendingSpeak: (() => void) | null = null;

export function nativeSpeech(): NativeSpeech | null {
  if (!hasTauri()) return null;
  const api = async () => {
    const [{ invoke }, { listen }] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event")]);
    return { invoke, listen };
  };

  return {
    async listen(onPartial, onFinal, onError) {
      const { invoke, listen } = await api();
      const off: Unlisten[] = [];
      const done = () => off.splice(0).forEach((unlisten) => unlisten());
      const on = (name: string, handler: (text: string) => void, last: boolean) =>
        listen<{ text: string }>(name, (event) => {
          if (last) done();
          handler(event.payload?.text ?? "");
        });
      // Listeners first: the host can answer before the start command returns.
      off.push(
        ...(await Promise.all([
          on("stt://partial", onPartial, false),
          on("stt://final", onFinal, true),
          on("stt://error", onError, true),
        ])),
      );
      try {
        await invoke("stt_start");
      } catch (error) {
        done();
        throw error;
      }
      return () => void invoke("stt_stop");
    },

    async speak(text) {
      pendingSpeak?.();
      pendingSpeak = null;
      if (!text.trim()) return;
      const { invoke, listen } = await api();
      let unlisten: Unlisten = () => undefined;
      let resolve: () => void = () => undefined;
      const finished = new Promise<void>((r) => (resolve = r));
      const mine = () => {
        unlisten();
        resolve();
      };
      pendingSpeak = mine;
      unlisten = await listen("tts://end", () => {
        if (pendingSpeak === mine) pendingSpeak = null;
        mine();
      });
      try {
        await invoke("tts_speak", { text });
      } catch (error) {
        if (pendingSpeak === mine) pendingSpeak = null;
        unlisten();
        throw error;
      }
      return finished;
    },

    async stopSpeaking() {
      const { invoke } = await api();
      await invoke("tts_stop");
    },
  };
}

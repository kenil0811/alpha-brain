/**
 * Zazoo saying something aloud: resolves when the words have been said (or cut off). The Mac's
 * own voice (`./nativeSpeech`) is used when the host offers it, else the window's
 * `speechSynthesis`.
 */
import { nativeSpeech } from "./nativeSpeech";

export function say(text: string): Promise<void> {
  const native = nativeSpeech();
  if (native) return native.speak(text);
  const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
  if (!synth) return Promise.resolve();
  synth.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.onend = u.onerror = () => resolve();
    synth.speak(u);
    // ponytail: a voice that never reports its end (no voices installed, a stuck engine) is
    // waited on for about twice a slow speaker's time, then counted as said.
    window.setTimeout(resolve, 3000 + text.split(/\s+/).length * 600);
  });
}

export function stopSaying() {
  void nativeSpeech()?.stopSpeaking();
  window.speechSynthesis?.cancel();
}

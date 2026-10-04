import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake host: commands are recorded, events are fired by the test.
const handlers = new Map<string, Set<(e: { payload: unknown }) => void>>();
const invoke = vi.fn(async (_command: string, _args?: unknown) => undefined);
const emit = (name: string, payload?: unknown) => handlers.get(name)?.forEach((h) => h({ payload }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string, a?: unknown) => invoke(c, a) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, handler: (e: { payload: unknown }) => void) => {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name)!.add(handler);
    return () => handlers.get(name)!.delete(handler);
  },
}));

import { nativeSpeech } from "./nativeSpeech";
import { useSpeech } from "./voice";

const live = (name: string) => handlers.get(name)?.size ?? 0;

describe("native speech", () => {
  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
  });
  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    handlers.clear();
    invoke.mockClear();
  });

  it("is null outside the app", () => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    expect(nativeSpeech()).toBeNull();
  });

  it("listens for one utterance, then lets go of the events", async () => {
    const partial = vi.fn();
    const final = vi.fn();
    const stop = await nativeSpeech()!.listen(partial, final, vi.fn());
    expect(invoke).toHaveBeenCalledWith("stt_start", undefined);
    emit("stt://partial", { text: "hello" });
    emit("stt://final", { text: "hello there" });
    expect(partial).toHaveBeenCalledWith("hello");
    expect(final).toHaveBeenCalledWith("hello there");
    expect(live("stt://partial") + live("stt://final") + live("stt://error")).toBe(0);
    stop();
    expect(invoke).toHaveBeenCalledWith("stt_stop", undefined);
  });

  it("speaks until the end event, and a new reply settles the one it replaced", async () => {
    const speech = nativeSpeech()!;
    let firstDone = false;
    const first = speech.speak("one").then(() => (firstDone = true));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("tts_speak", { text: "one" }));
    await Promise.resolve();
    expect(firstDone).toBe(false);
    const second = speech.speak("two");
    await first;
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("tts_speak", { text: "two" }));
    emit("tts://end");
    await second;
    expect(live("tts://end")).toBe(0);
  });

  it("useSpeech prefers the host in the app", async () => {
    const onText = vi.fn();
    const { result } = renderHook(() => useSpeech(onText));
    expect(result.current.supported).toBe(true);
    act(() => result.current.start());
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("stt_start", undefined));
    act(() => emit("stt://partial", { text: "log" }));
    expect(onText).toHaveBeenLastCalledWith("", "log");
    act(() => emit("stt://final", { text: "log lunch" }));
    expect(onText).toHaveBeenLastCalledWith("log lunch", "");
    expect(result.current.listening).toBe(false);

    act(() => result.current.start());
    await waitFor(() => expect(live("stt://error")).toBe(1));
    act(() => emit("stt://error", { text: "permission_denied: microphone" }));
    expect(result.current.error).toBe("Zazoo needs permission to use the microphone.");
  });
});

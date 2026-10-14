import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_MS, MicButton, SEND_AFTER_MS, SendingSoon, useHoldToSend, useSpeech } from "./voice";

/** A stand-in for the web view's speech recognition: words arrive when the test says. */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  started = false;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    setTimeout(() => this.onend?.(), 10);
  }
  hear(words: string) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: words } }] });
  }
}

function Box({ send }: { send: (text: string) => void }) {
  const [text, setText] = useState("");
  const speech = useSpeech((final, interim) => setText(final || interim));
  const spoken = useHoldToSend(speech, send, setText);
  return (
    <>
      {spoken.due ? <SendingSoon text={spoken.due} onStop={spoken.stop} /> : null}
      <input aria-label="Message" value={text} readOnly />
      <MicButton listening={speech.listening} supported={speech.supported} onToggle={speech.toggle} onHoldStart={spoken.holdStart} onHoldEnd={spoken.holdEnd} />
    </>
  );
}

describe("the mic (slice 2 E3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  const hold = async (words: string) => {
    const mic = screen.getByRole("button", { name: "Speak" });
    fireEvent.pointerDown(mic);
    await act(async () => void vi.advanceTimersByTime(HOLD_MS));
    expect(FakeRecognition.last?.started).toBe(true);
    act(() => FakeRecognition.last!.hear(words));
    fireEvent.pointerUp(screen.getByRole("button", { name: "Stop listening" }));
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    await act(async () => void vi.advanceTimersByTime(20));
  };

  it("held, sends what was said after a moment that shows it", async () => {
    const send = vi.fn();
    render(<Box send={send} />);
    await hold("log two eggs");
    expect(screen.getByRole("status")).toHaveTextContent("Sending “log two eggs”");
    expect(screen.getByLabelText("Message")).toHaveValue("log two eggs");
    expect(send).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(SEND_AFTER_MS));
    expect(send).toHaveBeenCalledWith("log two eggs");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Stop keeps the words in the box and sends nothing", async () => {
    const send = vi.fn();
    render(<Box send={send} />);
    await hold("log two legs");
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await act(async () => void vi.advanceTimersByTime(SEND_AFTER_MS));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Message")).toHaveValue("log two legs");
  });

  it("a click listens as before and never sends", async () => {
    const send = vi.fn();
    render(<Box send={send} />);
    const mic = screen.getByRole("button", { name: "Speak" });
    fireEvent.pointerDown(mic);
    fireEvent.pointerUp(mic);
    fireEvent.click(mic);
    expect(screen.getByRole("button", { name: "Stop listening" })).toBeInTheDocument();
    act(() => FakeRecognition.last!.hear("what's on today"));
    await act(async () => void vi.advanceTimersByTime(SEND_AFTER_MS * 2));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Message")).toHaveValue("what's on today");
  });
});

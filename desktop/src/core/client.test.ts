import { describe, expect, it, vi } from "vitest";
import { Client, CoreError, say, type Turn } from "./client";

const running: Turn = { id: "k1", state: "running", text: "hi", started_at: "" };

describe("following a turn", () => {
  it("tries again when the core misses a poll, and gives up only after a while", async () => {
    const client = new Client({ baseUrl: "http://127.0.0.1:1", token: "t".repeat(32) });
    const answers = [new CoreError("Alpha's core isn't answering.", 0), new CoreError("busy", 503), { ...running, state: "done" as const, reply: "Done." }];
    Object.assign(client, { turn: vi.fn(() => { const a = answers.shift(); return a instanceof Error ? Promise.reject(a) : Promise.resolve(a); }) });
    vi.useFakeTimers();
    const waited = client.waitTurn(running);
    await vi.advanceTimersByTimeAsync(3100);
    const final = await waited;
    expect(final.state).toBe("done");
    expect(client.turn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("stops at once when the core says it knows no such turn", async () => {
    const client = new Client({ baseUrl: "http://127.0.0.1:1", token: "t".repeat(32) });
    Object.assign(client, { turn: vi.fn(() => Promise.reject(new CoreError("There is no turn k1.", 400))) });
    vi.useFakeTimers();
    const waited = client.waitTurn(running).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1100);
    const out = await waited;
    expect(out).toBeInstanceOf(CoreError);
    expect(client.turn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("gives up after enough misses in a row", async () => {
    const client = new Client({ baseUrl: "http://127.0.0.1:1", token: "t".repeat(32) });
    Object.assign(client, { turn: vi.fn(() => Promise.reject(new CoreError("gone", 0))) });
    vi.useFakeTimers();
    const waited = client.waitTurn(running, undefined, 3).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(3500);
    expect(await waited).toBeInstanceOf(CoreError);
    expect(client.turn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

describe("an error in words", () => {
  it("shows Alpha's own sentence, and one plain line for anything else", () => {
    expect(say(new CoreError("That list is gone.", 404))).toBe("That list is gone.");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(say(new TypeError("x is undefined"))).toBe("Something went wrong. Try again.");
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
  it("reads a refusal's detail when it is a sentence, and not FastAPI's bare one", async () => {
    const answer = (body: unknown, status: number) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
    const c = new Client({ baseUrl: "", token: "" });
    answer({ detail: "This window isn't signed in." }, 401);
    await expect(c.health()).rejects.toThrow("This window isn't signed in.");
    answer({ detail: "Not Found" }, 404);
    await expect(c.health()).rejects.toThrow("That isn't there any more.");
    vi.unstubAllGlobals();
  });
});

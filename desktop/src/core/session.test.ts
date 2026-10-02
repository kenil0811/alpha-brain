import { describe, expect, it } from "vitest";
import { driftNotice, parseSession } from "./session";

const host = { baseUrl: "http://127.0.0.1:53900", token: "t".repeat(64) };

describe("the app and its core", () => {
  it("says so when they come from different commits, and only then", () => {
    const a = "a".repeat(40);
    const b = "b".repeat(40);
    expect(driftNotice(parseSession({ ...host, appCommit: a, coreCommit: b }))).toBe(
      "This window was built from aaaaaaa, but Alpha's core is running bbbbbbb. Rebuild the app (just app) so they match.",
    );
    expect(driftNotice(parseSession({ ...host, appCommit: a, coreCommit: a }))).toBeNull();
    expect(driftNotice(parseSession({ ...host, appCommit: "", coreCommit: b }))).toBeNull();
    expect(driftNotice(parseSession({ ...host, appCommit: a, coreCommit: null }))).toBeNull();
    expect(driftNotice(parseSession(host))).toBeNull();
  });
});

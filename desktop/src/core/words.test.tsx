import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { dayLabel, dayText, formatDay, timeText, when } from "../modules/format";
import { showValue } from "../modules/fields";
import { Intelligence } from "../shell/Intelligence";
import { CoreError, NOT_ANSWERING, plainError, say, type Client } from "./client";

describe("errors in words (section 9a)", () => {
  it("passes the core's own words through and says the rest plainly", () => {
    expect(plainError(400, { error: "That module has no table called x." })).toBe("That module has no table called x.");
    expect(plainError(401, { error: "This window isn't signed in to Alpha. Restart Alpha." })).toBe("This window isn't signed in to Alpha. Restart Alpha.");
    expect(plainError(404, { detail: "Not Found" })).toBe("That isn't there any more; it may have been removed.");
    expect(plainError(422, { detail: [{ loc: ["body", "value"], msg: "field required" }] })).toBe("Alpha couldn't take that. Try again.");
    expect(plainError(500, {})).toBe("Something went wrong in Alpha. Try again.");
  });

  it("never puts a fault of the window's own on the screen as code", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(say(new CoreError(NOT_ANSWERING, 0))).toBe(NOT_ANSWERING);
    expect(say(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe("Something went wrong here. Try again.");
    expect(say("The companion window is closed.")).toBe("The companion window is closed."); // the host's own words
  });
});

describe("dates, always absolute and the same in every engine (section 9b)", () => {
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), 9, 13, 14, 30);
  const lastYear = new Date(now.getFullYear() - 1, 8, 28, 9, 5);
  it("says the day, and the year only when it is another year", () => {
    expect(dayText(thisYear)).toBe("13 Oct");
    expect(dayText(lastYear)).toBe(`28 Sep ${now.getFullYear() - 1}`);
    expect(formatDay(`${now.getFullYear()}-10-13`)).toBe("13 Oct");
  });
  it("writes the time on the Mac's own clock, 24 or 12 hours", () => {
    expect(timeText(thisYear, false)).toBe("14:30");
    expect(timeText(thisYear, true)).toBe("2:30 pm");
    expect(timeText(new Date(2026, 0, 1, 0, 7), true)).toBe("12:07 am");
  });
  it("gives every moment its day, even today's, and never Yesterday", () => {
    const today = new Date();
    today.setHours(9, 0, 0, 0);
    expect(when(today.toISOString())).toMatch(new RegExp(`^${today.getDate()} [A-Z][a-z]{2}, `));
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    expect(when(yesterday.toISOString())).not.toMatch(/Yesterday/);
    expect(dayLabel(yesterday)).not.toMatch(/Yesterday|Today/);
    expect(showValue(thisYear.toISOString(), "datetime")).toBe(when(thisYear.toISOString()));
  });
});

describe("every delete confirms (section 9c)", () => {
  it("asks before revoking a standing permission, saying what changes", async () => {
    const permission = { id: "p1", procedure: "gmail_draft", sentence: "Draft emails in Gmail", granted_at: "2026-10-02T17:00:00Z" };
    const client = {
      intelligence: vi.fn().mockResolvedValue({ hands: [], skills: [], automations: [], readers: [], connections: [], knowledge: { facts: [], notes: [], goals: [], permissions: [permission] } }),
      modules: vi.fn().mockResolvedValue([]),
      revokePermission: vi.fn().mockResolvedValue({}),
    };
    render(<Intelligence client={client as unknown as Client} tab="knowledge" version={0} onTab={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByRole("dialog", { name: "Revoke this permission?" });
    expect(dialog).toHaveTextContent("“Draft emails in Gmail”: Alpha will ask you again before doing this.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(client.revokePermission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(client.revokePermission).toHaveBeenCalledWith("p1"));
  });
});

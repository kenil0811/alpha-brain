import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Action, Client, Convo, JournalEntry, ModuleCard, Plan } from "../core/client";
import { TooltipProvider } from "../ui";
import { AssistantPanel } from "./AssistantPanel";
import { DEPTH_REASON, MENTION_REASON } from "./Composer";

const CHAT: Convo = { id: "c1", title: "Chat", kind: "chat", state: "open", module: null, scope: "Everything", question: null, last: null, last_at: "", updated_at: "" };
const entry = (id: string, kind: string, text: string): JournalEntry => ({ id, at: "2026-10-09T10:00:00+00:00", kind, actor: "x", text, data: {}, module: null, thread: null, entity_ids: [], source: null });
const PLAN = { id: "p1", title: "Track my deals", body: "A Deals table with stage and value.", state: "proposed", module: null, thread: null, proposal: null, report: null, created_at: "" } as Plan;
const ACTION = { id: "a1", procedure: "x", title: "Message Ada", payload: { text: "Hello" }, evidence: null, undo: "It can be deleted.", effect: "send", site: "example.com", state: "proposed", module: null, preview: "shot.png", preview_note: null, shots: {}, result: null, error: null, created_at: "", updated_at: "" } as Action;

function setup(opts: { turns?: JournalEntry[]; plans?: Plan[]; actions?: Action[]; open?: boolean; module?: ModuleCard | null } = {}) {
  const client = {
    conversation: vi.fn(async () => ({ turns: opts.turns ?? [], threads: [], running: [], plans: opts.plans ?? [], actions: opts.actions ?? [], asks: [], conversation: CHAT, conversations: [CHAT] })),
    thinking: vi.fn(async () => ({ route: "claude", claude: { installed: true, signed_in: true }, codex: { installed: false, signed_in: false } })),
    setThinking: vi.fn(),
    askAndWait: vi.fn(async () => ({ id: "t1", state: "done", text: "", started_at: "" })),
    approvePlan: vi.fn(async () => ({})),
    declinePlan: vi.fn(async () => ({})),
    approveAction: vi.fn(async () => ({})),
    declineAction: vi.fn(async () => ({})),
    actionShot: vi.fn(async () => { throw new Error("no shot"); }),
    stopTurn: vi.fn(),
    addFiles: vi.fn(),
    preference: vi.fn(async (key: string) => ({ key, value: null })),
    activity: vi.fn(async () => []),
  } as unknown as Client;
  const onOpen = vi.fn();
  render(
    <TooltipProvider>
      <AssistantPanel client={client} open={opts.open ?? true} onOpen={onOpen} scopeName="Home" module={opts.module ?? null} version={0} onChanged={vi.fn()} draft={null} onDraftTaken={vi.fn()} />
    </TooltipProvider>,
  );
  return { client: client as unknown as Record<string, ReturnType<typeof vi.fn>>, onOpen };
}
const box = () => screen.getByRole("textbox", { name: "Message Alpha" });

describe("the assistant panel", () => {
  it("folded, it is a strip with Alpha's avatar, labelled Alpha, that opens the panel, and the bell below it", async () => {
    const { onOpen } = setup({ open: false });
    expect(screen.getByRole("button", { name: "Open the assistant" })).toHaveTextContent("Alpha");
    expect(screen.getByRole("button", { name: "Activity" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Open the assistant" }));
    expect(onOpen).toHaveBeenCalledWith(true);
  });

  it("has the Activity bell at the header's right end; it opens Activity", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    const bell = screen.getByRole("button", { name: "Activity" });
    expect(bell.closest(".pagehead")).not.toBeNull();
    await user.click(bell);
    expect(await screen.findByRole("textbox", { name: "Search activity" })).toBeInTheDocument();
    await waitFor(() => expect(client.activity).toHaveBeenCalled());
  });

  it("Enter sends and Shift+Enter adds a line", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    await screen.findByRole("textbox", { name: "Message Alpha" });
    await user.type(box(), "one{Shift>}{Enter}{/Shift}two");
    expect(box()).toHaveValue("one\ntwo");
    expect(client.askAndWait).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(client.askAndWait).toHaveBeenCalledTimes(1));
    expect(client.askAndWait.mock.calls[0][0]).toBe("one\ntwo");
  });

  it("typing @ offers other agents as one disabled line with the reason", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(box(), "hello");
    expect(screen.queryByRole("group", { name: "Other agents" })).toBeNull();
    await user.type(box(), " @");
    expect(screen.getByRole("group", { name: "Other agents" })).toHaveTextContent(MENTION_REASON);
  });

  it("a proposed plan is approved or declined through the existing routes", async () => {
    const user = userEvent.setup();
    const { client } = setup({ plans: [PLAN] });
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    expect(client.approvePlan).toHaveBeenCalledWith("p1");
    await user.click(screen.getByRole("button", { name: "Decline" }));
    expect(client.declinePlan).toHaveBeenCalledWith("p1");
    expect(client.approvePlan).toHaveBeenCalledTimes(1);
  });

  it("an action card is approved or declined through the existing routes", async () => {
    const user = userEvent.setup();
    const { client } = setup({ actions: [ACTION] });
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    expect(client.approveAction).toHaveBeenCalledWith("a1", false);
    await user.click(screen.getByRole("button", { name: "Decline" }));
    expect(client.declineAction).toHaveBeenCalledWith("a1");
  });

  it("the composer offers depth, not a model: Quick overview, and Deep thinking disabled with the reason", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    const depth = await screen.findByRole("combobox", { name: "Depth" });
    expect(depth).toHaveTextContent("Quick overview");
    expect(screen.queryByRole("combobox", { name: "Model" })).toBeNull();
    await user.click(depth);
    expect(screen.getByRole("option", { name: /Deep thinking/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("img", { name: "Quick overview is the default" })).toBeInTheDocument();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("status")).toHaveTextContent(DEPTH_REASON);
    expect(client.setThinking).not.toHaveBeenCalled();
  });

  it("after three approvals of one kind, the card suggests Always allow; before, it is a quiet button", async () => {
    const user = userEvent.setup();
    const prepare = { ...ACTION, procedure: "draft_note", effect: "prepare" } as Action;
    localStorage.removeItem("alpha.approvals.draft_note");
    const first = setup({ actions: [prepare] });
    expect(await screen.findByRole("button", { name: "Always allow" })).toBeInTheDocument();
    expect(screen.queryByText(/Always allow it\?/)).toBeNull();
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(first.client.approveAction).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem("alpha.approvals.draft_note")).toBe("3");
    cleanup();
    const next = setup({ actions: [prepare] });
    expect(await screen.findByText("You've approved this 3 times. Always allow it?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Always allow" }));
    expect(next.client.approveAction).toHaveBeenCalledWith("a1", true);
    localStorage.removeItem("alpha.approvals.draft_note");
  });

  it("Retry sends the person's last sentence again", async () => {
    const user = userEvent.setup();
    const { client } = setup({ turns: [entry("1", "said", "Add a deal"), entry("2", "failed", "That didn't work.")] });
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(client.askAndWait).toHaveBeenCalledTimes(1));
    expect(client.askAndWait.mock.calls[0][0]).toBe("Add a deal");
  });

});

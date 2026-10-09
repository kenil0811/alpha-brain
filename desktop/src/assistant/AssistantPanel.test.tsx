import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Action, Client, Convo, JournalEntry, ModuleCard, Plan } from "../core/client";
import { TooltipProvider } from "../ui";
import { AssistantPanel } from "./AssistantPanel";
import { MENTION_REASON } from "./Composer";

const CHAT: Convo = { id: "c1", title: "Chat", kind: "chat", state: "open", module: null, scope: "Everything", question: null, last: null, last_at: "", updated_at: "" };
const entry = (id: string, kind: string, text: string): JournalEntry => ({ id, at: "2026-10-09T10:00:00+00:00", kind, actor: "x", text, data: {}, module: null, thread: null, entity_ids: [], source: null });
const DEALS = { id: "deals", name: "Deals", children: [] } as unknown as ModuleCard;
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
  it("folded, it is a strip with Alpha's avatar that opens the panel", async () => {
    const { onOpen } = setup({ open: false });
    await userEvent.setup().click(screen.getByRole("button", { name: "Open the assistant" }));
    expect(onOpen).toHaveBeenCalledWith(true);
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

  it("a proposed plan is approved or vetoed through the existing routes", async () => {
    const user = userEvent.setup();
    const { client } = setup({ plans: [PLAN] });
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    expect(client.approvePlan).toHaveBeenCalledWith("p1");
    await user.click(screen.getByRole("button", { name: "Veto" }));
    expect(client.declinePlan).toHaveBeenCalledWith("p1");
    expect(client.approvePlan).toHaveBeenCalledTimes(1);
  });

  it("an action card is approved or vetoed through the existing routes", async () => {
    const user = userEvent.setup();
    const { client } = setup({ actions: [ACTION] });
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    expect(client.approveAction).toHaveBeenCalledWith("a1", false);
    await user.click(screen.getByRole("button", { name: "Veto" }));
    expect(client.declineAction).toHaveBeenCalledWith("a1");
  });

  it("Retry sends the person's last sentence again", async () => {
    const user = userEvent.setup();
    const { client } = setup({ turns: [entry("1", "said", "Add a deal"), entry("2", "failed", "That didn't work.")] });
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(client.askAndWait).toHaveBeenCalledTimes(1));
    expect(client.askAndWait.mock.calls[0][0]).toBe("Add a deal");
  });

  it("an empty conversation says, quietly, what Alpha can do here", async () => {
    setup({ module: DEALS });
    expect(await screen.findByText("Ask about Deals, change it, or log something.")).toBeInTheDocument();
  });
});

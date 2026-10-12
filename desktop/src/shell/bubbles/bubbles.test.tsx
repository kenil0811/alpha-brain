import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BubbleLayer } from "./BubbleLayer";
import { bubbleStore, bubblesFromReply, findTarget, parseBubbles, withoutBubbles } from "./bubbles";

function page() {
  const main = document.createElement("main");
  main.innerHTML = `<h2>Open deals</h2><table><tr><th>Stage</th><th>Owner</th></tr></table><button>Add deal</button>`;
  document.body.appendChild(main);
  return main;
}

afterEach(() => {
  act(() => bubbleStore.clear());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("bubble markup", () => {
  it("parses and strips the marks", () => {
    const text = "Look here [[bubble: Stage | Most are stuck]] and [[bubble:Owner]].";
    expect(parseBubbles(text)).toEqual([{ target: "Stage", comment: "Most are stuck" }, { target: "Owner", comment: "" }]);
    expect(withoutBubbles(text)).toBe("Look here and .");
  });

  it("anchors to the best matching element", () => {
    const main = page();
    expect(findTarget(main, "stage")?.textContent).toBe("Stage");
    expect(findTarget(main, "deals")?.textContent).toBe("Open deals");
    expect(findTarget(main, "deals", true)).toBeNull();
  });

  it("adds bubbles from marks and from quoted or bold names", () => {
    const main = page();
    bubblesFromReply("The **Owner** column is empty. Try \"Add deal\" next. [[bubble: Open deals | 4 of them]]", main);
    const got = bubbleStore.get().map((b) => [b.el.textContent, b.text]);
    expect(got).toEqual([["Open deals", "4 of them"], ["Owner", "The Owner column is empty."], ["Add deal", 'Try "Add deal" next.']]);
  });
});

describe("BubbleLayer", () => {
  function mount() {
    const main = page();
    const el = main.querySelector("th")!;
    el.getBoundingClientRect = () => ({ top: 10, left: 0, right: 50, bottom: 30, width: 50, height: 20, x: 0, y: 10, toJSON: () => ({}) });
    const view = render(<BubbleLayer page="a" />);
    act(() => bubbleStore.add(el, "Most are stuck"));
    return { view, bubble: screen.getByRole("button", { name: "Alpha's note: Most are stuck" }) };
  }

  it("anchors at the element and expands on hover and Enter", () => {
    const { bubble } = mount();
    expect(bubble.style.top).toBe("10px");
    expect(bubble.style.left).toBe("50px");
    fireEvent.pointerEnter(bubble);
    expect(bubble.textContent).toBe("Most are stuck");
    fireEvent.pointerLeave(bubble);
    expect(bubble.textContent).toBe("");
    fireEvent.keyDown(bubble, { key: "Enter" });
    expect(bubble).toHaveAttribute("aria-expanded", "true");
  });

  it("pops on a scrub", () => {
    vi.useFakeTimers();
    const { bubble } = mount();
    for (const x of [0, 10, 0, 10, 0]) fireEvent.pointerMove(bubble, { clientX: x });
    act(() => vi.advanceTimersByTime(300));
    expect(bubbleStore.get()).toHaveLength(0);
  });

  it("a slow back-and-forth does not pop", () => {
    vi.useFakeTimers();
    const { bubble } = mount();
    for (const x of [0, 10, 0, 10, 0]) {
      fireEvent.pointerMove(bubble, { clientX: x });
      vi.advanceTimersByTime(400);
    }
    expect(bubbleStore.get()).toHaveLength(1);
  });

  it("pops on Delete and clears when the page changes", () => {
    vi.useFakeTimers();
    const { view, bubble } = mount();
    fireEvent.keyDown(bubble, { key: "Delete" });
    act(() => vi.advanceTimersByTime(300));
    expect(bubbleStore.get()).toHaveLength(0);
    act(() => bubbleStore.add(document.querySelector("h2")!, ""));
    view.rerender(<BubbleLayer page="b" />);
    expect(bubbleStore.get()).toHaveLength(0);
  });
});

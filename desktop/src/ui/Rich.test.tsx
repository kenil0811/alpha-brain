import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Rich, split } from "./Rich";

describe("a reply's Markdown", () => {
  it("renders a list that follows a line, bold, code, numbered steps and a heading", () => {
    const text = "I know two connections named Sania:\n- **Sania Hussain** — Sales, connected in **2025-08**.\n- **Sania Fatima** — Senior Analyst.\n\nRecent history points to Sania Hussain.\n\n1. Open `food_log`\n2. Add a row\n\n## What next\nAsk me.";
    const { container } = render(<Rich text={text} />);
    const ul = container.querySelector("ul.rich__list");
    expect(ul?.querySelectorAll("li").length).toBe(2);
    expect(ul?.querySelector("li b")?.textContent).toBe("Sania Hussain");
    expect(container.querySelectorAll("p")[0].textContent).toBe("I know two connections named Sania:");
    expect(container.querySelector("ol.rich__list")?.querySelectorAll("li").length).toBe(2);
    expect(container.querySelector("code")?.textContent).toBe("food_log");
    expect(container.querySelector(".rich__h")?.textContent).toBe("What next");
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).not.toContain("##");
  });

  it("renders a table in the module table's look, a link that opens outside, and fenced code with Copy", () => {
    const text = "| Deal | Asking |\n|---|---|\n| Lone Star | $2.4M |\n| Bluebonnet | $410k |\n\nSee [the listing](https://example.com/d3).\n\n```\nselect *\nfrom deals\n```";
    const { container } = render(<Rich text={text} />);
    const table = container.querySelector("table.rich__table");
    expect(table?.querySelectorAll("thead th").length).toBe(2);
    expect(table?.querySelectorAll("tbody tr").length).toBe(2);
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/d3");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer");
    expect(container.querySelector(".rich__code pre code")?.textContent).toBe("select *\nfrom deals");
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("never renders HTML from a reply", () => {
    const { container } = render(<Rich text={'Hi <img src=x onerror="alert(1)"> there <script>x()</script>'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("keeps the block still being written as plain text while streaming, and renders the rest", () => {
    expect(split("Done:\n\n- one\n- tw")).toEqual({ stable: "Done:\n\n", tail: "- one\n- tw" });
    expect(split("Just words")).toEqual({ stable: "", tail: "Just words" });
    const { container } = render(<Rich text={"**Logged** eggs.\n\n| Day | kcal |\n|---|---|\n| Mon | 2"} streaming />);
    expect(container.querySelector("p b")?.textContent).toBe("Logged");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector(".rich__tail")?.textContent).toContain("| Day | kcal |");
    const done = render(<Rich text={"**Logged** eggs.\n\n| Day | kcal |\n|---|---|\n| Mon | 2 |"} />);
    expect(done.container.querySelector("table.rich__table")).not.toBeNull();
  });
});

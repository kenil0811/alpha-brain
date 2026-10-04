import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Rich } from "./Rich";

describe("a reply's light Markdown", () => {
  it("renders a list that follows a line, bold, code and numbered steps", () => {
    const text = "I know two connections named Sania:\n- **Sania Hussain** — Sales, connected in **2025-08**.\n- **Sania Fatima** — Senior Analyst.\n\nRecent history points to Sania Hussain.\n\n1. Open `food_log`\n2. Add a row\n\n## What next\nAsk me.";
    const { container } = render(<Rich text={text} />);
    const ul = container.querySelector("ul.rich__list");
    expect(ul?.querySelectorAll("li").length).toBe(2);
    expect(ul?.querySelector("li b")?.textContent).toBe("Sania Hussain");
    expect(container.querySelectorAll("p")[0].textContent).toBe("I know two connections named Sania:");
    expect(container.querySelector("ol.rich__list")?.querySelectorAll("li").length).toBe(2);
    expect(container.querySelector("code")?.textContent).toBe("food_log");
    const last = container.querySelectorAll("p");
    expect(last[last.length - 1].querySelector("b")?.textContent).toBe("What next");
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).not.toContain("##");
  });
});

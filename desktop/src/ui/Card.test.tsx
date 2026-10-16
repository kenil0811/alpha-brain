import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";

describe("the card frame", () => {
  it("draws the eyebrow, the title with its badge, the body and the foot", () => {
    render(
      <Card eyebrow="Alpha asks" title="Which size?" badge={<span className="badge">Open</span>} foot={<button type="button">Answer</button>} aria-label="Question">
        <p>330 ml or 500 ml</p>
      </Card>,
    );
    const card = screen.getByRole("article", { name: "Question" });
    expect(card).toHaveClass("frame");
    expect(card.querySelector(".frame__eyebrow")?.textContent).toBe("Alpha asks");
    expect(screen.getByRole("heading", { name: "Which size?" })).toHaveClass("frame__title");
    expect(card.querySelector(".frame__badge .badge")?.textContent).toBe("Open");
    expect(card.querySelector(".frame__foot button")?.textContent).toBe("Answer");
  });

  it("leaves out what it is not given", () => {
    const { container } = render(<Card>Just a body</Card>);
    expect(container.querySelector(".frame__head")).toBeNull();
    expect(container.querySelector(".frame__foot")).toBeNull();
  });
});

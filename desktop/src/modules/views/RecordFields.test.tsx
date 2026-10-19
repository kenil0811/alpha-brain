import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecordRow } from "../../core/client";
import { RecordFields } from "./RecordFields";

const row: RecordRow = {
  id: "r_1", revision: 2, created_at: "2026-10-11T10:00:00Z", updated_at: "2026-10-11T10:05:00Z",
  values: { address: "1600 S Lamar Blvd", traffic_aadt: 30403, households_3mi: null, memo: null },
  provenance: {
    by: "person",
    fields: {
      traffic_aadt: { source: "TxDOT Annual Average Daily Traffic Counts (services.arcgis.com)", fetched_at: "2026-10-11T10:04:00Z", part: "traffic" },
      households_3mi: { problem: "Census API key required: add it as the census_api_key setting", attempts: 2, part: "households" },
      memo: { problem: "waits on the score" },
    },
  },
  seen_at: null, gone_at: null, entity: null,
};
const fields = [
  { name: "address", kind: "text" }, { name: "traffic_aadt", kind: "number" },
  { name: "households_3mi", kind: "number" }, { name: "memo", kind: "long_text" },
];

describe("a thing's page shows where each value came from", () => {
  it("puts the source and date beside a value a part filled, and the problem where it could not", () => {
    render(<table><tbody /></table>);
    render(<RecordFields row={row} fields={fields} titleField="address" onCommit={vi.fn()} />);
    expect(screen.getByText(/from TxDOT Annual Average Daily Traffic Counts/)).toBeInTheDocument();
    expect(screen.getByText(/not filled: Census API key required/)).toBeInTheDocument();
    expect(screen.getByText(/Not filled: waits on the score/)).toBeInTheDocument();
  });
  it("carries Columbo's mark beside a value it checked, with the source on hover (Q47)", () => {
    const checked = { at: "2026-10-16T10:00:00Z", by: "a_c", agree: true, source: "census.gov" };
    const differs = { ...checked, agree: false, source: "txdot.gov" };
    const marked: RecordRow = { ...row, values: { ...row.values, households_3mi: 52000 }, provenance: { by: "alpha", fields: {
      traffic_aadt: { ...row.provenance.fields!.traffic_aadt, checked: differs },
      households_3mi: { source: "Census ACS", part: "households", checked },
    } } };
    render(<RecordFields row={marked} fields={fields} titleField="address" onCommit={vi.fn()} />);
    expect(screen.getByLabelText("checked")).toHaveAttribute("title", "Checked by Columbo against census.gov, 16 Oct.");
    expect(screen.getByLabelText("checked: it differs")).toHaveAttribute("title", "Checked by Columbo against txdot.gov, 16 Oct: it differs.");
  });
  it("opens a value's document at the cell it sat in, read again (P5)", async () => {
    const cell = { kind: "document" as const, document: "d_1", title: "P&L.xlsx", sheet: "P&L", cell: "B2", source: "P&L.xlsx · P&L!B2", fetched_at: "2026-10-19T10:00:00Z", checked: { at: "2026-10-19T10:00:00Z", by: "code", agree: true, source: "P&L.xlsx · P&L!B2", value: "48200" } };
    const sourced: RecordRow = { ...row, values: { ...row.values, traffic_aadt: 48200 }, provenance: { by: "alpha", fields: { traffic_aadt: cell } } };
    const placeOf = vi.fn().mockResolvedValue({
      document: "d_1", title: "P&L.xlsx", path: "/x/P&L.xlsx", sheet: "P&L", cell: "B2", columns: ["A", "B"],
      rows: [{ row: 1, cells: [{ cell: "A1", value: "Account", formula: null }, { cell: "B1", value: "Amount", formula: null }] }, { row: 2, cells: [{ cell: "A2", value: "Revenue", formula: null }, { cell: "B2", value: "48200", formula: null }] }],
    });
    render(<RecordFields row={sourced} fields={fields} titleField="address" onCommit={vi.fn()} placeOf={placeOf} />);
    expect(screen.getByLabelText("checked")).toHaveAttribute("title", "Read again from P&L.xlsx · P&L!B2, 19 Oct: it matches.");
    fireEvent.click(screen.getByRole("button", { name: "from P&L.xlsx · P&L!B2" }));
    expect(await screen.findByText("Revenue")).toBeInTheDocument();
    expect(placeOf).toHaveBeenCalledWith(cell);
    expect(screen.getByText("48200", { selector: "td" })).toHaveClass("place__hit");
    expect(screen.getByText("Amount", { selector: "td" })).not.toHaveClass("place__hit");
  });
  it("marks the line of a page the value is on", async () => {
    const page = { kind: "document" as const, document: "d_2", title: "Statement.pdf", page: 2, source: "Statement.pdf · page 2" };
    const sourced: RecordRow = { ...row, values: { ...row.values, traffic_aadt: 3400 }, provenance: { by: "alpha", fields: { traffic_aadt: page } } };
    const placeOf = vi.fn().mockResolvedValue({ document: "d_2", title: "Statement.pdf", path: "/s.pdf", page: 2, text: "Opening balance 1,200.00\nClosing balance 3,400.00" });
    render(<RecordFields row={sourced} fields={fields} titleField="address" onCommit={vi.fn()} placeOf={placeOf} />);
    fireEvent.click(screen.getByRole("button", { name: "from Statement.pdf · page 2" }));
    expect(await screen.findByText("Closing balance 3,400.00")).toHaveClass("place__hit");
    expect(screen.getByText("Opening balance 1,200.00")).not.toHaveClass("place__hit");
  });
});

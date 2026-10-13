import { render, screen } from "@testing-library/react";
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
});

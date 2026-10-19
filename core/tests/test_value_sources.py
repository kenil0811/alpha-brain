"""Every value with its source (P5 of provenance-documents-triggers-proposal.md, Q96; 19 Oct
2026): a value's own source per field, checked by code before it is kept (the document is there,
the page or cell is inside it), compared with what the kept file holds there, kept until the
value changes, and the person's change is theirs."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from conftest import building
from fastapi.testclient import TestClient
from test_documents_positions import ledger, workbook

from alpha.api.server import create_app
from alpha.api.views import needs_you
from alpha.connectors.files import Files, _value_text
from alpha.mcp.tools import Tools
from alpha.runtime.agents import columbo
from alpha.runtime.agents import runner as agent_runner
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.world import World


def statement(world: World) -> str:
    """A two-page PDF Alpha keeps, read page by page."""
    entity = world.entities.resolve("document", "Statement", {"path": "/s.pdf"})["entity"]["id"]
    with world.store.tx() as db:
        db.execute(
            "INSERT INTO documents (id, entity_id, connection, path, title, kind, text, size,"
            " modified_at, indexed_at, structure) VALUES ('d_s', ?, NULL, '/s.pdf', 'Bank"
            " statement Sept 2025.pdf', 'pdf', ?, 10, '2026', '2026', ?)",
            (entity, "[page 1]\nOpening balance 1,200.00\n\n[page 2]\nClosing balance 3,400.00",
             '{"kind": "pdf", "pages": 2}'))
    return "d_s"


def kept(world: World, tmp_path: Path) -> dict[str, Any]:
    return Files(world).take(workbook(tmp_path / "pl.xlsx"), module=None, origin="the person",
                             by="person")


def fields_of(world: World, table: str, account: str) -> dict[str, Any]:
    row = next(r for r in world.collections.query(table, limit=None) if r["account"] == account)
    return dict(row["_provenance"].get("fields") or {})


def test_each_value_keeps_its_own_source_checked_against_its_place(world: World,
                                                                   tmp_path: Path) -> None:
    table, doc, pdf = ledger(world), kept(world, tmp_path), statement(world)
    out = Tools(world, turn="j_1").world_write(table, [
        {"account": "Revenue", "amount": 48200, "month": "Sept",
         "_sources": {"amount": {"document": doc["id"], "sheet": "P&L", "cell": "B2"}}},
        {"account": "Closing balance", "amount": 3400,
         "_sources": {"amount": {"document": pdf, "page": 2}}},
        {"account": "Monthly revenue", "amount": 16066.67,
         "_sources": {"amount": {"formula": "revenue / months",
                                 "inputs": {"revenue": 48200, "months": 3}}}},
    ], source="the September books", sources={"month": "stated"})
    assert out.get("count") == 3 and "differs" not in out, out
    cell = fields_of(world, table, "Revenue")
    assert cell["amount"]["kind"] == "document" and cell["amount"]["cell"] == "B2"
    assert cell["amount"]["source"] == f"{doc['title']} · P&L!B2"
    assert cell["amount"]["checked"]["by"] == "code" and cell["amount"]["checked"]["agree"]
    assert cell["month"] == {**cell["month"], "kind": "stated", "source": "stated"}
    page = fields_of(world, table, "Closing balance")["amount"]
    assert page["source"] == "Bank statement Sept 2025.pdf · page 2" and page["checked"]["agree"]
    worked = fields_of(world, table, "Monthly revenue")["amount"]
    assert worked["kind"] == "formula" and worked["inputs"] == {"revenue": 48200, "months": 3}
    assert worked["source"] == "worked out: revenue / months with revenue = 48200, months = 3"
    # the model sees the same words where it reads the rows
    held = world.store.one("SELECT provenance FROM records"
                           " WHERE json_extract(\"values\", '$.account') = 'Revenue'")
    assert held is not None and f"{doc['title']} · P&L!B2" in str(held["provenance"])


def test_a_source_that_doesnt_hold_is_refused_in_plain_words(world: World,
                                                             tmp_path: Path) -> None:
    table, doc, pdf = ledger(world), kept(world, tmp_path), statement(world)
    tools = Tools(world, turn="j_1")

    def refused(source: Any) -> str:
        out = tools.world_write(table, [{"account": "Revenue", "amount": 1}], source="books",
                                sources={"amount": source})
        assert "error" in out, out
        return str(out["error"])

    assert "has no sheet 'Profit'; its sheets are P&L, Notes" in refused(
        {"document": doc["id"], "sheet": "Profit", "cell": "B2"})
    assert "Z99 is outside" in refused({"document": doc["id"], "sheet": "P&L", "cell": "Z99"})
    assert "has pages 1 to 2; there is no page 5" in refused({"document": pdf, "page": 5})
    assert "has 2 pages; say which page" in refused({"document": pdf})
    assert "keeps no document 'd_none'" in refused({"document": "d_none", "page": 1})
    assert "keeps its inputs as they were" in refused({"formula": "a / b"})
    assert "no field 'profit'" in str(tools.world_write(
        table, [{"account": "X"}], source="books", sources={"profit": "stated"})["error"])
    assert world.collections.query(table, limit=None) == []  # nothing pinned anywhere


def test_a_value_that_differs_from_its_cell_is_marked_and_said(world: World,
                                                               tmp_path: Path) -> None:
    table, doc = ledger(world), kept(world, tmp_path)
    out = Tools(world, turn="j_1").world_write(
        table, [{"account": "Revenue", "amount": 42800}], source="books",
        sources={"amount": {"document": doc["id"], "sheet": "P&L", "cell": "B2"}})
    assert out["differs"] == [f"amount = 42800, but {doc['title']} · P&L!B2 holds '48200'"]
    mark = fields_of(world, table, "Revenue")["amount"]["checked"]
    assert mark["agree"] is False and mark["value"] == "48200"


def test_a_value_keeps_its_source_until_it_changes_and_the_persons_change_is_theirs(
        world: World, tmp_path: Path) -> None:
    table, doc = ledger(world), kept(world, tmp_path)
    tools = Tools(world, turn="j_1")
    tools.world_write(table, [{"account": "Revenue", "amount": 48200, "month": "Sept"}],
                      source="books", sources={"amount": {"document": doc["id"], "cell": "B2",
                                                          "sheet": "P&L"}})
    row = world.collections.query(table, limit=None)[0]
    out = tools.world_change(table, row["id"], row["revision"], {"month": "September"})
    assert "error" not in out, out
    fields = fields_of(world, table, "Revenue")
    assert fields["amount"]["cell"] == "B2" and "month" not in fields
    row = world.collections.query(table, limit=None)[0]
    c = TestClient(create_app(world, live=False))
    c.patch(f"/api/tables/{table}/records/{row['id']}",
            json={"values": {"amount": 48300}, "revision": row["revision"]})
    assert fields_of(world, table, "Revenue")["amount"]["source"] == "you"
    # keyed writes keep the row's source and each value's own
    tools.world_write(table, [{"account": "Revenue", "amount": 48200}], source="books",
                      key="account", sources={"amount": {"document": doc["id"], "cell": "B2",
                                                         "sheet": "P&L"}})
    row = world.collections.query(table, limit=None)[0]
    assert row["_provenance"]["source"] == "books"
    assert row["_provenance"]["fields"]["amount"]["cell"] == "B2"


def test_columbo_leaves_values_code_already_read_from_their_place(world: World,
                                                                  tmp_path: Path) -> None:
    table, doc = ledger(world), kept(world, tmp_path)
    Tools(world, turn="j_1").world_write(
        table, [{"account": "Revenue", "amount": 48200}], source="books",
        sources={"account": {"document": doc["id"], "sheet": "P&L", "cell": "A2"},
                 "amount": {"document": doc["id"], "sheet": "P&L", "cell": "B2"}})
    Tools(world, turn="j_2").world_write(table, [{"account": "Rent", "amount": 900}],
                                         source="estimated")
    Tools(world, turn="j_3").world_file("import", ref=doc["id"], into=table, sheet="P&L")
    assert columbo.worked_out(world, "j_1") == [] and columbo.worked_out(world, "j_3") == []
    assert [r["account"] for r in columbo.worked_out(world, "j_2")] == ["Rent"]


def test_an_agents_sources_wait_with_its_rows_and_the_persons_change_is_theirs(
        world: World, tmp_path: Path) -> None:
    table, doc = ledger(world), kept(world, tmp_path)
    agent = building(world, turn="j_1").agent_create(
        "When run, bring the month's revenue into the ledger", "", "Read the P&L.",
        name="Books", stage=[table])

    def runner(req: TurnRequest) -> RunResult:
        out: Any = Tools(world, turn=req.turn_id, thread=req.thread_id, actor=req.actor,
                         run=req.run).world_write(
            table, [{"account": "Revenue", "amount": 48200, "month": "Sept"}],
            source="the P&L", sources={"amount": {"document": doc["id"], "sheet": "P&L",
                                                  "cell": "B2"}})
        assert out.get("staged"), out
        return RunResult(ok=True, reply="Brought in the revenue; it waits for your yes.")

    agent_runner.run(world, agent["id"], runner=runner)
    [need] = needs_you(world)
    c = TestClient(create_app(world, live=False))
    c.post(f"/api/staged/{need['staged']['id']}/decide",
           json={"accept": True, "edits": {"0": {"month": "September"}}})
    fields = fields_of(world, table, "Revenue")
    assert fields["amount"]["source"] == f"{doc['title']} · P&L!B2"
    assert fields["month"]["source"] == "you"


def test_the_place_a_value_sat_is_shown_read_again(world: World, tmp_path: Path) -> None:
    doc, pdf = kept(world, tmp_path), statement(world)
    c = TestClient(create_app(world, live=False))
    place = c.get(f"/api/documents/{doc['id']}/place",
                  params={"sheet": "P&L", "cell": "B2"}).json()
    assert place["sheet"] == "P&L" and place["columns"] == ["A", "B", "C"]
    assert [r["row"] for r in place["rows"]] == [1, 2, 3, 4, 5]
    assert place["rows"][1]["cells"][1] == {"cell": "B2", "value": "48200", "formula": None}
    assert place["rows"][4]["cells"][1]["formula"] == "=B2-B3"
    page = c.get(f"/api/documents/{pdf}/place", params={"page": 2}).json()
    assert page["text"].strip() == "Closing balance 3,400.00"



def test_code_marks_only_what_it_can_judge(world: World, tmp_path: Path) -> None:
    """A date written one way in the row and another on the page gets no mark rather than a
    false ≠ (19 Oct, Kenil's balance sheet); a number not on its page differs; Excel's float
    noise is rounded away in what is read."""
    table, pdf = ledger(world), statement(world)
    out = Tools(world, turn="j_1").world_write(table, [
        {"account": "Statement", "month": "2025-09-30", "amount": 1200,
         "_sources": {"month": {"document": pdf, "page": 1},
                      "amount": {"document": pdf, "page": 1}}}], source="the statement")
    assert "differs" not in out, out
    fields = fields_of(world, table, "Statement")
    assert "checked" not in fields["month"] and fields["amount"]["checked"]["agree"]
    out = Tools(world, turn="j_2").world_write(table, [
        {"account": "Wrong", "amount": 9999, "_sources": {"amount": {"document": pdf,
                                                                     "page": 1}}}],
        source="the statement")
    assert out["differs"] == ["amount = 9999 isn't on Bank statement Sept 2025.pdf · page 1"]
    assert _value_text(380881.41000000003) == "380881.41" and _value_text(48200.0) == "48200"

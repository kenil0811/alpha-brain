"""The person's word is "project". Inside the code a project is still a module (tables, tools,
ids), but nothing the core says to the person may use that word: an error (`Problem`,
`HTTPException`) or a journal line (Activity shows them verbatim). Alpha bugs #28; Bridge
needed the same gate for its retired names."""

from __future__ import annotations

import ast
import re
from pathlib import Path

import alpha

RETIRED = re.compile(r"\b[Mm]odules?\b(?![:_])")  # `module:<name>` is a scope, not a word


def said(call: ast.Call) -> list[str]:
    """The literal text of an error or journal call: every string, f-strings included."""
    func = call.func
    name = func.id if isinstance(func, ast.Name) else func.attr if isinstance(
        func, ast.Attribute) else ""
    if name in {"Problem", "HTTPException"}:
        args = call.args
    elif name == "append" and isinstance(func, ast.Attribute) and "journal" in ast.unparse(
            func.value):
        args = call.args[1:2]  # (kind, text, ...)
    else:
        return []
    return [n.value for a in args for n in ast.walk(a)
            if isinstance(n, ast.Constant) and isinstance(n.value, str)]


def test_nothing_the_core_says_to_the_person_calls_a_project_a_module() -> None:
    root = Path(alpha.__file__).parent
    found = [f"{path.relative_to(root)}:{node.lineno}: {text!r}"
             for path in root.rglob("*.py")
             for node in ast.walk(ast.parse(path.read_text()))
             if isinstance(node, ast.Call)
             for text in said(node) if RETIRED.search(text)]
    assert found == []


def test_the_gate_sees_errors_and_journal_lines() -> None:
    sample = ast.parse('raise Problem(f"There is no module {name}.")\n'
                       'world.journal.append("did", "Removed the module.")\n'
                       'world.journal.append("did", "Scope module:Food kept.", module=mid)\n'
                       'other.append("module")\n')
    texts = [t for n in ast.walk(sample) if isinstance(n, ast.Call) for t in said(n)]
    assert [t for t in texts if RETIRED.search(t)] == ["There is no module ", "Removed the module."]

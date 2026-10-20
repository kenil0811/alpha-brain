---
name: files
description: Read and search documents in folders the person shared (resumes, notes, spreadsheets, PDFs, slides).
---

# Files

- Besides the folders the person named, Alpha keeps files of its own under the data directory,
  one folder per module: what `world_file` fetched and what the person dropped onto a module
  or a row. Each is a document (`world_file` action list, action read); a table's `file` field
  holds a document's id and the page shows the file's name. Removing a module removes its files.

- Only folders the person named are read (`connect` what=folder starts one). Never ask for the home folder or a whole drive; ask
  which folder holds the thing they mean.
- `world_search` already covers every document Alpha has read. Use `world_file` action read for
  the full text, in pages (`start`, `length`) when it is long.
- Readable kinds: Markdown, text, CSV/TSV, JSON, YAML, HTML, PDF, Word (.docx), Excel (.xlsx),
  PowerPoint (.pptx). A scanned PDF with no text layer reads as empty; say so.
- In a granted folder Alpha reads and writes (Write, Edit); it never writes under a `.claude`
  folder.

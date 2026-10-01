---
name: files
description: Read and search documents in folders the person shared (resumes, notes, spreadsheets, PDFs, slides).
---

# Files

- Only folders the person named are read. Never ask for the home folder or a whole drive; ask
  which folder holds the thing they mean.
- `search` already covers every document Alpha has read. Use `document_read` for the full text,
  in pages (`start`, `length`) when it is long.
- Readable kinds: Markdown, text, CSV/TSV, JSON, YAML, HTML, PDF, Word (.docx), Excel (.xlsx),
  PowerPoint (.pptx). A scanned PDF with no text layer reads as empty; say so.
- Alpha never changes, moves or deletes the person's files.

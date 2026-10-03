# §4.17 Files in and out (built 2 Oct 2026, late evening; Q25)

*Moved verbatim from `build-plan.md` §4.17 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.17" mean this file.*


Kenil: downloads from connections (attachments) and uploads (a module that takes files), "lets
discuss"; the five decisions are Q25. Built:

- **Store and world**: `documents.module`, `documents.origin`; `Files.take(path, module,
  origin, move, by)` keeps a file in `files/<module>` under the data directory, extracts text
  where it can, makes the document and its entity, journals (`did` for Alpha, `changed` for the
  person); `Files.document`, `Files.of_module`; field kind `file` (a document id); a module's
  removal deletes its documents and files (inside Alpha's folder only).
- **The hand**: driver `download` (direct address through `context.request` with the
  session's cookies, or the file a control hands back via Playwright's download event; an HTML
  answer is a wall, not a file) and an `upload` step (`setInputFiles`, only under
  `files_root`); `Browser.download` with the journal line; `Browser.act` passes the resolved
  file paths; `acting._files` resolves payload fields of upload steps to documents Alpha keeps
  and refuses others.
- **Tools and rules**: `page_download(url, module, click, click_text, name)`; rule 8 (fetch
  only when the plan said so or on an ask; a dropped file arrives as a turn), rule 9 (an
  upload is a send); the browser and files skills.
- **API and app**: `GET /api/tables/{name}` carries a `files` map for file fields;
  `POST /api/tables/{name}/export {csv|xlsx}` writes to `exports/` and journals;
  `GET /api/documents/{id}`; `POST /api/files` (multipart: module, or table/record/field)
  keeps the files and starts Alpha's reading turn (actor alpha, journaled as "Read X the person
  added"); `Turns.start` takes an actor. The app: a file cell (name, size, Open, Show in
  Finder, Add file), a drop zone on the module page, Download as CSV / Excel in the table
  menu, file names on action cards; host commands `open_path` and `reveal_path` (inside the
  data folder only); `dragDropEnabled: false` so the webview gets HTML5 drops.
- **Tests**: `core/tests/test_files_in_out.py` (a fetched file lands as a document and on a
  row; a page instead of a file is not a download; dropped files are kept and the row path;
  removal takes the files; an upload step sends only a file Alpha keeps; CSV and Excel export).
  134 core tests; lint and types clean.
- **Journey** `attachment_in` ("fetch the ETA Tracker CSV that Vikas Badami emailed me into
  the Advisory module and tell me how many rows it has"), 2 Oct 21:59, a copy of Kenil's world,
  his Gmail profile: Alpha opened the "Data" email, fetched "ETA Tracker Accounting Vikas
  (email attachment).csv" through the session (2,068 bytes, 50 words), kept it in
  `files/advisory` as a document, and answered "20 data rows … plus a header row" (right),
  39 s in all; it also noticed an older copy of the same file in the watched "alpha docs"
  folder. The suite's first run failed on the journey file (an unquoted colon; bad YAML is now a
  plain error) and the second on the reply check's regex (bold marks between "20" and "rows";
  widened). The mechanism itself passed first time.

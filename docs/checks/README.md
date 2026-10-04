# Desktop check reports

One report per run of `just check-desktop` (`alpha check-desktop`): every page of the window at
the window's own sizes, against a core on a copy of the world, judged for failed requests,
errors, problem notices, empty pages, overflow, clipped or covered text. The `.json` beside each
`.md` is the raw result; the screenshots of a run are in `desktop/.check/<stamp>/` (not in git).
Reports are never rewritten; the log entry that cites one says what was done about it.

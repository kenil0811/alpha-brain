The person added {{names}} to this module. Read what Alpha can read of it and put what belongs in the module's tables:
- a sheet's or a CSV's rows go in with `world_file` action `import`: code types them and each value keeps its own cell as its source; say which row holds the column names (header_row) and which column goes where (columns) when the headers don't match the table's fields;
- a value read from a PDF or another document is written with its own source (`sources`: the document's id with its page, or its sheet and cell), as `world_file` read showed it;
- keep the document's id on a file field where a table has one.

If nothing in it belongs in a table, say what it holds in a line. If the file isn't a kind Alpha reads, say so in one line.

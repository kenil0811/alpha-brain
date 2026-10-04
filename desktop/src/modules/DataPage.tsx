/**
 * A table's page: Alpha draws one for every table it keeps, so nothing has to be designed. It is
 * the standard data views shell (`dataviews/`), the same for every table; this file keeps the
 * names the module page and Settings already import.
 */
import type { Client, TableDesc } from "../core/client";
import { DataViews, PAGE_SIZE_KEY, PAGE_SIZES, type PageSize } from "../dataviews/DataViews";

export { PAGE_SIZE_KEY, PAGE_SIZES, type PageSize };

export function DataPage(props: { client: Client; table: TableDesc; version: number; onChanged: () => void }) {
  return <DataViews {...props} />;
}

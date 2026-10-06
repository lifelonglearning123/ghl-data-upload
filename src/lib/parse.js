import * as XLSX from "xlsx";

const TEXT_EXT = /\.(csv|tsv|txt)$/i;
export const ACCEPTED = ".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods";

export async function readWorkbook(file) {
  if (TEXT_EXT.test(file.name)) {
    // raw: keep every value as text so phone numbers keep leading zeros / "+"
    const text = await file.text();
    return XLSX.read(text, { type: "string", raw: true });
  }
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array", cellDates: true });
}

/** Returns { headers: string[], rows: object[] } keyed by (deduplicated) header. */
export function readSheet(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return { headers: [], rows: [] };

  // Render real date cells as ISO (yyyy-mm-dd) rather than their ambiguous display format
  for (const [addr, cell] of Object.entries(ws)) {
    if (addr[0] !== "!" && cell?.t === "d") {
      cell.z = "yyyy-mm-dd";
      delete cell.w;
    }
  }

  const grid = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    raw: false,
    rawNumbers: true, // avoid "6.14E+10" for long phone numbers stored as numbers
    dateNF: "yyyy-mm-dd",
    blankrows: false,
  });
  if (grid.length === 0) return { headers: [], rows: [] };

  const seen = new Map();
  const width = Math.max(...grid.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => {
    let h = String(grid[0][i] ?? "").trim() || `Column ${i + 1}`;
    const n = seen.get(h) ?? 0;
    seen.set(h, n + 1);
    return n ? `${h} (${n + 1})` : h;
  });

  const rows = [];
  for (const line of grid.slice(1)) {
    const obj = {};
    let hasValue = false;
    headers.forEach((h, i) => {
      const v = line[i] ?? "";
      const s = typeof v === "number" ? String(v) : String(v).trim();
      obj[h] = s;
      if (s) hasValue = true;
    });
    if (hasValue) rows.push(obj);
  }
  return { headers, rows };
}

import { useRef, useState } from "react";
import { ACCEPTED, readSheet, readWorkbook } from "../lib/parse.js";
import PreviewTable from "../components/PreviewTable.jsx";

export default function UploadStep({ sheet, onLoaded }) {
  const inputRef = useRef(null);
  const [workbook, setWorkbook] = useState(null);
  const [fileName, setFileName] = useState(sheet?.fileName ?? "");
  const [sheetName, setSheetName] = useState(sheet?.sheetName ?? "");
  const [data, setData] = useState(sheet ? { headers: sheet.headers, rows: sheet.rows } : null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async (file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setData(null);
    try {
      const wb = await readWorkbook(file);
      const first = wb.SheetNames[0];
      setWorkbook(wb);
      setFileName(file.name);
      setSheetName(first);
      const parsed = readSheet(wb, first);
      setData(parsed);
      if (!parsed.rows.length) setError("This sheet has no data rows.");
    } catch (err) {
      console.error(err);
      setError("Couldn't read this file. Make sure it's a CSV or Excel file.");
    } finally {
      setBusy(false);
    }
  };

  const pickSheet = (name) => {
    setSheetName(name);
    const parsed = readSheet(workbook, name);
    setData(parsed);
    setError(parsed.rows.length ? "" : "This sheet has no data rows.");
  };

  return (
    <div>
      <h1>Upload your contacts</h1>
      <p className="muted">CSV, TSV or Excel files. The first row should contain column headers.</p>

      <div
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          load(e.dataTransfer.files?.[0]);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      >
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M17 8l-5-5-5 5M12 3v12" />
        </svg>
        {busy ? (
          <b>Reading file…</b>
        ) : fileName ? (
          <>
            <b>{fileName}</b>
            <span className="muted">Click or drop to choose a different file</span>
          </>
        ) : (
          <>
            <b>Drop a file here or click to browse</b>
            <span className="muted">.csv, .xlsx, .xls</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          hidden
          onChange={(e) => {
            load(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {workbook && workbook.SheetNames.length > 1 && (
        <label className="field inline">
          <span>Sheet</span>
          <select value={sheetName} onChange={(e) => pickSheet(e.target.value)}>
            {workbook.SheetNames.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      )}

      {error && <div className="alert error">{error}</div>}

      {data && data.rows.length > 0 && (
        <>
          <p className="stat-line">
            <b>{data.rows.length.toLocaleString()}</b> rows · <b>{data.headers.length}</b> columns
          </p>
          <PreviewTable headers={data.headers} rows={data.rows.slice(0, 5)} />
        </>
      )}

      <div className="actions">
        <span />
        <button
          className="primary"
          disabled={!data?.rows.length}
          onClick={() => onLoaded({ fileName, sheetName, ...data })}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

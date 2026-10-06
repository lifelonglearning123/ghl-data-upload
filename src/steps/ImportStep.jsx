import { useEffect, useRef, useState } from "react";
import { importBatch } from "../lib/api.js";
import { buildContact } from "../lib/transform.js";

const BATCH_SIZE = 10;
// GHL allows ~100 requests / 10s per location; stay comfortably below it.
const MAX_REQUESTS_PER_SEC = 8;
const BATCH_RETRIES = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function ImportStep({ locationRef, sheet, mapping, customFieldsById, options, onRunningChange, onStartOver }) {
  const [counts, setCounts] = useState({ created: 0, updated: 0, failed: 0 });
  const [errors, setErrors] = useState({}); // reason -> count
  const [processed, setProcessed] = useState(0);
  const [status, setStatus] = useState("running"); // running | done | cancelled | aborted
  const [fatal, setFatal] = useState("");
  const cancelRef = useRef(false);
  const startedRef = useRef(false);
  const total = sheet.rows.length;

  useEffect(() => {
    if (startedRef.current) return; // StrictMode double-invoke guard
    startedRef.current = true;

    const tally = (results) => {
      const add = { created: 0, updated: 0, failed: 0 };
      const errs = {};
      for (const r of results) {
        add[r.status]++;
        if (r.error) errs[r.error] = (errs[r.error] ?? 0) + 1;
      }
      setCounts((c) => ({ created: c.created + add.created, updated: c.updated + add.updated, failed: c.failed + add.failed }));
      setErrors((e) => {
        const next = { ...e };
        for (const [k, v] of Object.entries(errs)) next[k] = (next[k] ?? 0) + v;
        return next;
      });
      setProcessed((p) => p + results.length);
    };

    const run = async () => {
      const valid = [];
      const skipped = [];
      sheet.rows.forEach((row, i) => {
        const { data, error } = buildContact(row, mapping, customFieldsById, options.country);
        if (error) skipped.push({ row: i + 2, status: "failed", error });
        else valid.push({ row: i + 2, data });
      });
      if (skipped.length) tally(skipped);

      for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        if (cancelRef.current) return setStatus("cancelled");
        const batch = valid.slice(i, i + BATCH_SIZE);
        const started = performance.now();
        let calls = batch.length;

        for (let attempt = 0; ; attempt++) {
          try {
            const res = await importBatch(locationRef, batch, options.tags);
            calls = res.calls;
            tally(res.results);
            break;
          } catch (err) {
            if (err.status === 401) {
              setFatal("Your session expired. Sign in again and re-run the import; contacts already sent are saved.");
              return setStatus("aborted");
            }
            if (err.status === 404 || err.status === 422) {
              setFatal(err.message);
              return setStatus("aborted");
            }
            if (attempt < BATCH_RETRIES) {
              await sleep(2000 * (attempt + 1));
              continue;
            }
            tally(batch.map((c) => ({ row: c.row, status: "failed", error: err.message })));
            break;
          }
        }

        const minMs = (calls / MAX_REQUESTS_PER_SEC) * 1000;
        const elapsed = performance.now() - started;
        if (elapsed < minMs) await sleep(minMs - elapsed);
      }
      setStatus("done");
    };

    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onRunningChange?.(status === "running");
    return () => onRunningChange?.(false);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status !== "running") return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  const pct = total ? Math.round((processed / total) * 100) : 0;
  const topErrors = Object.entries(errors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const heading = {
    running: "Importing contacts…",
    done: "Import complete",
    cancelled: "Import stopped",
    aborted: "Import stopped",
  }[status];

  return (
    <div>
      <h1>{heading}</h1>
      {status === "running" && <p className="muted">Keep this tab open until the import finishes.</p>}
      {status === "cancelled" && (
        <p className="muted">
          Stopped after {processed.toLocaleString()} of {total.toLocaleString()} rows. Contacts already sent were saved.
        </p>
      )}
      {fatal && <div className="alert error">{fatal}</div>}

      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`bar ${status !== "running" ? "still" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-label">
        {processed.toLocaleString()} / {total.toLocaleString()} rows · {pct}%
      </p>

      <div className="stats">
        <div className="stat good">
          <span className="value">{counts.created.toLocaleString()}</span>
          <span className="label">Created</span>
        </div>
        <div className="stat info">
          <span className="value">{counts.updated.toLocaleString()}</span>
          <span className="label">Updated</span>
        </div>
        <div className="stat bad">
          <span className="value">{counts.failed.toLocaleString()}</span>
          <span className="label">Failed</span>
        </div>
      </div>

      {topErrors.length > 0 && status !== "running" && (
        <div className="error-reasons">
          <h3>Why rows failed</h3>
          <ul>
            {topErrors.map(([msg, n]) => (
              <li key={msg}>
                <span>{msg}</span>
                <b>{n.toLocaleString()}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="actions">
        <span />
        {status === "running" ? (
          <button className="ghost" onClick={() => (cancelRef.current = true)}>
            Stop import
          </button>
        ) : (
          <button className="primary" onClick={onStartOver}>
            Import another file
          </button>
        )}
      </div>
    </div>
  );
}

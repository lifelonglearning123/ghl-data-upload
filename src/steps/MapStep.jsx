import { STANDARD_FIELDS } from "../lib/fields.js";

export default function MapStep({ sheet, mapping, setMapping, customFields, onBack, onNext }) {
  const assign = (column, target) => {
    setMapping((prev) => {
      const next = { ...prev };
      // A GHL field can only be fed by one column
      if (target) for (const c of Object.keys(next)) if (next[c] === target) next[c] = "";
      next[column] = target;
      return next;
    });
  };

  const targets = Object.values(mapping);
  const hasIdentifier = targets.includes("std:email") || targets.includes("std:phone");
  const mappedCount = targets.filter(Boolean).length;

  const samples = (col) =>
    sheet.rows
      .map((r) => r[col])
      .filter(Boolean)
      .slice(0, 2)
      .join(" · ");

  return (
    <div>
      <h1>Map your columns</h1>
      <p className="muted">
        We matched what we could. Check each column and choose the contact field it should go into.
      </p>

      <div className="map-list">
        <div className="map-head">
          <span>Column in your file</span>
          <span>Contact field</span>
        </div>
        {sheet.headers.map((col) => (
          <div className={`map-row ${mapping[col] ? "" : "skipped"}`} key={col}>
            <div className="map-col">
              <b>{col}</b>
              <span className="sample">{samples(col) || "(empty)"}</span>
            </div>
            <select value={mapping[col] ?? ""} onChange={(e) => assign(col, e.target.value)}>
              <option value="">— Don't import —</option>
              <optgroup label="Standard fields">
                {STANDARD_FIELDS.map((f) => (
                  <option key={f.key} value={`std:${f.key}`}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
              {customFields.length > 0 && (
                <optgroup label="Custom fields">
                  {customFields.map((f) => (
                    <option key={f.id} value={`cf:${f.id}`}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        ))}
      </div>

      {!hasIdentifier && (
        <div className="alert warn">Map at least one column to Email or Phone so contacts can be matched and imported.</div>
      )}

      <div className="actions">
        <button className="ghost" onClick={onBack}>
          Back
        </button>
        <button className="primary" disabled={!hasIdentifier} onClick={onNext}>
          Continue with {mappedCount} field{mappedCount === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

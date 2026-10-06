import { useMemo } from "react";
import TagPicker from "../components/TagPicker.jsx";
import { COUNTRIES, buildContact } from "../lib/transform.js";

export default function OptionsStep({
  sheet,
  mapping,
  customFieldsById,
  existingTags,
  locationName,
  options,
  setOptions,
  onBack,
  onNext,
}) {
  const phoneMapped = Object.values(mapping).includes("std:phone");

  const invalid = useMemo(
    () => sheet.rows.filter((r) => buildContact(r, mapping, customFieldsById, options.country).error).length,
    [sheet, mapping, customFieldsById, options.country],
  );
  const ready = sheet.rows.length - invalid;

  return (
    <div>
      <h1>Tags & options</h1>

      <label className="field">
        <span>Tags to add to every contact</span>
        <TagPicker
          existing={existingTags}
          selected={options.tags}
          onChange={(tags) => setOptions((o) => ({ ...o, tags }))}
        />
        <small className="muted">
          Tags are added to the contact's existing tags, never replacing them. New tags are created automatically.
        </small>
      </label>

      {phoneMapped && (
        <label className="field">
          <span>Default country for phone numbers</span>
          <select value={options.country} onChange={(e) => setOptions((o) => ({ ...o, country: e.target.value }))}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <small className="muted">Used for numbers without a country code, e.g. 0412 345 678.</small>
        </label>
      )}

      <div className="summary-box">
        <div>
          <b>{ready.toLocaleString()}</b> contacts ready to import from <i>{sheet.fileName}</i> into{" "}
          <b>{locationName}</b>
        </div>
        {invalid > 0 && (
          <div className="warn-text">
            {invalid.toLocaleString()} row{invalid === 1 ? "" : "s"} will be skipped (no email or phone).
          </div>
        )}
        <div className="muted small">Existing contacts with the same email or phone will be updated, not duplicated.</div>
      </div>

      <div className="actions">
        <button className="ghost" onClick={onBack}>
          Back
        </button>
        <button className="primary" disabled={ready === 0} onClick={onNext}>
          Import {ready.toLocaleString()} contacts
        </button>
      </div>
    </div>
  );
}

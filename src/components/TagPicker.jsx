import { useMemo, useState } from "react";

export default function TagPicker({ existing, selected, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const existingLower = useMemo(() => new Set(existing.map((t) => t.toLowerCase())), [existing]);
  const selectedLower = new Set(selected.map((t) => t.toLowerCase()));
  const q = query.trim().toLowerCase();

  const suggestions = existing
    .filter((t) => !selectedLower.has(t.toLowerCase()) && (!q || t.toLowerCase().includes(q)))
    .slice(0, 50);
  const canCreate = q && !existingLower.has(q) && !selectedLower.has(q);

  const add = (tag) => {
    const t = tag.trim();
    if (!t || selectedLower.has(t.toLowerCase())) return;
    onChange([...selected, t]);
    setQuery("");
  };
  const remove = (tag) => onChange(selected.filter((t) => t !== tag));

  return (
    <div className="tag-picker">
      <div className="tag-box" onClick={() => setOpen(true)}>
        {selected.map((t) => (
          <span key={t} className={`chip ${existingLower.has(t.toLowerCase()) ? "" : "new"}`}>
            {t}
            {!existingLower.has(t.toLowerCase()) && <em>new</em>}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => remove(t)}>
              ×
            </button>
          </span>
        ))}
        <input
          value={query}
          placeholder={selected.length ? "Add another tag…" : "Search existing tags or type a new one…"}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              const exact = existing.find((t) => t.toLowerCase() === q);
              add(exact ?? query);
            } else if (e.key === "Backspace" && !query && selected.length) {
              remove(selected[selected.length - 1]);
            }
          }}
        />
      </div>
      {open && (suggestions.length > 0 || canCreate) && (
        <ul className="suggestions" role="listbox">
          {canCreate && (
            <li onMouseDown={(e) => (e.preventDefault(), add(query))}>
              Create tag <b>“{query.trim()}”</b>
            </li>
          )}
          {suggestions.map((t) => (
            <li key={t} onMouseDown={(e) => (e.preventDefault(), add(t))}>
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

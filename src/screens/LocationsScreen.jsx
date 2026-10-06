import { useState } from "react";
import { deleteLocation, saveLocation } from "../lib/api.js";

export default function LocationsScreen({ me, prefill, onChange, onUse, onClose }) {
  const hasLocations = me.locations.length > 0;
  const [name, setName] = useState(prefill?.name ?? "");
  const [locationId, setLocationId] = useState(prefill?.locationId ?? "");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await saveLocation({ name, locationId, token });
      onChange(res);
      onUse(res.savedId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (loc) => {
    if (!window.confirm(`Remove "${loc.name}"? Its saved token will be deleted.`)) return;
    try {
      onChange(await deleteLocation(loc.id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      {hasLocations && (
        <>
          <div className="row-between">
            <h1>Your locations</h1>
            <button className="ghost" onClick={onClose}>
              Done
            </button>
          </div>
          <ul className="loc-list">
            {me.locations.map((loc) => (
              <li key={loc.id}>
                <div className="map-col">
                  <b>{loc.name}</b>
                  <span className="sample">{loc.locationId}</span>
                </div>
                <div className="loc-actions">
                  <button className="ghost" onClick={() => onUse(loc.id)}>
                    Use
                  </button>
                  <button className="ghost danger" onClick={() => remove(loc)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <form onSubmit={submit} className={hasLocations ? "add-form" : ""}>
        <h1 className={hasLocations ? "h2" : ""}>{hasLocations ? "Add or update a location" : "Connect your sub-account"}</h1>
        <p className="muted">
          {hasLocations
            ? "Adding a Location ID that's already saved replaces its token."
            : "You only need to do this once. Your token is encrypted and saved to your account."}
        </p>

        <label className="field">
          <span>
            Name <span className="muted normal">(optional)</span>
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Dental" maxLength={100} />
        </label>

        <label className="field">
          <span>Location ID</span>
          <input
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            placeholder="e.g. ve9EPM428h8vShlRW1KT"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>

        <label className="field">
          <span>Private Integration token</span>
          <div className="input-with-btn">
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
              spellCheck={false}
              required
            />
            <button type="button" className="ghost" onClick={() => setShowToken((s) => !s)}>
              {showToken ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        {error && <div className="alert error">{error}</div>}

        <details className="help">
          <summary>Where do I find these?</summary>
          <ol>
            <li>
              <b>Location ID:</b> in your sub-account, go to <i>Settings → Business Profile</i>. It's also the ID in the URL
              after <code>/location/</code>.
            </li>
            <li>
              <b>Token:</b> go to <i>Settings → Private Integrations → Create new integration</i> and enable these scopes:
              <ul>
                <li>View Contacts, Edit Contacts</li>
                <li>View Tags</li>
                <li>View Custom Fields</li>
              </ul>
            </li>
          </ol>
        </details>

        <div className="actions">
          <span />
          <button className="primary" disabled={busy || !locationId.trim() || !token.trim()}>
            {busy ? "Checking…" : "Save & continue"}
          </button>
        </div>
      </form>
    </div>
  );
}

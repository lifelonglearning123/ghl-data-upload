import { useEffect, useMemo, useState } from "react";
import AuthScreen from "./screens/AuthScreen.jsx";
import LocationsScreen from "./screens/LocationsScreen.jsx";
import UploadStep from "./steps/UploadStep.jsx";
import MapStep from "./steps/MapStep.jsx";
import OptionsStep from "./steps/OptionsStep.jsx";
import ImportStep from "./steps/ImportStep.jsx";
import { connect, getMe, logout } from "./lib/api.js";
import { guessMapping } from "./lib/fields.js";
import { defaultCountry } from "./lib/transform.js";

const STEPS = ["Upload", "Map fields", "Tags & options", "Import"];

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
  const [bootError, setBootError] = useState("");
  const [view, setView] = useState("upload"); // upload | locations
  const [prefill, setPrefill] = useState(null);
  const [activeRef, setActiveRef] = useState(null);
  const [account, setAccount] = useState(null); // { tags, customFields }
  const [accountError, setAccountError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [step, setStep] = useState(0);
  const [importing, setImporting] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [mapping, setMapping] = useState({});
  const [options, setOptions] = useState({ tags: [], country: defaultCountry() });

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch((err) => (err.status === 401 ? setMe(null) : setBootError(err.message)));
  }, []);

  // Keep the active location valid; default to the most recently used one.
  useEffect(() => {
    if (!me) return;
    if (!me.locations.some((l) => l.id === activeRef)) setActiveRef(me.locations[0]?.id ?? null);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load tags + custom fields for the active location.
  useEffect(() => {
    setAccount(null);
    setAccountError("");
    if (!activeRef) return;
    let stale = false;
    connect(activeRef)
      .then((acc) => !stale && setAccount(acc))
      .catch((err) => {
        if (stale) return;
        if (err.status === 401) setMe(null);
        else setAccountError(err.message);
      });
    return () => {
      stale = true;
    };
  }, [activeRef, reloadKey]);

  const customFieldsById = useMemo(
    () => Object.fromEntries((account?.customFields ?? []).map((f) => [f.id, f])),
    [account],
  );
  const activeLoc = me?.locations.find((l) => l.id === activeRef);

  const switchLocation = (ref) => {
    setActiveRef(ref);
    setStep(0); // custom fields differ per location, so re-map from the upload step
    setOptions((o) => ({ ...o, tags: [] }));
    setView("upload");
    if (ref === activeRef) setReloadKey((k) => k + 1);
  };

  const signOut = async () => {
    await logout().catch(() => {});
    setMe(null);
    setActiveRef(null);
    setSheet(null);
    setStep(0);
  };

  const startOver = () => {
    setSheet(null);
    setMapping({});
    setOptions((o) => ({ ...o, tags: [] }));
    setStep(0);
  };

  if (me === undefined) {
    return <div className="center muted">{bootError || "Loading…"}</div>;
  }
  if (me === null) {
    return (
      <AuthScreen
        onAuthed={(m) => {
          setMe(m);
          setView("upload");
        }}
      />
    );
  }

  const showLocations = view === "locations" || me.locations.length === 0;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6M22 11h-6" />
            </svg>
          </span>
          Contact Importer
        </div>
        <div className="account-bar">
          {me.locations.length > 0 && !showLocations && (
            <>
              <select
                className="loc-select"
                value={activeRef ?? ""}
                disabled={importing}
                onChange={(e) => switchLocation(e.target.value)}
                aria-label="Location"
              >
                {me.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button
                className="link"
                disabled={importing}
                onClick={() => {
                  setPrefill(null);
                  setView("locations");
                }}
              >
                Manage
              </button>
              <span className="sep" />
            </>
          )}
          <span className="muted email">{me.email}</span>
          <button className="link" disabled={importing} onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {showLocations ? (
        <main className="card">
          <LocationsScreen
            key={prefill?.locationId ?? "new"}
            me={me}
            prefill={prefill}
            onChange={setMe}
            onUse={switchLocation}
            onClose={() => setView("upload")}
          />
        </main>
      ) : (
        <>
          <ol className="stepper" aria-label="Progress">
            {STEPS.map((label, i) => (
              <li key={label} className={i === step ? "current" : i < step ? "done" : ""}>
                <span className="num">{i < step ? "✓" : i + 1}</span>
                <span className="label">{label}</span>
              </li>
            ))}
          </ol>

          <main className="card">
            {accountError ? (
              <div>
                <h1>Couldn't connect to {activeLoc?.name}</h1>
                <div className="alert error">{accountError}</div>
                <div className="actions">
                  <button className="ghost" onClick={() => setReloadKey((k) => k + 1)}>
                    Try again
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      setPrefill({ name: activeLoc?.name, locationId: activeLoc?.locationId });
                      setView("locations");
                    }}
                  >
                    Update token
                  </button>
                </div>
              </div>
            ) : !account ? (
              <div className="center muted">Connecting to {activeLoc?.name}…</div>
            ) : (
              <>
                {step === 0 && (
                  <UploadStep
                    sheet={sheet}
                    onLoaded={(s) => {
                      setSheet(s);
                      setMapping(guessMapping(s.headers, account.customFields));
                      setStep(1);
                    }}
                  />
                )}
                {step === 1 && (
                  <MapStep
                    sheet={sheet}
                    mapping={mapping}
                    setMapping={setMapping}
                    customFields={account.customFields}
                    onBack={() => setStep(0)}
                    onNext={() => setStep(2)}
                  />
                )}
                {step === 2 && (
                  <OptionsStep
                    sheet={sheet}
                    mapping={mapping}
                    customFieldsById={customFieldsById}
                    existingTags={account.tags}
                    locationName={activeLoc?.name}
                    options={options}
                    setOptions={setOptions}
                    onBack={() => setStep(1)}
                    onNext={() => setStep(3)}
                  />
                )}
                {step === 3 && (
                  <ImportStep
                    locationRef={activeRef}
                    sheet={sheet}
                    mapping={mapping}
                    customFieldsById={customFieldsById}
                    options={options}
                    onRunningChange={setImporting}
                    onStartOver={startOver}
                  />
                )}
              </>
            )}
          </main>
        </>
      )}

      <footer className="foot">Saved tokens are encrypted and never sent back to your browser.</footer>
    </div>
  );
}

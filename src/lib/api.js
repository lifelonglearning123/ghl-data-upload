export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, { body, locationRef } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (locationRef) headers["X-Location-Ref"] = locationRef;

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON body (e.g. a platform timeout page)
  }
  if (!res.ok) {
    let msg = data?.detail ?? `Request failed (HTTP ${res.status})`;
    if (Array.isArray(msg)) msg = msg.map((d) => d.msg ?? String(d)).join("; ");
    throw new ApiError(String(msg), res.status);
  }
  return data;
}

export const getMe = () => request("GET", "/api/auth/me");
export const signup = (email, password) => request("POST", "/api/auth/signup", { body: { email, password } });
export const login = (email, password) => request("POST", "/api/auth/login", { body: { email, password } });
export const logout = () => request("POST", "/api/auth/logout");

export const saveLocation = (loc) => request("POST", "/api/locations", { body: loc });
export const deleteLocation = (ref) => request("DELETE", `/api/locations/${encodeURIComponent(ref)}`);

export const connect = (locationRef) => request("POST", "/api/connect", { locationRef });
export const importBatch = (locationRef, contacts, tags) =>
  request("POST", "/api/import", { locationRef, body: { contacts, tags } });

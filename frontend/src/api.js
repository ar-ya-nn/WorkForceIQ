import { useEffect, useState } from "react";

// Locally this is "/api" (forwarded to FastAPI by vite.config.js).
// Online, set VITE_API_URL to the backend address, e.g. https://workforceiq-api.onrender.com
const BASE = import.meta.env.VITE_API_URL || "/api";

function toQuery(params) {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") q.append(key, value);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ---------- login token ----------
// The JWT from /auth/login is kept in localStorage and sent with every request.
const TOKEN_KEY = "wfiq_token";
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request(path, options = {}) {
  const token = tokenStore.get();
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    // token expired or user deactivated: send them back to the login screen
    tokenStore.clear();
    window.dispatchEvent(new Event("wfiq:logout"));
  }
  if (!res.ok) {
    const detail = body?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg).join(", ")
          : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export const api = {
  get: (path, params) => request(path + toQuery(params)),
  post: (path, data) => request(path, { method: "POST", body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: "PATCH", body: JSON.stringify(data) }),
  put: (path, data) => request(path, { method: "PUT", body: JSON.stringify(data) }),
  del: (path) => request(path, { method: "DELETE" }),
};

/** Loads data from the API and re-loads whenever the path or params change. */
export function useApi(path, params) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const key = path ? path + JSON.stringify(params ?? {}) : null;

  useEffect(() => {
    if (!key) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .get(path, params)
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e) => alive && setState({ data: null, loading: false, error: e.message }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadKey]);

  return { ...state, reload: () => setReloadKey((k) => k + 1) };
}

export const ROLE_NAMES = { 1: "Admin", 2: "Manager", 3: "Employee" };

export const fmt = {
  num: (v, d = 0) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d })),
  pct: (v) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(1)}%`),
  money: (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })),
  date: (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"),
  time: (v) => (v ? new Date(v).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"),
  datetime: (v) => (v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"),
};

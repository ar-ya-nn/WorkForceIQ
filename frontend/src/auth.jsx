import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokenStore } from "./api.js";
import { PAGE_KEY } from "./nav.js";

const AuthContext = createContext(null);

export const ROLE_LABEL = { ADMIN: "Admin", MANAGER: "Manager", EMPLOYEE: "Employee", VIEWER: "Viewer" };

/** Keeps track of who is logged in. The real permission checks happen in the API. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(tokenStore.get()));

  // on page load, if a token is saved, ask the API who it belongs to
  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get("/auth/me")
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setChecking(false));
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    sessionStorage.removeItem(PAGE_KEY);   // next person to sign in starts on their own home page
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener("wfiq:logout", logout);
    return () => window.removeEventListener("wfiq:logout", logout);
  }, [logout]);

  const finish = (result) => {
    tokenStore.set(result.access_token);
    setUser(result.user);
    return result.user;
  };
  const login = async (email, password) => finish(await api.post("/auth/login", { email, password }));
  // Google single sign-on: the backend verifies Google's ID token, then signs in the matching account
  const loginWithGoogle = async (credential, nonce) => finish(await api.post("/auth/google", { credential, nonce }));

  return (
    <AuthContext.Provider value={{ user, checking, login, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function hasRole(user, roles) {
  return Boolean(user) && roles.includes(user.role);
}

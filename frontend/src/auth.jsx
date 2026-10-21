import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokenStore } from "./api.js";

const AuthContext = createContext(null);

export const ROLE_LABEL = { ADMIN: "Admin", MANAGER: "Manager", EMPLOYEE: "Employee" };

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
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener("wfiq:logout", logout);
    return () => window.removeEventListener("wfiq:logout", logout);
  }, [logout]);

  const login = async (email, password) => {
    const result = await api.post("/auth/login", { email, password });
    tokenStore.set(result.access_token);
    setUser(result.user);
    return result.user;
  };

  return (
    <AuthContext.Provider value={{ user, checking, login, logout }}>
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

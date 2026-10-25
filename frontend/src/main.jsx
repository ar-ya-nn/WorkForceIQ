import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./auth.jsx";
import { PAGE_KEY } from "./nav.js";
import "./index.css";

// Pages are handled inside the app (MemoryRouter), so the address bar only ever shows the
// site itself, never /leave, /audit and so on. The current page is remembered for this tab
// in sessionStorage, so a refresh brings you back to the same page.
const startPage = sessionStorage.getItem(PAGE_KEY) || "/";
if (window.location.pathname !== "/" || window.location.search || window.location.hash) {
  window.history.replaceState(null, "", "/");
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MemoryRouter initialEntries={[startPage]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  </StrictMode>
);

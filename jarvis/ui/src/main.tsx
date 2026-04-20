import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { IdentityProvider } from "./contexts/IdentityContext";
import "./styles/globals.css";

const root = createRoot(document.getElementById("root")!);
root.render(
  <IdentityProvider>
    <App />
  </IdentityProvider>
);

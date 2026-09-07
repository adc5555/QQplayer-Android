import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { installNativeBridge } from "./nativeBridge.js";
import "./styles.css";

installNativeBridge();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

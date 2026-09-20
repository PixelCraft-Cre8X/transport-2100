import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./App.css";
import App from "./App.jsx";

document.title = "MoveOne";
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}
const favicon = document.querySelector('link[rel="icon"]') || document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/png";
favicon.href = new URL("./assets/logo.png", import.meta.url).href;
document.head.appendChild(favicon);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

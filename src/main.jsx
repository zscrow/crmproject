import React from "react";
import { createRoot } from "react-dom/client";
import Auth from "./Auth.jsx";
import "./styles/style.css";
import "./styles/clean.css";
import "./styles/operations.css";
import "./styles/refinement.css";
import "./styles/react.css";
const root = createRoot(document.getElementById("root"));
if (import.meta.env.DEV && window.location.pathname === "/demo") {
  import("./Demo.jsx").then(({ default: Demo }) => root.render(<Demo />));
} else {
  root.render(<Auth />);
}

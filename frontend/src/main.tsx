import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./i18n";
import { App } from "./router";
import { installDragTrace } from "./lib/drag-trace";
import { installNativeDragOut } from "./lib/drag-out";
import { installDragHistoryTracker } from "./lib/drag-history";
import { installDiagnosticsMonitor } from "./lib/logger";

// Native drag-out / drop tracing must be attached before any drag can start.
installDragTrace();
// Windows drags are started by the Go side (CF_HDROP); see lib/drag-out.ts.
installNativeDragOut();
installDragHistoryTracker();
installDiagnosticsMonitor();
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

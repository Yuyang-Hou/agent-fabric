import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "@fontsource-variable/space-grotesk/wght.css";

import { AccountProductApp, createAccountProductBridge } from "./account-product/app.js";
import { createAccountProductFixtureBridge } from "./account-product/fixture.js";
import type { ElectronAccountProductApi } from "./account-product/ipc.js";
import { AgentFabricUpdateNotification } from "./updater/notification.js";
import "./tokens.css";
import "./renderer.css";

declare global { interface Window { agentFabricAccount: ElectronAccountProductApi } }

const mount = document.querySelector("#root");
if (!mount) throw new Error("missing-root");
const fixture = new URLSearchParams(window.location.search).get("fixture");
const bridge = fixture ? createAccountProductFixtureBridge(fixture) : createAccountProductBridge(window.agentFabricAccount);
createRoot(mount).render(<StrictMode><AccountProductApp bridge={bridge} /><AgentFabricUpdateNotification /></StrictMode>);

import { contextBridge } from "electron";
import type { DesktopInfo } from "@agent-desktop/shared";
import { productName, version } from "../../package.json";

const desktop: DesktopInfo = { name: productName, version };

contextBridge.exposeInMainWorld("desktop", desktop);

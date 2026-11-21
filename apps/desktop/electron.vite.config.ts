import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const host = "127.0.0.1";
const port = 5173;
const baseCsp = "default-src 'none'; img-src 'self' data:; base-uri 'none'; form-action 'none'";

export default defineConfig(({ command }) => {
  const csp =
    command === "serve"
      ? `${baseCsp}; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://${host}:${port}`
      : `${baseCsp}; script-src 'self'; style-src 'self'`;

  return {
    main: {},
    preload: {},
    renderer: {
      resolve: { alias: { "@": fileURLToPath(new URL("./src/renderer/src", import.meta.url)) } },
      build: { minify: true },
      server: { host, port, strictPort: true, headers: { "Content-Security-Policy": csp } },
      plugins: [
        {
          name: "desktop-content-security-policy",
          transformIndexHtml: {
            order: "pre",
            handler: (html) => html.replace("__DESKTOP_CSP__", csp),
          },
        },
        react(),
        tailwindcss(),
      ],
    },
  };
});

import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { codeLanguages } from "./src/renderer/src/workflow/code-languages";

const host = "127.0.0.1";
const port = 5173;
const baseCsp =
  "default-src 'none'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'";
// Tiptap 3.35.0 injects this fixed ProseMirror stylesheet through Once UI's editor.
const editorStyleHash = "'sha256-PlumsSlvJ7vvWzjqibGAYKq92O3y/4JTxWWsWJvyUYA='";
const prismGrammars = [...new Set(codeLanguages.values())].map(
  (language) => [language, `prismjs/components/prism-${language}`] as const,
);

export default defineConfig(({ command }) => {
  const csp =
    command === "serve"
      ? `${baseCsp}; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://${host}:${port}`
      : `${baseCsp}; script-src 'self'; style-src 'self' ${editorStyleHash}`;

  return {
    main: { build: { externalizeDeps: { exclude: ["@agent-desktop/shared"] } } },
    preload: { build: { externalizeDeps: { exclude: ["@agent-desktop/shared"] } } },
    renderer: {
      resolve: {
        alias: { "@": fileURLToPath(new URL("./src/renderer/src", import.meta.url)) },
        // The shared UI package and the rich-text editor must share the renderer's contexts.
        dedupe: ["@once-ui-system/core", "react", "react-dom"],
      },
      optimizeDeps: {
        // Keep Core's context singletons shared across component and effects imports in dev.
        exclude: ["@once-ui-system/core", "@once-ui-system/fx"],
        include: [
          "prismjs",
          "prismjs/components/prism-diff",
          "prismjs/plugins/line-highlight/prism-line-highlight",
          "prismjs/plugins/line-numbers/prism-line-numbers",
          "prismjs/plugins/diff-highlight/prism-diff-highlight",
          ...prismGrammars.map(([, specifier]) => specifier),
        ],
      },
      build: { minify: true },
      server: { host, port, strictPort: true, headers: { "Content-Security-Policy": csp } },
      plugins: [
        {
          name: "once-ui-prism-grammars",
          enforce: "pre",
          transform(source, id) {
            if (!id.endsWith("/@once-ui-system/core/dist/modules/code/CodeBlock.impl.js")) return;
            // Vite cannot bundle Once UI's variable bare import. Give it static module paths.
            const loaders = prismGrammars.map(
              ([language, specifier]) => `${language}: () => import(${JSON.stringify(specifier)})`,
            );
            return source.replace(
              "import(`prismjs/components/prism-${actualLang}`)",
              `({ ${loaders.join(", ")} })[actualLang]()`,
            );
          },
        },
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

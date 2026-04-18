import fs from "fs-extra";
import path from "path";
import tmp from "tmp";
import {defineConfig} from "vite";
import {viteStaticCopy} from "vite-plugin-static-copy";
import webExtension from "vite-plugin-web-extension";

function mergeManifests(basePath: string, overridePath: string): string {
  const base = JSON.parse(fs.readFileSync(basePath, "utf-8"));
  const override = JSON.parse(fs.readFileSync(overridePath, "utf-8"));
  const merged = {
    ...base,
    ...override,
    permissions: Array.from(new Set([...(base.permissions || []), ...(override.permissions || [])]))
  };
  const tmpFile = tmp.fileSync({postfix: ".json"});
  fs.writeJSONSync(tmpFile.name, merged, {spaces: 2});
  return tmpFile.name;
}

export default defineConfig(({mode}) => {
  const isFirefox = mode === "firefox";
  const manifest = mergeManifests("manifest.base.json", isFirefox ? "manifest.firefox.json" : "manifest.chrome.json");

  return {
    plugins: [
      webExtension({
        manifest,
        watchFilePaths: ['src/**/*'],
        additionalInputs: isFirefox ? [] : ["src/offscreen/offscreen.html"]
      }),

      viteStaticCopy({
        targets: isFirefox ? [
          {
            src: "node_modules/onnxruntime-web/dist/ort-wasm-simd*",
            dest: "src/background/",
            rename: {
              stripBase: 3
            }
          }
        ] : []
      })
    ],
    build: {
      outDir: isFirefox ? "dist/firefox" : "dist/chrome",
      emptyOutDir: true
    },
    resolve: {
      alias: [
        ...(isFirefox ? [{
          find: /^onnxruntime-web$/,
          replacement: path.resolve(
            __dirname,
            "node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs"
          )
        }] : []
        ),
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src")
        }
      ]
    },
    optimizeDeps: {
      exclude: isFirefox ? ["onnxruntime-web"] : []
    },
    define: {
      __BROWSER__: JSON.stringify(isFirefox ? "firefox" : "chrome")
    }
  };
});

import fs from "fs-extra";
import path from "path";
import tmp from "tmp";
import {defineConfig} from "vite";
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
      })
    ],
    build: {
      outDir: isFirefox ? "dist/firefox" : "dist/chrome",
      emptyOutDir: true
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src")
      }
    },
    define: {
      __BROWSER__: JSON.stringify(isFirefox ? "firefox" : "chrome")
    }
  };
});

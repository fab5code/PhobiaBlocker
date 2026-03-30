import path from "path";
import {defineConfig} from "vite";

export default defineConfig({
  root: ".",
  publicDir: "testModel/public",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    port: 5174
  },
  optimizeDeps: {
    exclude: ["onnxruntime-web"]
  }
});

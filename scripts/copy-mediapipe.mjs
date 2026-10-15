/**
 * postinstall: copies the MediaPipe WASM runtime from node_modules into public/mediapipe/wasm/
 * so the face landmarker loads from this site (no CDN). Skips quietly if the package is missing.
 */
import fs from "node:fs";
import path from "node:path";

const src = path.resolve("node_modules/@mediapipe/tasks-vision/wasm");
const dst = path.resolve("public/mediapipe/wasm");

if (!fs.existsSync(src)) {
  console.warn("[copy-mediapipe] @mediapipe/tasks-vision/wasm not found, skipping");
  process.exit(0);
}
fs.mkdirSync(dst, { recursive: true });
for (const file of fs.readdirSync(src)) fs.copyFileSync(path.join(src, file), path.join(dst, file));
console.log(`[copy-mediapipe] copied ${fs.readdirSync(dst).length} files to public/mediapipe/wasm`);

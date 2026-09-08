import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const assets = path.join(root, "android", "app", "src", "main", "assets");
const publicDir = path.join(assets, "public");

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });
copyDir(dist, publicDir);

fs.writeFileSync(
  path.join(assets, "capacitor.config.json"),
  JSON.stringify({
    appId: "com.qqplayer.app",
    appName: "QQPlayer",
    webDir: "public",
    android: { allowMixedContent: false }
  }, null, 2)
);

fs.writeFileSync(
  path.join(assets, "capacitor.plugins.json"),
  "[]\n"
);

function copyDir(source, target) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

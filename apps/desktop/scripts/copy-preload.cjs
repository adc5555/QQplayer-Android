const fs = require("node:fs");
const path = require("node:path");
fs.mkdirSync(path.join(__dirname, "..", "dist-electron"), { recursive: true });
fs.copyFileSync(
  path.join(__dirname, "..", "electron", "preload.cjs"),
  path.join(__dirname, "..", "dist-electron", "preload.cjs")
);

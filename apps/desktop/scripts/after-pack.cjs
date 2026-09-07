const path = require("node:path");
const { rcedit } = require("rcedit");

exports.default = async function afterPack(context) {
  const exePath = path.join(context.appOutDir, "QQPlayer.exe");
  const iconPath = path.join(__dirname, "..", "build", "icon.ico");
  await rcedit(exePath, { icon: iconPath });
  console.log(`applied icon to ${exePath}`);
};

/** Vendos ikonën e Fiskale në .exe (signAndEditExecutable=false e lë atom-in e Electron). */
const path = require("path");
const fs = require("fs");

exports.default = async function afterPack(context) {
  const projectDir = context.packager.info.projectDir;
  const iconIco = path.join(projectDir, "assets", "icon.ico");
  if (!fs.existsSync(iconIco)) {
    throw new Error("Mungon assets/icon.ico — kopjo nga revolution-fiskale");
  }
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const rcedit = require("rcedit");
  await rcedit(exePath, { icon: iconIco });
  console.log("[after-pack] Ikona u vendos:", exePath);
};

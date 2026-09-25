/**
 * Build i mbrojtur: obfuscate → checksums → electron-builder (Setup.exe).
 * Si Fiskale: Setup.exe → Program Files (fshehur) + Start.cmd në ProgramData.
 *
 * npm run build:protected   (ose npm run build)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const STAGING_MARKER = path.join(ROOT, ".build-staging-path");
const OUT = fs.existsSync(STAGING_MARKER)
  ? fs.readFileSync(STAGING_MARKER, "utf8").trim()
  : path.join(ROOT, "dist-obfuscated");

function main() {
  console.log("\n══════════════════════════════════════");
  console.log(" BUILD I MBROJTUR — Revolution Kontabilisti");
  console.log(" (Setup.exe — model Fiskale)");
  console.log("══════════════════════════════════════\n");

  execSync("node scripts/obfuscate.js", { cwd: ROOT, stdio: "inherit" });
  const stagingPath = fs.existsSync(STAGING_MARKER)
    ? fs.readFileSync(STAGING_MARKER, "utf8").trim()
    : path.join(ROOT, "dist-obfuscated");
  execSync(`node scripts/generate-checksums.js "${stagingPath.replace(/\\/g, "/")}"`, { cwd: ROOT, stdio: "inherit" });

  const pkgPath = path.join(stagingPath, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const pkgVer = pkg.version || "1.0.0";
  const buildSuffix = String(process.env.KONTABILISTI_BUILD_OUT_SUFFIX || "").trim();
  const buildOutDir = path.join(ROOT, `dist-build-v${pkgVer}${buildSuffix}`);
  pkg.build = {
    ...(pkg.build || {}),
    directories: {
      ...(pkg.build?.directories || {}),
      output: buildOutDir,
      app: ".",
      buildResources: "build",
    },
    asar: true,
    asarUnpack: [
      "node_modules/better-sqlite3/**",
      "node_modules/sql.js/**",
      "public/**",
    ],
    nsis: {
      ...(pkg.build?.nsis || {}),
      oneClick: false,
      perMachine: true,
      allowToChangeInstallationDirectory: true,
      allowElevation: true,
      deleteAppDataOnUninstall: false,
      include: "installer.nsh",
      installerIcon: "icon.ico",
      uninstallerIcon: "icon.ico",
      installerHeaderIcon: "icon.ico",
      createDesktopShortcut: false,
      createStartMenuShortcut: false,
      shortcutName: "Revolution Kontabilisti",
      artifactName: "Revolution-Kontabilisti-Setup-v${version}.${ext}",
    },
    files: [
      "**/*",
      "!extracted/**",
      "!dist/**",
      "!dist-obfuscated/**",
      "!dist2/**",
      "!data/**",
      "!ai-cloud/**",
      "!tests/**",
      "!scripts/**",
      ".checksums.json",
    ],
  };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8");

  console.log("\nelectron-builder nga", path.basename(stagingPath) + "/...\n");
  execSync(`npx electron-builder --win --x64 --project "${stagingPath}"`, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });

  const setupSrc = path.join(buildOutDir, `Revolution-Kontabilisti-Setup-v${pkgVer}.exe`);
  const programDataLaunch = `%ProgramData%\\RevolutionInvest\\Revolution Kontabilisti-Launch\\Start.cmd`;

  console.log("\n══════════════════════════════════════");
  console.log(" GATI — Revolution Kontabilisti v" + pkgVer);
  console.log("  Instalues:", setupSrc);
  console.log("  Pas instalimit →", programDataLaunch);
  console.log("══════════════════════════════════════\n");
}

main();

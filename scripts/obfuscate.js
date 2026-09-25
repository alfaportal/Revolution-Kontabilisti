/**
 * Obfuskon kodin JS dhe përgatit dist-obfuscated/ për electron-builder.
 * Ekzekuto: node scripts/obfuscate.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const JavaScriptObfuscator = require("javascript-obfuscator");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "dist-obfuscated");
const STAGING_MARKER = path.join(ROOT, ".build-staging-path");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-obfuscated",
  "dist-obfuscated-staging",
  "dist-build",
  "dist2",
  "tests",
  "ai-cloud",
  "data",
  "extracted",
  ".git",
  ".cursor",
]);

function shouldSkipDir(name) {
  if (SKIP_DIRS.has(name)) return true;
  if (name.startsWith("dist-obfuscated")) return true;
  return false;
}

const SKIP_OBFUSCATE = new Set([
  path.normalize("scripts/obfuscate.js"),
  path.normalize("scripts/generate-checksums.js"),
  path.normalize("build/after-pack.js"),
  /** Eksportet/module.exports thyhen pas obfuskimit */
  path.normalize("data-paths.js"),
  path.normalize("audit-engine.js"),
]);

/** Opsione të lehta — agresive (selfDefending/rc4) thyen Electron renderer-in. */
const NODE_OBFUSCATE_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: "hexadecimal",
  log: false,
  numbersToExpressions: false,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.5,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  target: "node",
  reservedNames: [
    "^require$", "^module$", "^exports$", "^__dirname$", "^__filename$",
  ],
};

function rimraf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
}

function resolveOutDir() {
  if (!fs.existsSync(OUT)) return OUT;
  try {
    rimraf(OUT);
    return OUT;
  } catch (e) {
    console.warn("⚠ dist-obfuscated i kyçur");
  }
  const staging = path.join(ROOT, "dist-obfuscated-staging");
  if (!fs.existsSync(staging)) return staging;
  try {
    rimraf(staging);
    return staging;
  } catch {
    console.warn("⚠ dist-obfuscated-staging i kyçur — përdor temp");
  }
  return path.join(os.tmpdir(), `revolution-kontabilisti-obf-${Date.now()}`);
}

function copyTree(src, dest, rel = "") {
  const base = path.basename(src);
  if (shouldSkipDir(base)) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (shouldSkipDir(name)) continue;
      copyTree(path.join(src, name), path.join(dest, name), path.join(rel, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function shouldObfuscate(relPosix) {
  if (!relPosix.endsWith(".js")) return false;
  if (SKIP_OBFUSCATE.has(relPosix)) return false;
  if (relPosix.startsWith("scripts/")) return false;
  if (relPosix.startsWith("tests/")) return false;
  /** UI/renderer — pa obfuskim; obfuscator thyen modulet (charAt undefined). */
  if (relPosix.startsWith("public/")) return false;
  return true;
}

function obfuscateFile(absPath, relPosix) {
  const code = fs.readFileSync(absPath, "utf8");
  const result = JavaScriptObfuscator.obfuscate(code, NODE_OBFUSCATE_OPTIONS);
  fs.writeFileSync(absPath, result.getObfuscatedCode(), "utf8");
}

function main() {
  const outDir = resolveOutDir();
  fs.writeFileSync(STAGING_MARKER, outDir, "utf8");
  console.log(`Obfuscation — ${path.basename(outDir)}/\n`);
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of fs.readdirSync(ROOT)) {
    if (shouldSkipDir(name)) continue;
    copyTree(path.join(ROOT, name), path.join(outDir, name));
  }

  console.log("Kopjim node_modules...");
  const nmSrc = path.join(ROOT, "node_modules");
  const nmDest = path.join(outDir, "node_modules");
  if (fs.existsSync(nmSrc)) {
    fs.cpSync(nmSrc, nmDest, { recursive: true });
  }

  let count = 0;
  const WALK_SKIP = new Set(["node_modules", ".git"]);
  function walk(dir) {
    const base = path.basename(dir);
    if (WALK_SKIP.has(base)) return;
    for (const name of fs.readdirSync(dir)) {
      if (WALK_SKIP.has(name)) continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith(".js")) continue;
      const rel = path.relative(outDir, full).split(path.sep).join("/");
      if (!shouldObfuscate(rel)) continue;
      try {
        const code = fs.readFileSync(full, "utf8");
        if (!code.trim()) continue;
        obfuscateFile(full, rel);
        count += 1;
        console.log("  obf:", rel);
      } catch (e) {
        console.warn("  skip obf (gabim):", rel, "-", e.message);
      }
    }
  }
  walk(outDir);
  console.log(`\nObfuskuar ${count} skedarë JS → ${outDir}\n`);
}

main();

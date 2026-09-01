#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const productionExtensions = new Set([
  ".cs", ".fs", ".vb", ".csproj", ".fsproj", ".vbproj", ".props", ".targets",
]);
const excludedDirectories = new Set(["bin", "obj", "TestResults", ".orchestrator"]);

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function findTargetProject(sourcePath) {
  let directory = path.dirname(sourcePath);
  while (true) {
    const projects = fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:cs|fs|vb)proj$/u.test(entry.name))
      .map((entry) => path.join(directory, entry.name));
    if (projects.length === 1) return projects[0];
    if (projects.length > 1) throw new Error(`multiple target projects found in ${directory}`);
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`target project not found for ${sourcePath}`);
}

function findProductionRoot(targetProject) {
  const projectDirectory = path.dirname(targetProject);
  const parent = path.dirname(projectDirectory);
  return path.basename(parent).toLowerCase() === "src" ? parent : projectDirectory;
}

function collectFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath));
    else if (productionExtensions.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
  }
  return files.sort();
}

function snapshot(productionRoot) {
  return collectFiles(productionRoot).map((filePath) => ({
    path: path.relative(productionRoot, filePath).split(path.sep).join("/"),
    sha256: hashFile(filePath),
  }));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function capture(argv) {
  const sourceIndex = argv.indexOf("--target-source");
  const outputIndex = argv.indexOf("--output");
  if (sourceIndex < 0 || outputIndex < 0) throw new Error("capture requires --target-source and --output");
  const targetSource = path.resolve(argv[sourceIndex + 1]);
  const outputPath = path.resolve(argv[outputIndex + 1]);
  if (!fs.existsSync(targetSource)) throw new Error(`target source does not exist: ${targetSource}`);
  const targetProject = findTargetProject(targetSource);
  const productionRoot = findProductionRoot(targetProject);
  const manifest = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    targetSource,
    targetProject,
    productionRoot,
    files: snapshot(productionRoot),
  };
  writeJson(outputPath, manifest);
  console.log(JSON.stringify({
    status: "captured",
    manifestPath: outputPath,
    productionRoot,
    fileCount: manifest.files.length,
  }));
}

function verify(argv) {
  const manifestIndex = argv.indexOf("--manifest");
  if (manifestIndex < 0) throw new Error("verify requires --manifest");
  const manifestPath = path.resolve(argv[manifestIndex + 1]);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const before = new Map(manifest.files.map((item) => [item.path, item.sha256]));
  const after = new Map(snapshot(manifest.productionRoot).map((item) => [item.path, item.sha256]));
  const added = [...after.keys()].filter((item) => !before.has(item));
  const deleted = [...before.keys()].filter((item) => !after.has(item));
  const modified = [...before.keys()].filter(
    (item) => after.has(item) && before.get(item) !== after.get(item),
  );
  const passed = added.length === 0 && deleted.length === 0 && modified.length === 0;
  console.log(JSON.stringify({
    passed,
    manifestPath,
    productionRoot: manifest.productionRoot,
    added,
    deleted,
    modified,
  }, null, 2));
  process.exitCode = passed ? 0 : 1;
}

try {
  const [command, ...argv] = process.argv.slice(2);
  if (command === "capture") capture(argv);
  else if (command === "verify") verify(argv);
  else throw new Error("Usage: check-production-integrity.mjs <capture|verify> ...");
} catch (error) {
  console.log(JSON.stringify({ passed: false, errors: [error.message] }, null, 2));
  process.exitCode = 1;
}

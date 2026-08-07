#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function hash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function capture(args) {
  const authorIndex = args.indexOf("--author-result");
  const outputIndex = args.indexOf("--output");
  if (authorIndex < 0 || outputIndex < 0) {
    throw new Error("capture requires --author-result and --output");
  }
  const authorResultPath = path.resolve(args[authorIndex + 1]);
  const outputPath = path.resolve(args[outputIndex + 1]);
  const author = JSON.parse(fs.readFileSync(authorResultPath, "utf8"));
  const files = (author.testFilePaths ?? []).map((file) => {
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved)) throw new Error(`test file does not exist: ${resolved}`);
    return { path: resolved, sha256: hash(resolved) };
  });
  const manifest = { schemaVersion: 1, authorResultPath, files };
  writeJson(outputPath, manifest);
  console.log(JSON.stringify({ status: "captured", manifestPath: outputPath, fileCount: files.length }));
}

function verify(args) {
  const manifestIndex = args.indexOf("--manifest");
  if (manifestIndex < 0) throw new Error("verify requires --manifest");
  const manifestPath = path.resolve(args[manifestIndex + 1]);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const missing = [];
  const modified = [];
  for (const item of manifest.files ?? []) {
    if (!fs.existsSync(item.path)) missing.push(item.path);
    else if (hash(item.path) !== item.sha256) modified.push(item.path);
  }
  const passed = missing.length === 0 && modified.length === 0;
  console.log(JSON.stringify({ passed, manifestPath, missing, modified }, null, 2));
  process.exitCode = passed ? 0 : 1;
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === "capture") capture(args);
  else if (command === "verify") verify(args);
  else throw new Error("command must be capture or verify");
} catch (error) {
  console.error(`check-test-integrity error: ${error.message}`);
  process.exitCode = 1;
}

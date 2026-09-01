#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

try {
  const argv = process.argv.slice(2);
  const scenarios = [];
  let output;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output") output = argv[++index];
    else if (argv[index] === "--scenario") scenarios.push(argv[++index]);
    else throw new Error(`未知參數: ${argv[index]}`);
  }
  if (!output) throw new Error("--output is required");
  if (scenarios.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    throw new Error("--scenario must not be empty");
  }
  const outputPath = path.resolve(output);
  const manifest = {
    schemaVersion: 1,
    scenarios: scenarios.map((text, index) => ({
      id: `USR-${String(index + 1).padStart(3, "0")}`,
      text,
    })),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ status: "created", outputPath, scenarioCount: scenarios.length }));
} catch (error) {
  console.error(`create-user-scenario-manifest error: ${error.message}`);
  process.exitCode = 1;
}

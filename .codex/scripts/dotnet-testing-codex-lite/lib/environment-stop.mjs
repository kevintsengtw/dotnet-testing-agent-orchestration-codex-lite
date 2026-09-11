import path from "node:path";
import fs from "node:fs";
import { assertPlainPath } from "../usage/lifecycle.mjs";

// Reporting a blocked build output does not authorize changes to production source.
export function buildOutputRoots(manifest, workspace) {
  const directories = [path.dirname(manifest.testProjectPath)];
  let directory = path.dirname(manifest.targetSourcePath);
  while (fs.existsSync(directory)) {
    if (fs.readdirSync(directory).some(name => name.endsWith('.csproj'))) {
      directories.push(directory);
      break;
    }
    if (directory === workspace || directory === path.dirname(directory)) break;
    directory = path.dirname(directory);
  }
  return directories.flatMap(value => ['bin', 'obj'].map(name => path.join(value, name)));
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateEnvironmentStop(result, expected) {
  const errors = [];
  if (result?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (result?.status !== "environment_blocked") errors.push("status must be environment_blocked");
  if (!nonEmpty(result?.blockedPath)) errors.push("blockedPath must be a non-empty string");
  if (!nonEmpty(result?.operation)) errors.push("operation must be a non-empty string");
  if (!nonEmpty(result?.error)) errors.push("error must be a non-empty string");
  if (!Array.isArray(expected.allowedPaths) || expected.allowedPaths.length === 0) {
    errors.push("environment stop validator requires allowed paths");
  } else if (nonEmpty(result?.blockedPath)) {
    const blockedPath = path.resolve(result.blockedPath);
    const allowed = expected.allowedPaths.map((value) => path.resolve(value));
    const buildOutput = (expected.buildOutputRoots ?? []).some(root => {
      const relative = path.relative(path.resolve(root), blockedPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
      try { assertPlainPath(blockedPath); return true; } catch { return false; }
    });
    if (!allowed.includes(blockedPath) && !buildOutput) errors.push("blockedPath is outside the phase write envelope");
  }
  return {
    passed: errors.length === 0,
    errors,
    normalized: {
      ...result,
      role: expected.role,
      phase: expected.phase,
      target: expected.target,
    },
  };
}

export function assertEnvironmentStop(result, expected) {
  const validation = validateEnvironmentStop(result, expected);
  if (!validation.passed) throw new Error(validation.errors.join("; "));
  return validation.normalized;
}

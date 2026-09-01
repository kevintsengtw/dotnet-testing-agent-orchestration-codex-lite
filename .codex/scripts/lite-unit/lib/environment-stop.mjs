import path from "node:path";

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
    if (!allowed.includes(blockedPath)) errors.push("blockedPath is outside the phase write envelope");
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

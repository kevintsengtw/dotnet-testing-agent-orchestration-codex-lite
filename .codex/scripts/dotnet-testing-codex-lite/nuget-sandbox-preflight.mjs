#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const remediation = [
  "確認目前 Codex 沙箱能讀取 NuGet 套件快取；可在啟動 CLI 時用 -c shell_environment_policy.set.NUGET_PACKAGES 指向此機器可讀的絕對快取路徑。",
  "若快取缺少套件，依組織政策設定可用的 NuGet 套件來源或允許此工作區的網路存取，再重新執行預檢。",
  "不要改用 Full Access 重跑，也不要為此修改使用者層的 Codex 設定。",
];

function blocked(kind, message, details = {}) {
  return { status: "blocked", kind, message, remediation, ...details };
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function sourceProject(root, targetSource) {
  let directory = path.dirname(targetSource);
  while (directory === root || inside(root, directory)) {
    const projects = fs.readdirSync(directory).filter(name => name.endsWith(".csproj"));
    if (projects.length === 1) return path.join(directory, projects[0]);
    if (projects.length > 1) return null;
    directory = path.dirname(directory);
  }
  return null;
}

export function checkNugetSandbox({ workspaceRoot, targetSource, testProject },
  { env = process.env, restore = spawnSync } = {}) {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const source = path.resolve(targetSource);
  const test = path.resolve(testProject);
  if (!inside(root, source) || !inside(root, test)) {
    return blocked("project-outside-workspace", "Target 與測試專案必須位於目前工作區。", { root, source, test });
  }
  if (!fs.existsSync(source) || !fs.statSync(source).isFile() || !inside(root, fs.realpathSync(source))) {
    return blocked("target-source-unavailable", "Target source 不存在或不在工作區內。", { source });
  }
  let project = test;
  let projectKind = "test";
  if (!fs.existsSync(test)) {
    project = sourceProject(root, source);
    projectKind = "source";
  }
  if (!project || !fs.existsSync(project) || !fs.statSync(project).isFile() ||
      !inside(root, fs.realpathSync(project))) {
    return blocked("restore-project-unavailable", "無法找到工作區內唯一的還原專案。", { source, test });
  }

  const packages = env.NUGET_PACKAGES || null;
  if (packages) {
    try {
      if (!path.isAbsolute(packages) || !fs.statSync(packages).isDirectory()) throw Error("快取目錄無效");
      fs.accessSync(packages, fs.constants.R_OK);
    } catch (error) {
      return blocked("nuget-cache-unavailable", "NUGET_PACKAGES 在目前沙箱中無法讀取。", {
        packages, error: error.message,
      });
    }
  }

  const args = ["restore", project, ...(packages ? ["--packages", packages] : []),
    "--ignore-failed-sources", "--verbosity", "minimal"];
  const result = restore("dotnet", args, {
    cwd: path.dirname(project), env, encoding: "utf8", windowsHide: true,
    maxBuffer: 2 * 1024 * 1024, timeout: 120000,
  });
  if (result.error) {
    return blocked("dotnet-unavailable", "無法執行 NuGet 還原預檢。", {
      project, error: result.error.message,
    });
  }
  if (result.status !== 0) {
    return blocked("nuget-restore-unavailable", "指定專案在目前快取、套件來源與沙箱權限下無法還原。", {
      project, projectKind, packages, exitCode: result.status,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`.slice(-4000),
    });
  }
  return { status: "ready", project, projectKind, packages, restoreExitCode: 0 };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!["--workspace-root", "--target-source", "--test-project"].includes(key) || !argv[index + 1]) {
      throw Error(`未知或缺少參數: ${key}`);
    }
    options[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = argv[index + 1];
  }
  for (const key of ["workspaceRoot", "targetSource", "testProject"]) {
    if (!options[key]) throw Error(`缺少 ${key}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkNugetSandbox(parseArgs(process.argv.slice(2)));
    (result.status === "ready" ? process.stdout : process.stderr).write(`${JSON.stringify(result)}\n`);
    if (result.status !== "ready") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify(blocked("preflight-error", error.message))}\n`);
    process.exitCode = 1;
  }
}

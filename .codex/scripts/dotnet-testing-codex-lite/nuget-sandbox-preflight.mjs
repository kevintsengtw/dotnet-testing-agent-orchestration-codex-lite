#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function remediationFor(kind, details) {
  switch (kind) {
    case "project-outside-workspace":
      return ["確認 workspace root、target source 與 test project 路徑；兩個專案路徑都必須位於目前工作區。"];
    case "target-source-unavailable":
      return ["確認 target source 是目前工作區內存在且可讀的檔案。"];
    case "restore-project-unavailable":
      return ["確認既有 test csproj，或 target 所在路徑最近的來源專案；同一目錄有多個 csproj 時，請明確提供既有 test project。"];
    case "nuget-cache-unavailable":
      return ["檢查已明確設定的 NUGET_PACKAGES：必須是存在且目前執行環境可讀的絕對目錄。",
        "若不需要指定快取，可移除自己設定的 override，沿用 NuGet.Config 與 NuGet 預設快取；一般啟動不需要此變數。"];
    case "dotnet-unavailable":
      return ["依原始執行錯誤檢查 .NET SDK、PATH 或還原逾時問題，再重新執行預檢。"];
    case "nuget-restore-unavailable": {
      const output = details.output ?? "";
      const advice = [];
      if (/\bNU(?:1301|1801)\b/i.test(output)) {
        advice.push("套件來源存取失敗：依原始診斷檢查 NuGet.Config 的來源，以及連線、代理伺服器、憑證或來源驗證；錯誤代碼本身不能判定是哪一項原因。");
      }
      if (/\bNU(?:1101|1102)\b/i.test(output)) {
        advice.push("找不到所需套件或版本：核對套件識別碼、版本、NuGet.Config 的套件來源與 packageSourceMapping，以及既有快取是否包含所需套件。");
      }
      if (/EACCES|EPERM|access (?:is )?denied|unauthorizedaccess|permission denied|存取.*拒絕|拒絕存取/i.test(output)) {
        advice.push("診斷包含存取拒絕：核對錯誤指出的來源、快取或專案輸出路徑及目前執行環境的存取權限。");
      }
      if (advice.length === 0) {
        advice.push("先依原始 dotnet restore 診斷檢查專案、SDK、套件來源或快取；目前資訊不足以判定原因，不應先加入 NuGet override。");
      } else if (/\bNU(?:1301|1801|1101|1102)\b/i.test(output)) {
        advice.push("選用處理：只有確認所需套件已在另一個可讀快取、且目前環境未使用該快取時，才考慮用單次 CLI -c shell_environment_policy.set.NUGET_PACKAGES 指定其絕對路徑。");
      }
      return [...advice, "預檢不會修改使用者層設定、開啟網路或放寬權限；依組織允許的方式處理後，再從預檢重新執行。"];
    }
    default:
      return ["依原始錯誤核對預檢參數、工作區與檔案存取狀態，再重新執行。"];
  }
}

function blocked(kind, message, details = {}) {
  return { status: "blocked", kind, message, remediation: remediationFor(kind, details), ...details };
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
      return blocked("nuget-cache-unavailable", "指定的 NUGET_PACKAGES 不是存在且可讀的絕對目錄。", {
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

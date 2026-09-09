import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { acquire, assertPlainPath, assertPlainTree, readJson } from '../usage/lifecycle.mjs';

function treeHashes(directory) {
  const hashes = {};
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else hashes[path.relative(directory, file)] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  }
  visit(directory);
  return hashes;
}

export function beginCoverageAttempt({ outputPath, rawDirectory, retry, retryToolIncident, testProject, targetSource, targetClass, baseline, line, branch }) {
  assertPlainPath(outputPath); assertPlainPath(rawDirectory);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const release = acquire(path.dirname(outputPath), `${path.basename(outputPath)}.runner.lock`);
  try {
    if (retry && retryToolIncident) throw Error('每次只能指定一種重跑模式');
    if (fs.existsSync(rawDirectory) && !retryToolIncident) throw Error(`coverage evidence path 已存在: ${rawDirectory}`);
    if (!retry && !retryToolIncident) {
      if (fs.existsSync(outputPath)) throw Error(`coverage manifest 已存在: ${outputPath}`);
      return { release, previousAttempt: null };
    }
    const previous = readJson(outputPath);
    const sameIdentity = previous.schemaVersion === 1 && previous.productionIntegrity?.status === 'passed' && !previous.coverageDecision &&
      previous.testProjectPath === testProject && previous.target?.sourcePath === targetSource && previous.target?.className === targetClass &&
      previous.productionIntegrity?.baselinePath === baseline && previous.thresholds?.line === line && previous.thresholds?.branch === branch;
    const retryableBuildFailure = retry && previous.status === 'build_failed' && previous.build?.status === 'failed' &&
      Number.isInteger(previous.build.exitCode) && previous.build.exitCode !== 0 && previous.test === null && previous.coverage === null;
    const retryableToolIncident = retryToolIncident && previous.status === 'tool_incident' && previous.build?.status === 'passed' &&
      previous.test?.status === 'unavailable' && previous.test?.processStatus === 'tool_incident' &&
      Number.isInteger(previous.test.exitCode) && previous.test.exitCode !== 0 && Array.isArray(previous.runnerIncidents) &&
      previous.runnerIncidents.length > 0 && fs.existsSync(rawDirectory);
    if (!sameIdentity || (!retryableBuildFailure && !retryableToolIncident))
      throw Error('重跑只允許相同目標、baseline 與門檻的原始 build_failed 或測試宿主 tool_incident；不得經 review merge');
    const supplement = `${outputPath}.supplement.json`;
    if (fs.existsSync(supplement)) throw Error('已有 review supplement，拒絕重跑');
    const summary = assertPlainPath(`${outputPath}.summary.json`);
    const archiveRoot = assertPlainPath(`${outputPath}.attempts`);
    fs.mkdirSync(archiveRoot, { recursive: true });
    const archive = path.join(archiveRoot, crypto.randomUUID());
    fs.mkdirSync(archive);
    // Copy and verify before releasing the original output path. The failed evidence is never discarded.
    const saved = path.join(archive, retryToolIncident ? 'tool-incident.json' : 'failed.json');
    fs.copyFileSync(outputPath, saved, fs.constants.COPYFILE_EXCL);
    if (!fs.readFileSync(saved).equals(fs.readFileSync(outputPath))) throw Error('失敗證據封存核對不符');
    if (retryToolIncident) {
      assertPlainTree(rawDirectory);
      const rawArchive = assertPlainPath(path.join(archive, path.basename(rawDirectory)));
      fs.cpSync(rawDirectory, rawArchive, { recursive: true, errorOnExist: true });
      assertPlainTree(rawArchive);
      if (JSON.stringify(treeHashes(rawArchive)) !== JSON.stringify(treeHashes(rawDirectory))) throw Error('raw 證據封存核對不符');
      fs.rmSync(rawDirectory, { recursive: true });
    }
    if (fs.existsSync(summary)) {
      fs.copyFileSync(summary, path.join(archive, 'summary.json'), fs.constants.COPYFILE_EXCL);
      if (!fs.readFileSync(path.join(archive, 'summary.json')).equals(fs.readFileSync(summary))) throw Error('summary 封存核對不符');
      fs.unlinkSync(summary);
    }
    fs.unlinkSync(outputPath);
    return { release, previousAttempt: saved };
  } catch (error) { release(); throw error; }
}

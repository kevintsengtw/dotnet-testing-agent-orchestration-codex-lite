import path from "node:path";

function decodeXml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attributes(text) {
  const result = {};
  for (const match of text.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
    result[match[1]] = decodeXml(match[2]);
  }
  return result;
}

function normalize(value) {
  return value.replaceAll("\\", "/").replace(/^[A-Za-z]:/, "").replace(/\/+/g, "/");
}

function sourceMatches(filename, targetSource) {
  const source = normalize(path.resolve(targetSource));
  const candidate = normalize(filename);
  return (
    source.endsWith(`/${candidate}`) ||
    candidate.endsWith(`/${source}`) ||
    path.posix.basename(source) === path.posix.basename(candidate)
  );
}

function classMatches(name, targetClass) {
  if (!targetClass) return true;
  return (
    name === targetClass ||
    name.endsWith(`.${targetClass}`) ||
    name.includes(`.${targetClass}/`) ||
    name.includes(`.${targetClass}+`)
  );
}

function branchCounts(lineAttributes) {
  const text = lineAttributes["condition-coverage"];
  if (!text) return { covered: 0, total: 0 };
  const match = text.match(/\((\d+)\s*\/\s*(\d+)\)/);
  return match
    ? { covered: Number(match[1]), total: Number(match[2]) }
    : { covered: 0, total: 0 };
}

function percent(covered, total) {
  return total === 0 ? 100 : Math.round((covered / total) * 10000) / 100;
}

export function parseCobertura(xml, { targetSource, targetClass }) {
  const lines = new Map();
  const branches = new Map();
  const matchedClasses = [];

  for (const classMatch of xml.matchAll(/<class\b([^>]*)>([\s\S]*?)<\/class>/g)) {
    const classAttributes = attributes(classMatch[1]);
    if (
      !sourceMatches(classAttributes.filename ?? "", targetSource) ||
      !classMatches(classAttributes.name ?? "", targetClass)
    ) {
      continue;
    }

    matchedClasses.push({
      name: classAttributes.name,
      filename: classAttributes.filename,
    });

    for (const lineMatch of classMatch[2].matchAll(/<line\b([^>]*?)(?:\/>|>([\s\S]*?)<\/line>)/g)) {
      const lineAttributes = attributes(lineMatch[1]);
      const number = Number(lineAttributes.number);
      const hits = Number(lineAttributes.hits ?? 0);
      if (!Number.isInteger(number)) continue;

      lines.set(number, Math.max(lines.get(number) ?? 0, hits));

      const counts = branchCounts(lineAttributes);
      if (counts.total > 0) {
        const existing = branches.get(number) ?? { covered: 0, total: 0 };
        branches.set(number, {
          covered: Math.max(existing.covered, counts.covered),
          total: Math.max(existing.total, counts.total),
        });
      }
    }
  }

  if (matchedClasses.length === 0) {
    throw new Error(`Cobertura 找不到 target class/source: ${targetClass} @ ${targetSource}`);
  }

  const sortedLines = [...lines].sort(([left], [right]) => left - right);
  const sortedBranches = [...branches].sort(([left], [right]) => left - right);
  const lineCovered = sortedLines.filter(([, hits]) => hits > 0).length;
  const branchCovered = sortedBranches.reduce((sum, [, item]) => sum + item.covered, 0);
  const branchTotal = sortedBranches.reduce((sum, [, item]) => sum + item.total, 0);

  return {
    matchedClasses,
    line: {
      covered: lineCovered,
      total: sortedLines.length,
      percent: percent(lineCovered, sortedLines.length),
      uncoveredLines: sortedLines.filter(([, hits]) => hits === 0).map(([number]) => number),
    },
    branch: {
      covered: branchCovered,
      total: branchTotal,
      percent: percent(branchCovered, branchTotal),
      uncoveredBranches: sortedBranches
        .filter(([, item]) => item.covered < item.total)
        .map(([line, item]) => ({ line, covered: item.covered, total: item.total })),
    },
  };
}

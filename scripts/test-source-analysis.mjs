export function collectTestMethods(sourceText) {
  const lines = sourceText.split(/\r?\n/);
  const methods = [];
  const seen = new Set();

  function register(candidateLine, lineNumber, attribute) {
    const match = candidateLine.match(
      /^public\s+(?:async\s+)?(?:void|Task(?:<[^>]+>)?|ValueTask(?:<[^>]+>)?)\s+([^\s(]+)\s*\(/u,
    );
    if (!match) return false;
    const key = `${lineNumber}:${match[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      methods.push({ attribute, line: lineNumber, name: match[1] });
    }
    return true;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].trim().match(/^\[(Fact|Theory)(?:\([^)]*\))?\]\s*(.*)$/u);
    if (!match) continue;
    const inline = match[2].trim();
    if (inline && register(inline, index + 1, match[1])) continue;
    for (let lookahead = index + 1; lookahead < Math.min(index + 8, lines.length); lookahead += 1) {
      const candidate = lines[lookahead].trim();
      if (candidate.startsWith("[") && !candidate.startsWith("[InlineData")) continue;
      if (register(candidate, lookahead + 1, match[1])) break;
    }
  }
  return methods;
}

export function findPublicTestClass(sourceText) {
  return sourceText.match(
    /public\s+(?:(?:sealed|static|abstract|partial)\s+)*class\s+([A-Za-z_][A-Za-z0-9_]*)/,
  )?.[1] ?? null;
}

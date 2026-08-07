function attributes(text) {
  const result = {};
  for (const match of text.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
    result[match[1]] = match[2];
  }
  return result;
}

export function parseTrxCounts(xml) {
  const match = xml.match(/<Counters\b([^>]*)\/?>/);
  if (!match) return null;
  const counters = attributes(match[1]);
  const number = (name) => Number(counters[name] ?? 0);
  return {
    total: number("total"),
    executed: number("executed"),
    passed: number("passed"),
    failed: number("failed"),
    skipped: number("notExecuted"),
  };
}

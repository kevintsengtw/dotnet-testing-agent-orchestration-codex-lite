function attributes(text) {
  const result = {};
  for (const match of text.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
    result[match[1]] = match[2];
  }
  return result;
}

function decodeXml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
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

export function parseTrxTestResults(xml) {
  return [...xml.matchAll(/<UnitTestResult\b([^>]*)\/?\s*>/gu)].map((match) => {
    const value = attributes(match[1]);
    return {
      testId: value.testId ?? null,
      testName: value.testName ? decodeXml(value.testName) : null,
      outcome: value.outcome ?? null,
    };
  });
}

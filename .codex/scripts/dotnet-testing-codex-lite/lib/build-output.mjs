export function parseBuildWarnings(output, maxLines = 10) {
  const warningLines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /\bwarning\s+[A-Z]{2,}\d{3,}\b/iu.test(line));
  const codes = [...new Set(
    warningLines.flatMap((line) =>
      [...line.matchAll(/\bwarning\s+([A-Z]{2,}\d{3,})\b/giu)].map((match) =>
        match[1].toUpperCase()),
    ),
  )].sort();
  return {
    count: warningLines.length,
    codes,
    lines: [...new Set(warningLines)].slice(0, maxLines),
    truncated: new Set(warningLines).size > maxLines,
  };
}

// Detection only: never return matching literals as evidence or send them to AI.
const formats = [
  /\b(?:gh[pousr]_[A-Za-z0-9]{28,}|github_pat_[A-Za-z0-9_]{28,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{35}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g,
  /\b(?:Bearer|Basic) [A-Za-z0-9_.+/=-]{20,}/gi,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"`<>]+/gi,
];
const assignment = /(?:\b(?:[\w-]*(?:secret|password|passwd|credential|api[_-]?key|access[_-]?key|auth[_-]?token|private[_-]?key|client[_-]?secret|token)[\w-]*)["']?\s*[:=]\s*)(?:["'][^"'\r\n]{8,}["']|[A-Za-z0-9_.+/=-]{16,}(?=\s|$))/gi;
const begin = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const end = /-----END [A-Z0-9 ]*PRIVATE KEY-----/;

export function redactLine(line: string) {
  let text = line;
  for (const pattern of formats) text = text.replace(pattern, "[REDACTED]");
  return text.replace(assignment, "[REDACTED CREDENTIAL ASSIGNMENT]");
}

export function redactSource(text: string) {
  let inKey = false;
  return text.split("\n").map((line) => {
    if (begin.test(line)) inKey = true;
    if (!inKey) return redactLine(line);
    if (end.test(line)) inKey = false;
    return "[REDACTED PRIVATE KEY LINE]";
  }).join("\n");
}

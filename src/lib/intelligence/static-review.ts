import type { SourceText } from "./source";
import { redactLine, redactSource } from "./redact";

export type FindingSeverity = "high" | "medium" | "low" | "informational";
export type ReviewFinding = { severity: FindingSeverity; category: string; path: string; line: number; evidence: string; risk: string; remediation: string; confidence: "high" | "medium" | "low" };
const checks = [
  { category: "Transport verification", match: /(?:NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|rejectUnauthorized\s*:\s*false|verify\s*=\s*False)\b/, severity: "high", risk: "Certificate verification appears disabled at this location.", remediation: "Use the default verified TLS configuration and configure a trusted CA where necessary.", confidence: "medium" },
  { category: "Dynamic SQL construction", match: /\b(?:query|execute|raw)\s*\(\s*(?:`[^`]*(?:SELECT|UPDATE|INSERT|DELETE)\b[^`]*\$\{|["'][^"']*(?:SELECT|UPDATE|INSERT|DELETE)\b[^"']*["']\s*\+)/i, severity: "high", risk: "SQL text is assembled inline; whether untrusted input reaches it was not verified.", remediation: "Use bound parameters and allowlist dynamic identifiers separately.", confidence: "low" },
  { category: "HTML rendering sink", match: /(?:\bdangerouslySetInnerHTML\s*=|\.innerHTML\s*=|\bdocument\.write\s*\()/, severity: "medium", risk: "This browser sink renders raw HTML; input provenance and sanitization were not verified.", remediation: "Prefer escaped rendering. If HTML is necessary, sanitize it with a reviewed allowlist.", confidence: "medium" },
  { category: "Token verification", match: /\b(?:jwt|jsonwebtoken)\.decode\s*\(/i, severity: "medium", risk: "Decoding a token does not verify its signature or claims. The surrounding authorization flow was not verified.", remediation: "Verify signature, issuer, audience and expiry before trusting token claims.", confidence: "low" },
  { category: "Unsafe deserialization", match: /\b(?:pickle\.(?:load|loads)|yaml\.unsafe_load|Marshal\.load)\s*\(/, severity: "high", risk: "This decoder requires trusted inputs. User-controlled data flow was not verified.", remediation: "Accept constrained data formats and validate against an explicit schema.", confidence: "medium" },
  { category: "Filesystem boundary", match: /\b(?:readFile|writeFile|sendFile|createReadStream)\s*\(\s*(?:req\.|request\.)/, severity: "medium", risk: "A request-derived value appears to be used as a file path.", remediation: "Resolve paths inside an allowlisted root and validate authorization before file access.", confidence: "low" },
  { category: "Missing transport encryption", match: /(?:fetch\s*\(|(?:endpoint|baseURL|base_url)\s*[:=])\s*["'`]http:\/\/(?!localhost\b|127\.0\.0\.1\b)/i, severity: "low", risk: "A non-local endpoint appears to use plaintext HTTP.", remediation: "Use verified HTTPS for endpoints that carry sensitive data.", confidence: "low" },
] as const;

export function scanSecurity(files: SourceText[]) {
  const results: ReviewFinding[] = [];
  for (const file of files) {
    if (/\.(?:md|rst|lock)$/i.test(file.path)) continue;
    const lines = file.text.split(/\r?\n/).slice(0, 1200);
    const redacted = redactSource(lines.join("\n")).split("\n");
    const path = redactLine(file.path);
    for (const [i, raw] of lines.entries()) {
      if (results.length >= 60) return results;
      const text = raw.trim();
      if (!text || text.startsWith("//") || text.startsWith("#")) continue;
      const line = i + 1;
      if (redacted[i] !== raw && (!redacted[i - 1]?.startsWith("[REDACTED PRIVATE KEY LINE]") || !redacted[i]?.startsWith("[REDACTED PRIVATE KEY LINE]"))) {
        results.push({ severity: "high", category: "Credential-like material", path, line, evidence: "Credential-like value matched; contents redacted.", risk: "A checked-in credential-like value may be exposed if it is live. Its validity was not tested.", remediation: "If real, revoke and rotate it; use a secret manager and remove the value from repository history using your organization’s process.", confidence: "medium" });
      }
      for (const rule of checks) if (rule.match.test(text)) results.push({ severity: rule.severity, category: rule.category, path, line, evidence: `${rule.category} pattern found in sampled source.`, risk: rule.risk, remediation: rule.remediation, confidence: rule.confidence });
    }
  }
  return results;
}

export function scanQuality(files: SourceText[]) {
  const reports: ReviewFinding[] = [];
  const blocks = new Map<string, { path: string; line: number }>();
  for (const file of files.filter((f) => /\.(?:tsx?|jsx?|py|rb|go|rs|java|cs|php)$/i.test(f.path))) {
    const path = redactLine(file.path);
    const lines = file.text.split(/\r?\n/);
    function add(category: string, line: number, evidence: string, risk: string, remediation: string, severity: FindingSeverity = "low") {
      if (reports.length < 60) reports.push({ severity, category, path, line, evidence, risk, remediation, confidence: "medium" });
    }
    if (lines.length > 500) add("Large module", 1, `${lines.length} lines in the sampled file.`, "Long, mixed-purpose modules may be harder to review.", "Split responsibilities at logical boundaries; avoid mechanical splitting.");
    const isJs = /\.[jt]sx?$/i.test(path);
    let explicitAny = 0, branchCount = 0, start = 1;
    const flush = () => { if (branchCount >= 12) add("Branch density", start, `${branchCount} branch markers between sampled function declarations.`, "This is a lexical complexity signal, not an AST-level complexity count.", "Consider extracting independently testable branches or simplifying the control flow."); };
    let duplicate = false;
    for (let i = 0; i < Math.min(1000, lines.length); i++) {
      const text = (lines[i] ?? "").trim();
      if (/^(?:export\s+)?(?:async\s+)?(?:function|def|func|fn)\s+\w+/.test(text)) { flush(); branchCount = 0; start = i + 1; }
      if (!text || /^(?:\/\/|#|\*)/.test(text)) continue;
      branchCount += [...text.matchAll(/\b(?:if|else\s+if|elif|case|catch|for|while)\b/g)].length;
      if (/\.tsx?$/.test(path) && /(?:\bas\s+any\b|:\s*any\b)/.test(text) && ++explicitAny === 1) add("Type safety", i + 1, "An explicit `any` annotation or cast was found.", "The compiler cannot enforce a type contract at this use site.", "Prefer an explicit type or validate an unknown value before use.", "informational");
      if (isJs && /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(text)) add("Error handling", i + 1, "Empty catch block.", "Failures may go unreported.", "Handle expected exceptions explicitly and report or rethrow unexpected failures.");
      if (i % 3 === 0 && !duplicate && i + 7 <= lines.length) {
        const chunk = lines.slice(i, i + 7).map((entry) => entry.trim()).join("\n");
        if (chunk.length > 180 && new Set(chunk.split("\n")).size >= 6) {
          const first = blocks.get(chunk);
          if (first && first.path !== path) { add("Repeated block", i + 1, `Seven successive trimmed lines also appear in ${first.path}:${first.line}.`, "Repeated logic can drift; boilerplate may be intentional.", "If the responsibilities are the same, consider sharing a well-tested helper.", "informational"); duplicate = true; }
          else blocks.set(chunk, { path, line: i + 1 });
        }
      }
    }
    flush();
  }
  return reports;
}

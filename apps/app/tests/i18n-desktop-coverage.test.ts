import { expect, test } from "bun:test";
import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../src/i18n/locales/en";
import zh from "../src/i18n/locales/zh";

const root = join(import.meta.dir, "../src");
function files(path: string): string[] {
 return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? entry.name === "i18n" ? [] : files(join(path, entry.name))
  : entry.name.endsWith(".tsx") ? [join(path, entry.name)] : []);
}
test("desktop additions have both locales and matching placeholders", () => {
 for (const [key, value] of Object.entries(en)) {
  if (!/^(desktop\.|session\.error\.|workspace\.error\.|activity\.elapsed_unverified)/.test(key)) continue;
  expect(Object.hasOwn(zh, key)).toBe(true);
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  expect(placeholders(Reflect.get(zh, key))).toEqual(placeholders(value));
 }
});
test("desktop JSX labels use i18n, with only product names and protocol examples literal", () => {
 const allowed = new Set(["favicon", "KiB", "github-copilot", "Qwen", "sk-...", "https://mcp.example.com/mcp", "/mcp/agent", "JSON", "opencode-wakatime", "POST /workspaces/", "/always-on/sources/", "/events", "Webhook", "CNY"]);
 const violations: string[] = [];
 for (const file of files(root)) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node: ts.Node) {
   let value: string | undefined;
   if (ts.isJsxText(node)) value = node.text.trim();
   else if (ts.isJsxAttribute(node) && ["title", "placeholder", "aria-label", "alt", "label", "description"].includes(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) value = node.initializer.text;
   if (value && /[A-Za-z\u4e00-\u9fff]{2}/.test(value) && !allowed.has(value)) violations.push(`${file}:${value}`);
   ts.forEachChild(node, visit);
  }
  visit(source);
 }
 expect(violations).toEqual([]);
});

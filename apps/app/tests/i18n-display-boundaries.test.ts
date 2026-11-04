import { expect, test } from "bun:test";
import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const root = join(import.meta.dir, "../src");
function files(path: string): string[] {
 return readdirSync(path,{withFileTypes:true}).flatMap(entry => entry.isDirectory() ? entry.name === "i18n" ? [] : files(join(path,entry.name)) : /\.tsx?$/.test(entry.name) ? [join(path,entry.name)] : []);
}
test("translations never replace protocol values in comparisons or native JSX attributes", () => {
 const violations: string[] = [];
 for(const file of files(root)) {
  const source = ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true,file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node: ts.Node) {
   if(ts.isCallExpression(node)&&node.expression.getText(source)==="t") {
    const parent=node.parent;
    if(ts.isBinaryExpression(parent)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind)) violations.push(`${file}: translated comparison`);
    if(ts.isJsxExpression(parent)&&ts.isJsxAttribute(parent.parent)&&["className","role","type","size","variant","data-testid"].includes(parent.parent.name.getText(source))) violations.push(`${file}: translated machine attribute`);
   }
   ts.forEachChild(node,visit);
  }
  visit(source);
 }
 expect(violations).toEqual([]);
});

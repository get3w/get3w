import { existsSync, lstatSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";

// Merge private storage without overwriting files created by a newer profile.
// Conflicting legacy files stay in place so neither version's data is lost.
export function migrateStoragePath(source, target) {
  if (path.resolve(source) === path.resolve(target)) return;
  if (!existsSync(source) || lstatSync(source).isSymbolicLink()) return;
  if (!existsSync(target)) {
    mkdirSync(path.dirname(target), { recursive: true });
    renameSync(source, target);
    return;
  }
  if (!lstatSync(source).isDirectory() || !lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink()) return;
  for (const name of readdirSync(source)) migrateStoragePath(path.join(source, name), path.join(target, name));
}

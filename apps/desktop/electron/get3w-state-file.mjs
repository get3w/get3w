import { access, rename } from 'node:fs/promises';
import path from 'node:path';

/** Move only Get3W's private state file; never overwrite a newer state file. */
export async function migrateGet3wStateFile(userData, name, legacyName) {
  const target = path.join(userData, name);
  try { await access(target); return target; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await rename(path.join(userData, legacyName), target); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return target;
}

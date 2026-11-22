import {existsSync, readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import path from 'node:path';

// Pydantic reads DB settings from api/.env; os.getenv-based feature/connector
// configuration must also reach the actual Python service processes.
export function localServiceEnvironment(api, inherited = process.env) {
  const configured = {};
  for (const name of ['.env', '.env.dev-local']) {
    const file = path.join(api, name);
    if (existsSync(file)) {
      for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
        if (key.startsWith('GET3W_')) configured[key] = value;
      }
    }
  }
  return {...configured, ...inherited};
}

import path from "node:path";
import { prepareBlankSlateProfile } from "./blank-slate-profile.mjs";

// Reuse the complete sandbox path inventory, with a stable root for restarts.
export function prepareLocalPackageEnvironment(userDataPath, env = process.env, platform = process.platform) {
  const systemHome = env.HOME;
  const root = path.join(userDataPath, "local-runtime");
  const profile = prepareBlankSlateProfile({
    argv: ["--blank-slate"], env,
    createTempRoot: () => root,
  });
  // macOS Security resolves the default login keychain from the process HOME.
  // Keep native services in the real user home; explicit XDG/OpenCode paths
  // continue isolating model credentials, config, databases and history.
  if (platform === "darwin") {
    if (systemHome === undefined) delete env.HOME;
    else env.HOME = systemHome;
  }
  // The outer Electron profile has already been selected and remains stable.
  env.GET3W_ELECTRON_USERDATA = userDataPath;
  return profile;
}

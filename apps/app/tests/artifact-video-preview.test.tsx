/** @jsxImportSource react */
import { afterAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
const ownsDom = !GlobalRegistrator.isRegistered;
if (ownsDom) GlobalRegistrator.register({ url: "http://localhost/" });
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { VideoPreview } = await import("../src/react-app/domains/session/artifacts/preview");
const { openTargetFromWorkspaceFile, isCollectibleArtifactTarget } = await import("../src/react-app/domains/session/artifacts/open-target");
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
afterAll(async () => { if (ownsDom) await GlobalRegistrator.unregister(); });

test("workspace videos are previewable artifacts and unsupported formats remain external", () => {
  for (const name of ["DT-06/v3-fixed.mp4", "clip.MOV", "clip.webm", "clip.m4v", "clip.ogv"]) {
    const target = openTargetFromWorkspaceFile(name)!;
    expect(target.preview).toBe("video");
    expect(isCollectibleArtifactTarget(target)).toBe(true);
  }
  expect(openTargetFromWorkspaceFile("archive.zip")?.preview).toBe("external");
});

test("workspace player uses fetched media, offers controls, and reports decode failure", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<VideoPreview src="blob:workspace-video" title="v3-fixed.mp4" />));
    const video = host.querySelector("video")!;
    expect(video.getAttribute("src")).toBe("blob:workspace-video");
    expect(video.controls).toBe(true);
    expect(video.getAttribute("aria-label")).toBe("v3-fixed.mp4");
    expect(video.autoplay).toBe(false);
    await act(async () => video.dispatchEvent(new Event("error")));
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => video.dispatchEvent(new Event("loadeddata")));
    expect(host.querySelector('[role="alert"]')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

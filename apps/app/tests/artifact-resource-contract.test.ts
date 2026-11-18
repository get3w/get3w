import { expect, test } from "bun:test";
import { generatedArtifactViewRevisionSchema } from "@get3w/types/workflows";

test("saved artifact revisions accept exact authored app URIs without allowing external resources", () => {
  const uri = generatedArtifactViewRevisionSchema.shape.resourceUri;
  expect(uri.safeParse("ui://get3w/apps/cob_01m6v2jrsz2k9b0zckjyz14w8v/revisions/cov_01m6v2jrszesn06gnsp1n8qhg2/index.html").success).toBe(true);
  expect(uri.safeParse("ui://get3w/artifacts/art_fixture/views/rev_fixture/index.html").success).toBe(true);
  for (const value of ["https://example.test/app.html", "ui://get3w/apps/../../index.html", "ui://get3w/apps/cob_invalid/revisions/cov_invalid/index.html"])
    expect(uri.safeParse(value).success).toBe(false);
});

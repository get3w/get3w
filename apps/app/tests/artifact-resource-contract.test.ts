import { expect, test } from "bun:test";
import { generatedArtifactViewRevisionSchema } from "@openwork/types/workflows";

test("saved artifact revisions accept exact authored app URIs without allowing external resources", () => {
  const uri = generatedArtifactViewRevisionSchema.shape.resourceUri;
  expect(uri.safeParse("ui://openwork/apps/cob_01m6v2jrsz2k9b0zckjyz14w8v/revisions/cov_01m6v2jrszesn06gnsp1n8qhg2/index.html").success).toBe(true);
  expect(uri.safeParse("ui://openwork/artifacts/art_fixture/views/rev_fixture/index.html").success).toBe(true);
  for (const value of ["https://example.test/app.html", "ui://openwork/apps/../../index.html", "ui://openwork/apps/cob_invalid/revisions/cov_invalid/index.html"])
    expect(uri.safeParse(value).success).toBe(false);
});

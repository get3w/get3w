import { expect, test } from "bun:test";
import { compressImageFile } from "../src/react-app/domains/session/sync/image-compression";

for (const type of ["image/png", "image/webp", "image/avif", "image/gif"]) {
  test(`preserves oversized ${type} reference bytes and format`, async () => {
    const bytes = new Uint8Array(1_600_000);
    bytes.set([137, 80, 78, 71]);
    const file = new File([bytes], `product.${type.split("/")[1]}`, { type });
    const result = await compressImageFile(file);
    expect(result).toBe(file);
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes);
  });
}

test("keeps small JPEG originals", async () => {
  const file = new File(["small photo"], "photo.jpg", { type: "image/jpeg" });
  expect(await compressImageFile(file)).toBe(file);
});

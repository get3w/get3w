import { describe, expect, test } from "bun:test";
import { validateUserOpencodeConfigText, validateUserProviderUpdate } from "../src/validators.js";

describe("the Auto Router provider id is reserved for Get3W's sync", () => {
  test("a client cannot define or replace get3w-auto", () => {
    expect(() => validateUserProviderUpdate({ "get3w-auto": { options: { baseURL: "https://example.invalid" } } })).toThrow("managed by your organization");
    expect(() => validateUserProviderUpdate({ "Get3W-Auto": {} })).toThrow("managed by your organization");
  });
  test("removing it and writing other providers stays allowed", () => {
    expect(() => validateUserProviderUpdate({ "get3w-auto": null, anthropic: { options: {} } })).not.toThrow();
  });
  test("OpenCode config text cannot define it", () => {
    expect(() => validateUserOpencodeConfigText('{ "provider": { "get3w-auto": { "npm": "x" } } }')).toThrow("managed by your organization");
    expect(() => validateUserOpencodeConfigText('{ "provider": { "anthropic": {} } }')).not.toThrow();
  });
  test("escaped, commented and trailing-comma spellings are decoded before checking", () => {
    expect(() => validateUserOpencodeConfigText('{ "provider": { "get3w-\\u0061uto": { "npm": "x" } } }')).toThrow("managed by your organization");
    expect(() => validateUserOpencodeConfigText('{ // note\n "provider": { "get3w-auto": {}, }, }')).toThrow("managed by your organization");
  });
});

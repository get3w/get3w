import { afterEach, expect, test } from "bun:test";
import { createClientV2 } from "../src/app/lib/opencode-v2-adapter";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const base = "http://127.0.0.1:9/workspace/ws_1/opencode2";
const directory = "/workspace/report files";

function mockEngine(owner = "ses_1", stopStatus = 200) {
  const requests: Request[] = [];
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request);
      if (request.method === "GET") return Response.json({ location: { directory }, data: {
        id: "sh_1", status: "running", command: "sleep 120", metadata: { sessionID: owner }, time: { started: 1000 },
      } });
      return stopStatus === 200 ? Response.json({ output: { stopped: true } }) : Response.json({ name: "StopFailed" }, { status: stopStatus });
    },
  });
  return requests;
}

test("V2 quiet stop verifies the owner then stops exactly that shell with the same auth and location", async () => {
  const requests = mockEngine();
  const result = await createClientV2(base, directory, { token: "fixture-token" }).stopBackgroundShell({ shellID: "sh_1", sessionID: "ses_1" });
  expect(result.error).toBeUndefined();
  expect(result.response.status).toBe(200);
  expect(requests.map((request) => request.method)).toEqual(["GET", "POST"]);
  for (const request of requests) {
    const url = new URL(request.url);
    expect(url.pathname).toBe(request.method === "GET" ? "/workspace/ws_1/opencode2/api/shell/sh_1" : "/workspace/ws_1/opencode2/api/rpc/get3w.background-shell/stop");
    if (request.method === "POST") expect(await request.json()).toEqual({ input: { shellID: "sh_1", sessionID: "ses_1" } });
    expect(url.searchParams.get("location[directory]")).toBe(directory);
    expect(request.headers.get("authorization")).toBe("Bearer fixture-token");
  }
});

test("another conversation's command cannot be deleted", async () => {
  const requests = mockEngine("ses_other");
  await expect(createClientV2(base, directory, {}).stopBackgroundShell({ shellID: "sh_1", sessionID: "ses_1" })).rejects.toThrow("does not belong");
  expect(requests.map((request) => request.method)).toEqual(["GET"]);
});

test("an unsuccessful stop returns an error rather than claiming the command stopped", async () => {
  mockEngine("ses_1", 500);
  const result = await createClientV2(base, directory, {}).stopBackgroundShell({ shellID: "sh_1", sessionID: "ses_1" });
  expect(result.error).toEqual({ name: "StopFailed" });
  expect(result.data).toBeUndefined();
});

test("output verifies ownership and reads the engine output endpoint", async () => {
  const requests: Request[] = [];
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    return Response.json({ data: request.url.includes("/output") ? { output: "server ready\n" } : {
      id: "sh_1", status: "running", command: "serve", metadata: { sessionID: "ses_1" }, time: { started: 1 },
    } });
  };
  const result = await createClientV2(base, directory, {}).readBackgroundShell({ shellID: "sh_1", sessionID: "ses_1" });
  expect(result.data).toBe("server ready\n");
  expect(new URL(requests[1].url).pathname).toEndWith("/shell/sh_1/output");
});

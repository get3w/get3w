import { expect, test } from "bun:test";
import { managedDesktopPolicy } from "../src/managed-desktop-policy";
import type { ServerConfig } from "../src/types";

const config: ServerConfig = {host:"127.0.0.1",port:0,token:"test",hostToken:"host",configPath:"/unused",
  approval:{mode:"manual",timeoutMs:1000},corsOrigins:[],workspaces:[],authorizedRoots:[],readOnly:true,
  startedAt:0,tokenSource:"generated",hostTokenSource:"generated",logFormat:"json",logRequests:false};
test("personal policy retains local evaluation authentication and never enables remote computers", async () => {
  const policy = managedDesktopPolicy(config);
  expect(managedDesktopPolicy(config)).toBe(policy);
  expect(policy.authenticatesEvaluation(new Request("http://localhost"))).toBe(false);
  expect(policy.authenticatesEvaluation(new Request("http://localhost", {headers:{Authorization:"Bearer wrong"}}))).toBe(false);
  expect(policy.authenticatesEvaluation(new Request("http://localhost", {headers:{Authorization:`Bearer ${policy.evaluationToken}`}}))).toBe(true);
  await policy.setSession({baseUrl:"https://no-network.example.test",token:"fixture",orgId:"fixture"});
  expect(await policy.current()).toBeNull();
  expect(policy.known()).toBeNull();
  expect(await policy.remoteComputersEnabled()).toBe(false);
  expect(await policy.websiteRules()).toEqual([]);
  await policy.clearSession();
  expect(config.readOnly).toBe(true);
  expect(config.approval.mode).toBe("manual");
});

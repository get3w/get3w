import { test } from "node:test";
import assert from "node:assert/strict";
import { selectLocalProcesses } from "./close-local.mjs";

test("selects checkout services and descendants, preserving other projects and invoking shell", () => {
 const options={desktop:"/repo/desktop",apiRoot:"/repo/api",webRoot:"/repo/web",self:100};
 const rows=[
  {pid:1,ppid:0,command:"init",cwd:"/"},
  {pid:99,ppid:1,command:"shell",cwd:"/repo/desktop"},
  {pid:100,ppid:99,command:"node scripts/close-local.mjs",cwd:"/repo/desktop"},
  {pid:2,ppid:1,command:"node scripts/dev-local.mjs",cwd:"/repo/desktop"},
  {pid:3,ppid:2,command:"python -m uvicorn main:app",cwd:"/repo/api"},
  {pid:4,ppid:1,command:"python -m celery -A celery_app worker",cwd:"/repo/api"},
  {pid:5,ppid:1,command:"node /repo/web/node_modules/vite/bin/vite.js --port 7700",cwd:"/repo/web"},
  {pid:6,ppid:1,command:"node scripts/electron-dev.mjs",cwd:"/repo/desktop/apps/desktop"},
  {pid:7,ppid:6,command:"Electron Helper",cwd:"/"},
  {pid:8,ppid:1,command:"python -m uvicorn main:app --port 6600",cwd:"/other/api"},
  {pid:9,ppid:1,command:"node vite --port 5173",cwd:"/repo/desktop-other"},
  {pid:10,ppid:1,command:"node scripts/check.mjs",cwd:"/repo/desktop"},
 ];
 assert.deepEqual(selectLocalProcesses(rows,options).map(row=>row.pid),[2,3,4,5,6,7]);
 assert.deepEqual(selectLocalProcesses([],options),[]);
});

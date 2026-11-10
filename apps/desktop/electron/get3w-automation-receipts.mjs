import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import path from 'node:path';

/** Private, encrypted terminal receipts. Never contains credentials or replays tasks. */
export function createAutomationReceiptJournal({userData, safeStorage}) {
  const file=path.join(userData,'get3w-automation-receipts.enc');
  let queue=Promise.resolve();
  const serial=operation=>{const next=queue.then(operation,operation);queue=next.catch(()=>{});return next;};
  async function read() {
    let bytes;
    try {bytes=await readFile(file);}catch(error){if(error.code==='ENOENT')return [];throw error;}
    const decoded=await safeStorage.decryptStringAsync(bytes);
    const entries=JSON.parse(typeof decoded==='string' ? decoded : decoded.result);
    if(!Array.isArray(entries)||entries.length>500)throw Error('Automation receipt journal is invalid.');
    return entries;
  }
  async function write(entries) {
    if(!await safeStorage.isAsyncEncryptionAvailable()||safeStorage.getSelectedStorageBackend?.()==='basic_text')throw Error('Secure automation receipt storage is unavailable.');
    await mkdir(userData,{recursive:true});
    const bytes=await safeStorage.encryptStringAsync(JSON.stringify(entries));
    await writeFile(file+'.tmp',bytes,{mode:0o600});
    await rename(file+'.tmp',file);
  }
  return {
    prepare:()=>serial(async()=>write(await read())),
    list:userId=>serial(async()=>(await read()).filter(entry=>entry.userId===userId)),
    put:entry=>serial(async()=>{
      const entries=(await read()).filter(saved=>saved.runId!==entry.runId);
      if(entries.length>=500)throw Error('Automation receipt storage is full. Reconnect before running more tasks.');
      entries.push(entry);await write(entries);
    }),
    remove:runId=>serial(async()=>write((await read()).filter(entry=>entry.runId!==runId))),
  };
}

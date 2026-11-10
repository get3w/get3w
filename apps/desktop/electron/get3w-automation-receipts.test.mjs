import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createAutomationReceiptJournal} from './get3w-automation-receipts.mjs';

test('terminal receipts persist privately across process restarts and are account scoped',async()=>{
 const userData=await mkdtemp(path.join(tmpdir(),'get3w-receipts-'));
 const safeStorage={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async text=>Buffer.from(text).reverse(),decryptStringAsync:async bytes=>({result:Buffer.from(bytes).reverse().toString()})};
 try {
  const journal=createAutomationReceiptJournal({userData,safeStorage});
  const entry={userId:'alice',runId:'one',runnerId:'original',body:{status:'succeeded',resultSummary:'Private result'}};
  await journal.put(entry);
  assert.equal((await readFile(path.join(userData,'get3w-automation-receipts.enc'))).includes('Private result'),false);
  const restarted=createAutomationReceiptJournal({userData,safeStorage});
  assert.deepEqual(await restarted.list('bob'),[]);
  assert.deepEqual(await restarted.list('alice'),[entry]);
  await restarted.remove('one');assert.deepEqual(await journal.list('alice'),[]);
 }finally{await rm(userData,{recursive:true,force:true});}
});

test('claim preparation refuses plaintext fallback before executing any work',async()=>{
 const userData=await mkdtemp(path.join(tmpdir(),'get3w-receipts-'));
 try{
  const journal=createAutomationReceiptJournal({userData,safeStorage:{isAsyncEncryptionAvailable:async()=>true,getSelectedStorageBackend:()=> 'basic_text'}});
  await assert.rejects(journal.prepare(),/Secure automation receipt storage/);
 }finally{await rm(userData,{recursive:true,force:true});}
});

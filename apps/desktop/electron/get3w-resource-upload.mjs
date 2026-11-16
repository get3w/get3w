import {createHash} from 'node:crypto';
import {open,realpath} from 'node:fs/promises';
import path from 'node:path';

/** Host-only upload pipeline shared by native tools; never exposes account credentials. */
export function createResourceUploader({ticket,verify,fetchImpl=fetch,now=Date.now}) {
 const cache=new Map();
 return async function upload(source,host,signal) {
  if(typeof source!=='string'||(!path.isAbsolute(source)&&!source.startsWith('file:')))throw Error('Provide an absolute workspace file path');
  if(!host.workspaceDirectory)throw Error('Select a workspace before uploading resources');
  const root=await realpath(host.workspaceDirectory);
  const filename=await realpath(source.startsWith('file:')?new URL(source):source);
  const relative=path.relative(root,filename);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Copy the resource into the current workspace before uploading');
  signal.throwIfAborted();await verify();
  const handle=await open(filename,'r');
  let bytes;
  try {
   const info=await handle.stat();
   if(!info.isFile()||info.size<1||info.size>200*1024*1024)throw Error('Choose a supported file between 1 byte and 200 MB');
   bytes=await handle.readFile();
   if(bytes.length!==info.size)throw Error('The resource changed while reading; retry uploading');
  } finally {await handle.close();}
  const key=JSON.stringify([host.workspaceId,host.sessionId,host.userMessageId,filename,createHash('sha256').update(bytes).digest('hex')]);
  const existing=cache.get(key);
  if(existing&&existing.expiresAt>now())return existing.result;
  const pending=(async()=>{
   const value=await ticket({filename:path.basename(filename),size_bytes:bytes.length},host,signal);
   const target=new URL(value.upload?.url),download=new URL(value.download_url);
   if(target.protocol!=='https:'||download.protocol!=='https:'||target.username||target.password||download.username||download.password||value.upload.method!=='PUT')throw Error('The resource upload destination could not be verified');
   await verify();signal.throwIfAborted();
   const response=await fetchImpl(target,{method:'PUT',headers:value.upload.headers,body:bytes,signal,redirect:'error'});
   if(!response.ok)throw Error('Resource upload failed; retry uploading');
   await verify();signal.throwIfAborted();
   return {url:download.href,filename:path.basename(filename),size_bytes:bytes.length,type:value.type};
  })();
  cache.set(key,{result:pending,expiresAt:now()+60*60*1000});
  try{return await pending;}catch(error){cache.delete(key);throw error;}
 };
}

export const isLocalResource=value=>typeof value==='string'&&(path.isAbsolute(value)||value.startsWith('file:'));
export async function resolveResourceReferences(value,upload,host,signal) {
 if(Array.isArray(value))return Promise.all(value.map(item=>resolveResourceReferences(item,upload,host,signal)));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([name,item])=>[name,await resolveResourceReferences(item,upload,host,signal)])));
 return isLocalResource(value)?(await upload(value,host,signal)).url:value;
}

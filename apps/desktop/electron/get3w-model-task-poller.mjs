/** Bounded polling. Never submits or changes an idempotency key. */
export function createModelTaskPoller({list,read,save,onError=(_row,_error)=>{},concurrency=3,now=Date.now}) {
  const due=new Map(),failures=new Map(),active=new Set();
  let stopped=false,listing=false;
  return {
    async tick() {
      if(stopped||listing)return;
      let records;
      listing=true;
      try{records=await list();}finally{listing=false;}
      if(stopped)return;
      const pending=new Set(records.filter(row=>!['completed','failed','detached'].includes(row.status)).map(row=>row.key));
      for(const key of due.keys())if(!pending.has(key)&&!active.has(key)){due.delete(key);failures.delete(key);}
      const ready=records.filter(row=>!['completed','failed','detached'].includes(row.status) && (row.requestId || row.status==='submitting')
        && !active.has(row.key) && (due.get(row.key)??0)<=now())
        .sort((a,b)=>(due.get(a.key)??0)-(due.get(b.key)??0)).slice(0,Math.max(0,concurrency-active.size));
      await Promise.all(ready.map(async row=>{
        active.add(row.key);
        try {
          const result=await read(row);
          if(stopped)return;
          await save(row,result);
          if(stopped)return;
          failures.delete(row.key);
          const seconds=Number.isFinite(result.retry_after)?Math.max(1,Math.min(300,result.retry_after)):3;
          due.set(row.key,now()+seconds*1000);
        }catch(error){
          if(stopped)return;
          const count=(failures.get(row.key)??0)+1;failures.set(row.key,count);
          due.set(row.key,now()+Math.min(300,3*2**Math.min(count,7))*1000);onError(row,error);
        }finally{active.delete(row.key);}
      }));
    },
    stop(){stopped=true;due.clear();failures.clear();},
  };
}

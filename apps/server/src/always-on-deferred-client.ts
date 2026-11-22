import { supportsDeferredQuestions } from "./engine-deferred-capability.js";
import { z } from "zod";

const identity = { sessionID: z.string(), messageID: z.string(), callID: z.string(), requestID: z.string() };
const questions = z.array(z.object({header:z.string(),question:z.string(),options:z.array(z.object({label:z.string(),description:z.string()})),multiple:z.boolean().optional()}));
const question = z.discriminatedUnion("status",[
  z.object({...identity,questions,status:z.literal("waiting")}),
  z.object({...identity,questions,status:z.literal("cancelled")}),
  z.object({...identity,questions,status:z.literal("answered"),answerID:z.string(),answers:z.array(z.array(z.string())),content:z.string()}),
  z.object({...identity,questions,status:z.literal("committed"),answerID:z.string(),answers:z.array(z.array(z.string())),content:z.string()}),
]);
export type DeferredQuestion = z.infer<typeof question>;

/** Private host transport. Never mount through the renderer/agent engine proxy. */
export function createAlwaysOnDeferredClient(options:{baseUrl:string;token:string;fetch?:typeof fetch}) {
  const base = new URL(options.baseUrl);
  if (base.protocol !== "http:" || !["127.0.0.1","[::1]"].includes(base.hostname) || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("Deferred transport requires a loopback origin");
  if (Buffer.byteLength(options.token)<32) throw new Error("Deferred host token must contain at least 32 bytes");
  const endpoint = new URL("/get3w/deferred",base);
  const send = async (body:unknown,signal?:AbortSignal):Promise<unknown> => {
    const response = await (options.fetch ?? fetch)(endpoint,{method:"POST",headers:{authorization:`Bearer ${options.token}`,"content-type":"application/json"},body:JSON.stringify(body),redirect:"error",signal:signal ?? AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(`Deferred host request failed (${response.status})`);
    return response.json();
  };
  const binding=z.object({workspaceID:z.string(),sessionID:z.string(),paused:z.boolean()});
  return {
    async capabilities() {
      if (!supportsDeferredQuestions(await send({ action: "capabilities" }))) throw new Error("Unsupported deferred host protocol");
    },
    async bind(workspace:{id:string;workspaceType?:string},sessionID:string,paused:boolean,signal?:AbortSignal) {
      if (workspace.workspaceType!=="always-on") throw new Error("Deferred execution requires an always-on workspace");
      const result=binding.parse(await send({action:"bind",workspaceID:workspace.id,sessionID,paused},signal));
      if(result.workspaceID!==workspace.id || result.sessionID!==sessionID)throw new Error("Deferred binding mismatch");
      return result;
    },
    async setPaused(workspaceID:string,sessionID:string,paused:boolean,signal?:AbortSignal) {
      const result=z.object({paused:z.boolean()}).parse(await send({action:"pause",workspaceID,sessionID,paused},signal));
      if(result.paused!==paused)throw new Error("Deferred pause mismatch");
    },
    async list(workspaceID:string,sessionID:string,signal?:AbortSignal) {
      const result=z.object({binding,questions:z.array(question)}).parse(await send({action:"list",workspaceID,sessionID},signal));
      if(result.binding.workspaceID!==workspaceID || result.binding.sessionID!==sessionID || result.questions.some(item=>item.sessionID!==sessionID || (item.status==="committed" || item.status==="cancelled")))throw new Error("Deferred question identity mismatch");
      return result;
    },
    async read(workspaceID:string,sessionID:string,callID:string,signal?:AbortSignal) {
      const result=z.object({binding,question:question.optional()}).parse(await send({action:"read",workspaceID,sessionID,callID},signal));
      if(result.binding.workspaceID!==workspaceID || result.binding.sessionID!==sessionID || result.question && (result.question.sessionID!==sessionID || result.question.callID!==callID))throw new Error("Deferred question identity mismatch");
      return result;
    },
    async answer(workspaceID:string,input:{sessionID:string;messageID:string;callID:string;requestID:string;answerID:string;answers:string[][]},signal?:AbortSignal) {
      const result=question.parse(await send({action:"answer",workspaceID,...input},signal));
      if((result.status==="waiting" || result.status==="cancelled") || result.sessionID!==input.sessionID || result.messageID!==input.messageID || result.callID!==input.callID || result.requestID!==input.requestID || result.answerID!==input.answerID || JSON.stringify(result.answers)!==JSON.stringify(input.answers))throw new Error("Deferred answer identity mismatch");
      return result;
    },
    async cancel(workspaceID:string,input:{sessionID:string;messageID:string;callID:string;requestID:string},signal?:AbortSignal) {
      const result=question.parse(await send({action:"cancel",workspaceID,...input},signal));
      if(result.status!=="cancelled" || result.sessionID!==input.sessionID || result.messageID!==input.messageID || result.callID!==input.callID || result.requestID!==input.requestID)throw new Error("Deferred cancellation identity mismatch");
      return result;
    },
    async resume(workspaceID:string,sessionID:string,callID:string,signal?:AbortSignal) {
      return z.object({resumed:z.boolean()}).parse(await send({action:"resume",workspaceID,sessionID,callID},signal)).resumed;
    },
    async commit(workspaceID:string,sessionID:string,callID:string,signal?:AbortSignal) {
      return z.object({committed:z.boolean()}).parse(await send({action:"commit",workspaceID,sessionID,callID},signal)).committed;
    },
  };
}

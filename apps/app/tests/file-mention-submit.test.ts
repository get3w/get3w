import {expect,test} from "bun:test";
import {draftToParts} from "../src/react-app/domains/session/sync/draft-parts";
import type {ComposerDraft} from "../src/app/types";

test("submitted image references retain visible names and the exact file passed to the engine",async()=>{
 const draft:ComposerDraft={mode:"prompt",text:"修改@output-123.jpg ，将人物换成少女",parts:[{type:"text",text:"修改"},{type:"file",path:"output-123.jpg",label:"output-123.jpg"},{type:"text",text:" ，将人物换成少女"}],attachments:[]};
 const parts=await draftToParts(draft,"/workspace/chat","ses_test",null);
 expect(parts.filter(part=>part.type==="text").map(part=>part.text).join("")).toBe("修改@output-123.jpg ，将人物换成少女");
 expect(parts.find(part=>part.type==="file")).toMatchObject({url:"file:///workspace/chat/output-123.jpg",filename:"output-123.jpg"});
});
test("binary references remain visible while supplying the tool path without an unsupported Read",async()=>{
 const parts=await draftToParts({mode:"prompt",text:"edit @clips/output.mp4",parts:[{type:"text",text:"edit "},{type:"file",path:"clips/output.mp4",label:"output.mp4"}],attachments:[]},"/workspace/chat","ses_test",null);
 expect(parts.filter(part=>part.type==="text").map(part=>part.text).join("")).toContain("@clips/output.mp4");
 expect(parts.some(part=>part.type==="text"&&part.text==="/workspace/chat/clips/output.mp4")).toBe(true);
 expect(parts.some(part=>part.type==="file")).toBe(false);
});
test("model mention token branch also preserves file names with spaces",async()=>{
 const draft:ComposerDraft={mode:"prompt",text:"[attachment unused] 修改@folder/output%20one.jpg",parts:[{type:"file",path:"folder/output one.jpg",label:"output one.jpg"}],attachments:[]};
 const parts=await draftToParts(draft,"/workspace/chat","ses_test",null);
 expect(parts.some(part=>part.type==="text"&&part.text==="@folder/output one.jpg")).toBe(true);
 expect(parts.find(part=>part.type==="file")?.url).toBe("file:///workspace/chat/folder/output%20one.jpg");
});

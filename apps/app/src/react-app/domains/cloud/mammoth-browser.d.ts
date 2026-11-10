declare module "mammoth/mammoth.browser" {
  export function extractRawText(input:{arrayBuffer:ArrayBuffer}):Promise<{value:string;messages:{type:string;message:string}[]}>;
}

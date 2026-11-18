import {resolveSetting} from './model-settings.mjs';

function ratio(value) {
 const match=String(value).match(/^(\d+(?:\.\d+)?)[\s]*[:xX*-][\s]*(\d+(?:\.\d+)?)$/);
 return match&&Number(match[1])>0&&Number(match[2])>0?Number(match[1])/Number(match[2]):null;
}
/** Same logarithmic distance as Xianchou canvas: portrait/landscape errors are symmetric. */
export function matchSourceAspectRatio(width,height,options) {
 if(!(width>0&&height>0))throw Error('Cannot read source image dimensions');
 const candidates=options.filter(value=>ratio(value)!==null);
 if(!candidates.length)return options.find(value=>String(value).toLowerCase()==='auto');
 return candidates.reduce((best,value)=>Math.abs(Math.log(ratio(value)/(width/height)))<Math.abs(Math.log(ratio(best)/(width/height)))?value:best);
}
export function sourceImageSettings(dimensions,schema,selection) {
 const result={};
 const resolution=schema.properties?.resolution;
 if(resolution){
  const field=resolveSetting({options:resolution.enum?.map(value=>({value})),defaultValue:resolution.default,channelOptions:resolution['x-channel-options'],resolutionOptions:resolution['x-resolution-options'],showChannels:resolution['x-show-channels']},selection);
  const choices=field?.options?.filter(option=>/^\d+(?:\.\d+)?k$/i.test(String(option.value)));
  if(choices?.length){
   const edge=Math.max(dimensions.width,dimensions.height);
   result.resolution=choices.reduce((best,item)=>Math.abs(Math.log(Number.parseFloat(String(item.value))*1024/edge))<Math.abs(Math.log(Number.parseFloat(String(best.value))*1024/edge))?item:best).value;
  } else if(field?.defaultValue!==undefined)result.resolution=field.defaultValue;
 }
 const property=schema.properties?.aspect_ratio;
 if(property){
  const field=resolveSetting({options:property.enum?.map(value=>({value})),defaultValue:property.default,channelOptions:property['x-channel-options'],resolutionOptions:property['x-resolution-options'],showChannels:property['x-show-channels'],showResolutions:property['x-show-resolutions']},{...selection,...result});
  const matched=matchSourceAspectRatio(dimensions.width,dimensions.height,field?.options?.map(option=>option.value)??[]);
  if(matched!==undefined)result.aspect_ratio=matched;
 }
 return result;
}

export async function decodeImageDimensions(bytes) {
 const {nativeImage}=await import('electron');
 const image=nativeImage.createFromBuffer(Buffer.from(bytes));
 if(image.isEmpty())throw Error('Cannot read source image dimensions');
 const {width,height}=image.getSize();
 if(!(width>0&&height>0)||width*height>20_000_000)throw Error('Use a readable source image up to 20 megapixels');
 return {width,height};
}
export async function fetchImageDimensions(source,signal,decode=decodeImageDimensions) {
 const url=new URL(source);
 if(!['https:','data:'].includes(url.protocol)||url.username||url.password)throw Error('Use an uploaded HTTPS image reference');
 const {net:electronNet}=await import('electron');
 const response=await electronNet.fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(30_000)]),redirect:'error'});
 if(!response.ok)throw Error('Cannot read source image dimensions');
 const reader=response.body?.getReader();
 if(!reader)throw Error('Cannot read source image dimensions');
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>200*1024*1024)throw Error('Source image exceeds 200 MB');chunks.push(value);}}finally{await reader.cancel();}
 return decode(Buffer.concat(chunks));
}

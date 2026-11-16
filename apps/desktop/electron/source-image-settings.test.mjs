import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchSourceAspectRatio,sourceImageSettings} from './source-image-settings.mjs';

test('matches source geometry using Xianchou logarithmic distance and skips auto',()=>{
 assert.equal(matchSourceAspectRatio(2048,2560,['auto','16:9','4:5','1:1']),'4:5');
 assert.equal(matchSourceAspectRatio(941,1672,['16-9','9-16','1-1']),'9-16');
 assert.equal(matchSourceAspectRatio(2560,2048,['auto','4:5','5:4']),'5:4');
 assert.equal(matchSourceAspectRatio(1000,1000,['auto']),'auto');
 assert.equal(matchSourceAspectRatio(2048,2560,['auto','16:9','3:4','1:1']),'3:4');
 assert.throws(()=>matchSourceAspectRatio(0,10,['1:1']),/dimensions/);
});
test('derives supported resolution and ratio from the source with channel constraints',()=>{
 const schema={properties:{resolution:{enum:['1K','2K','4K'],default:'4K','x-channel-options':{economy:[{value:'1K'},{value:'2K'}]}},aspect_ratio:{enum:['auto','16:9','4:5','3:4'],'x-resolution-options':{'2K':[{value:'auto'},{value:'4:5'}],'4K':[{value:'16:9'}]}}}};
 assert.deepEqual(sourceImageSettings({width:2048,height:2560},schema,{channel:'economy',aspect_ratio:'16:9',resolution:'4K'}),{resolution:'2K',aspect_ratio:'4:5'});
 assert.deepEqual(sourceImageSettings({width:3840,height:2160},schema,{channel:'official'}),{resolution:'4K',aspect_ratio:'16:9'});
});

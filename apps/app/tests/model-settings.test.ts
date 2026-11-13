import {test,expect} from 'bun:test';
import actualSchema from './model-settings-fixture.json';
import {resolveSetting,outputSettingsForSchemas} from '../src/lib/model-settings';

const schema={properties:{
  channel:{enum:['economy','official'],default:'economy'},
  aspect_ratio:{enum:['1:1','16:9']},
  resolution:{enum:['1K'],'x-channel-options':{official:[{value:'1K'},{value:'2K'},{value:'4K'}]}},
  quality:{enum:['low','medium','high','xhigh','max'],'x-show-channels':['official']},
  output_format:{enum:['PNG','JPEG','WebP','SVG','GIF'],'x-show-channels':['official']},
}};
test('Economy and Official use the same rules as Playground',()=>{
  expect(outputSettingsForSchemas([schema]).map(field=>field.name)).toEqual(['channel','aspect_ratio','resolution']);
  const official=outputSettingsForSchemas([schema],{channel:'official'});
  expect(official.map(field=>field.name)).toEqual(['channel','aspect_ratio','resolution','quality','output_format']);
  expect(official.find(field=>field.name==='resolution')?.values).toEqual(['1K','2K','4K']);
  expect(outputSettingsForSchemas([schema],{channel:'economy'}).find(field=>field.name==='resolution')?.values).toEqual(['1K']);
  expect(outputSettingsForSchemas([schema],{channel:'auto'})).toEqual(outputSettingsForSchemas([schema]));
});
test('resolution and channel intersections preserve labels without mutating schemas',()=>{
  const field={options:[{value:'a',label:'A'}],channelOptions:{official:[{value:'a'},{value:'b'}]},resolutionOptions:{'2K':[{value:'b',label:'B'},{value:'c'}]},showChannels:['official'],showResolutions:['2K']};
  expect(resolveSetting(field,{channel:'official',resolution:'2k'})?.options).toEqual([{value:'b',label:'B'}]);
  expect(resolveSetting(field,{channel:'economy',resolution:'2K'})).toBeUndefined();
  expect(resolveSetting(field,{channel:'official',resolution:'4K'})).toBeUndefined();
  expect(field.options).toEqual([{value:'a',label:'A'}]);
  expect(outputSettingsForSchemas([schema],{channel:'official'})).toEqual(outputSettingsForSchemas([schema],{channel:'official'}));
});
test('missing channel metadata does not invent a model-specific visibility rule',()=>{
  expect(outputSettingsForSchemas([{properties:{channel:{enum:['official']},quality:{enum:['high']}}}]).map(field=>field.name)).toEqual(['channel','quality']);
});

test('real API catalog keeps Economy compact and restores all Official parameters',()=>{
 const economy=outputSettingsForSchemas([actualSchema]);
 expect(economy.map(field=>field.name)).toEqual(['channel','aspect_ratio','resolution']);
 const official=outputSettingsForSchemas([actualSchema],{channel:'official'});
 expect(official.map(field=>field.name)).toEqual(['channel','aspect_ratio','quality','resolution','output_format']);
 expect(official.find(field=>field.name==='resolution')?.values).toEqual(['1K','2K','4K']);
 expect(official.find(field=>field.name==='output_format')?.values).toEqual(['png','jpeg','webp','svg','gif']);
});


test('preference options keep Playground schema order through variant intersections',()=>{
 const quality=['low','medium','high','xhigh','max'];
 const variants=[schema,{properties:{quality:{enum:['max','high','medium','low','xhigh']}}}];
 expect(outputSettingsForSchemas(variants,{channel:'official'}).find(field=>field.name==='quality')?.values).toEqual(quality);
 expect(outputSettingsForSchemas([{properties:{quality:{enum:['low','LOW','medium','high','xhigh','max']}}}])[0].values).toEqual(['LOW','medium','high','xhigh','max']);
 expect(outputSettingsForSchemas([schema],{channel:'official'}).find(field=>field.name==='output_format')?.values).toEqual(['PNG','JPEG','WebP','SVG','GIF']);
});

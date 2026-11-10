import {test,expect} from 'bun:test';
import {rememberGenerationPolicy,generationPolicyFor} from '../src/generation-policies';
test('policies bind workspace/session/message and never leak into a later turn',()=>{
 const policy={models:{'text-to-image':{slug:'demo/image',source:'explicit'}},outputs:{'text-to-image':{num_images:'2'}}};
 rememberGenerationPolicy('w','s','message-a',policy);
 expect(generationPolicyFor('w','s','message-a')).toEqual(policy);
 expect(generationPolicyFor('w','s','message-b')).toBeUndefined();
 expect(generationPolicyFor('other','s','message-a')).toBeUndefined();
 expect(generationPolicyFor('w','other','message-a')).toBeUndefined();
 rememberGenerationPolicy('w','s','message-b',undefined);
 expect(generationPolicyFor('w','s','message-b')).toEqual({models:{},outputs:{}});
});
test('rejects malformed host policy',()=>{
 expect(()=>rememberGenerationPolicy('w','s','bad',{models:{image:{slug:'',source:'model-controlled'}},outputs:{}})).toThrow();
});

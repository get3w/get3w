import test from 'node:test';
import assert from 'node:assert/strict';
import {artifactRoute} from './get3w-artifact-route.mjs';
const request = {userId:'user',method:'GET',path:'/v1/apps'};
test('artifact bridge allows only explicit operations and revision queries',()=>{
  assert.equal(artifactRoute(request),'/v1/apps');
  assert.throws(()=>artifactRoute({...request,path:'/v1/apps/art_one/shares'}));
  assert.throws(()=>artifactRoute({...request,method:'POST',path:'/v1/apps/art_one/revoke',body:{userId:'member'}}));
  assert.throws(()=>artifactRoute({...request,path:'/v1/apps/art_one/revoke'}));
  assert.throws(()=>artifactRoute({...request,method:'POST',path:'/v1/apps/art_one/shares'}));
  assert.equal(artifactRoute({...request,path:'/v1/apps/art_one?revisionId=rev_one'}),'/v1/apps/art_one?revisionId=rev_one');
  assert.equal(artifactRoute({...request,method:'POST',path:'/v1/apps/art_one/save',body:{revisionId:'rev_one'}}),'/v1/apps/art_one/save');
});
test('artifact bridge cannot become an authenticated general proxy',()=>{
  for(const path of ['https://evil.test/v1/apps','//evil.test/v1/apps','/v1/apps/../org','/v1/apps?url=https://evil.test','/v1/apps#x','/v1/apps/%2e%2e/me','/v1/me','/v1/apps/art_one/share']){
    assert.throws(()=>artifactRoute({...request,path}),undefined,path);
  }
  assert.throws(()=>artifactRoute({...request,body:{}}));
  assert.throws(()=>artifactRoute({...request,token:'secret'}));
  assert.throws(()=>artifactRoute({...request,method:'POST',body:{html:'x'.repeat(1_500_001)}}));
});

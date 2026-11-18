import {expect,test} from 'bun:test';
import {webToolModelRank} from '../src/lib/web-tool-model-order';
test('tool selectors follow the automatic search model order',()=>{
 const providers=['tinyfish','parallel','bocha','tavily','deepseek','firecrawl','exa'];
 expect(providers.sort((a,b)=>webToolModelRank('search',`${a}/v1/search`)-webToolModelRank('search',`${b}/v1/search`))).toEqual(['deepseek','bocha','exa','firecrawl','parallel','tavily','tinyfish']);
 expect(webToolModelRank('fetch','deepseek/v1/fetch')).toBeLessThan(webToolModelRank('fetch','parallel/v1/fetch'));
});

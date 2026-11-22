import {test,expect} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {EventSourceCatalog} from '../src/react-app/domains/workspace/event-source-catalog';
import {ConnectorEventSources} from '../src/react-app/domains/workspace/connector-event-sources';
import {setLocale} from '../src/i18n';
test('local controls remain available and connectors have their own live catalog',()=>{
 setLocale('zh');const html=renderToStaticMarkup(<EventSourceCatalog onAdd={()=>{}}/>);
 for(const label of ['本地文件','Webhook'])expect(html).toContain(label);
 expect(html).not.toContain('实现中');expect(html.match(/<button/g)).toHaveLength(2);
 const connectors=renderToStaticMarkup(<ConnectorEventSources workspaceId="test" client={{saveAlwaysOnSource:async()=>[],controlAlwaysOnSource:async()=>[]}} onUpdated={()=>{}}/>);
 expect(connectors).toContain('连接来源');expect(connectors).toContain('登录');
});

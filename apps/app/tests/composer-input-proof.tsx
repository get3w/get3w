import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LexicalPromptEditor} from '../src/react-app/domains/session/surface/composer/editor';
import '../src/app/index.css';
const preview='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="teal"/></svg>');
function Proof(){const [value,setValue]=useState('将图片[attachment proof]');return <main className="mx-auto max-w-3xl p-8"><h1>图片后输入测试</h1><div className="mt-8 rounded-2xl border p-4"><LexicalPromptEditor value={value} mentions={{}} attachments={[{id:'proof',name:'test.svg',kind:'image',previewUrl:preview}]} onChange={setValue} onSubmit={()=>{}} submitDisabled={false} placeholder="输入"/></div><output data-testid="draft">{value}</output></main>}
createRoot(document.getElementById('root')!).render(<Proof/>);

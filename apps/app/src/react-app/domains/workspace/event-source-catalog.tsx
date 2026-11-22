import {Button} from '@/components/ui/button';
import {t} from '@/i18n';
export function EventSourceCatalog({onAdd}:{onAdd:(kind:'files'|'webhook')=>void}){
 return <section aria-label={t('workspace.sources.catalog')}><h2 className="mb-3 text-sm font-medium">{t('workspace.sources.catalog')}</h2><div className="divide-y divide-border border-y border-border">
 {(['files','webhook'] as const).map(kind=><div key={kind} className="flex min-h-12 items-center justify-between gap-3 py-3"><span className="text-sm">{t(`workspace.sources.${kind}`)}</span><Button size="sm" variant="outline" onClick={()=>onAdd(kind)}>{t('workspace.inbox.add')}</Button></div>)}

 </div></section>;
}

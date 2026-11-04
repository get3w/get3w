import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localizeMenu, nativeText, setNativeLanguage } from './native-i18n.mjs';
test('native menu roles and custom labels follow the selected language', () => {
 setNativeLanguage('zh');
 const menu = localizeMenu([{label:'File',submenu:[{role:'copy'},{label:'Settings...'}]}]);
 assert.equal(menu[0].label,'文件');
 assert.equal(menu[0].submenu[0].label,'复制');
 assert.equal(menu[0].submenu[0].role,'copy');
 assert.equal(menu[0].submenu[1].label,'设置…');
 setNativeLanguage('en');assert.equal(nativeText('Settings...'),'Settings...');
 assert.throws(()=>setNativeLanguage('fr'));
 setNativeLanguage('zh');
});

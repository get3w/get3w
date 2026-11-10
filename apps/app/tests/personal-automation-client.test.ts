import {test,expect} from 'bun:test';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {createPersonalAutomationClient} from '../src/react-app/domains/automations/personal-automation-client';
import {setLocale} from '../src/i18n';
if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({url:'http://localhost/'});
test('schedule errors explain the correction in the current locale',async()=>{
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async()=>({ok:false,status:422,json:{error:{code:'schedule_has_no_future_run'}}})});
 try {
  setLocale('en');await expect(createPersonalAutomationClient('alice').get('atm_test')).rejects.toThrow('Choose a future run time.');
  setLocale('zh');await expect(createPersonalAutomationClient('alice').get('atm_test')).rejects.toThrow('请选择未来的运行时间。');
 } finally {Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

test('a repeated pagination cursor fails visibly instead of polling forever',async()=>{
 let calls=0;
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async()=>{calls++;return {ok:true,status:200,json:{items:[],nextCursor:'same-cursor'}};}});
 try {
  setLocale('en');await expect(createPersonalAutomationClient('alice').list()).rejects.toThrow('The complete list could not be loaded');
  expect(calls).toBe(2);
 }finally{Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

test('native transport failures display connection recovery instead of IPC details',async()=>{
 Reflect.set(window,'__GET3W_ACCOUNT__',{automations:async()=>{throw Error("Error invoking remote method get3w:auth: fetch failed");}});
 try{setLocale('zh');await expect(createPersonalAutomationClient('alice').list()).rejects.toThrow('无法连接自动化服务。请检查连接后重试。');}
 finally{Reflect.deleteProperty(window,'__GET3W_ACCOUNT__');}
});

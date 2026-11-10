import { afterEach, beforeEach, expect, test } from "bun:test";
import { pickSyncedPreferences, validateSettingsDocument, settingsErrorMessage } from "../src/react-app/domains/cloud/get3w-settings-policy";
import { currentLocale, setLocale } from "../src/i18n";
let previousLocale: ReturnType<typeof currentLocale>;
beforeEach(() => { previousLocale = currentLocale(); setLocale("en"); });
afterEach(() => { setLocale(previousLocale); });
const prefs = {showThinking:false,desktopNotifications:"off",linkOpenDestination:"openwork",keepAwake:true} satisfies Parameters<typeof pickSyncedPreferences>[0];
test("upload and apply both exclude secrets, models, permissions and paths",()=>{
  const untrusted={...prefs, apiKey:"secret",defaultModel:{modelID:"private"},workspace:"/private",askBeforeOpeningLinks:false};
  expect(pickSyncedPreferences(untrusted)).toEqual(prefs);
  expect(validateSettingsDocument({schema_version:1,revision:1,preferences:untrusted}).preferences).toEqual(prefs);
});
test("old schema and malformed cloud data cannot change local preferences",()=>{
  const value={schema_version:1,revision:1,preferences:prefs};
  expect(()=>validateSettingsDocument({...value,schema_version:Reflect.get({bad:2},"bad")})).toThrow("incompatible");
  expect(()=>validateSettingsDocument({...value,revision:-1})).toThrow("incompatible");
  expect(settingsErrorMessage(new Error("Error invoking remote method 'get3w:auth': Error: Get3W is unavailable. Retry when online."))).toBe("Service unavailable. Check your connection and try again.");
});

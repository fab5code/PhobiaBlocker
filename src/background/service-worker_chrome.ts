import {BackgroundManager} from "@/background/BackgroundManager";
import {restoreOptions, updateOptions} from "@/options/commonOptions";
import browser from "webextension-polyfill";

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await browser.runtime.openOptionsPage();
  } else if (details.reason === 'update') {
    await updateOptions();
  }
});

var globalManager;
async function main() {
  const options = await restoreOptions();
  globalManager = new BackgroundManager(options);
  await globalManager.init();
}
main();

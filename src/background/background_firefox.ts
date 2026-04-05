import {BackgroundManager} from "@/background/BackgroundManager";
import {isExtensionMessage, MessageType} from "@/common/messaging";
import {OffscreenManager} from "@/offscreen/OffscreenManager";
import {restoreOptions, updateOptions} from "@/options/commonOptions";
import browser from "webextension-polyfill";

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await browser.runtime.openOptionsPage();
  } else if (details.reason === 'update') {
    await updateOptions();
  }
});

var isReady = false;
browser.runtime.onMessage.addListener((request: unknown) => {
  if (isExtensionMessage(request) && request.message === MessageType.PING_BACKGROUND) {
    return Promise.resolve({isReady: isReady});
  }
});

var globalManager;
var offscreenManager;
async function main() {
  const options = await restoreOptions();
  globalManager = new BackgroundManager(options);
  await globalManager.init();
  offscreenManager = new OffscreenManager(options);
  await offscreenManager.init();
  isReady = true;
}
main();

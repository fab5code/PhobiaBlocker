import {BackgroundManager} from "@/background/BackgroundManager";
import {addBasicListeners} from "@/background/utils";
import {isExtensionMessage, MessageType} from "@/common/messaging";
import {restoreOptions} from "@/options/commonOptions";
import browser from "webextension-polyfill";

addBasicListeners();

var isReady = false;
browser.runtime.onMessage.addListener((request: unknown) => {
  if (isExtensionMessage(request) && request.message === MessageType.PING_BACKGROUND) {
    return Promise.resolve({isReady: isReady});
  }
});

var globalManager;
async function main() {
  const options = await restoreOptions();
  globalManager = new BackgroundManager(options);
  await globalManager.init();
  isReady = true;
}
main();

import {MessageType, type ExtensionMessage, type GetOptionsResponse} from "@/common/messaging";
import {OffscreenManager} from "@/offscreen/OffscreenManager";
import {restoreOptionsFromNewValue} from "@/options/commonOptions";
import browser from "webextension-polyfill";

var offscreenManager;
async function main() {
  const response = await browser.runtime.sendMessage<ExtensionMessage, GetOptionsResponse>({message: MessageType.GET_OPTIONS});
  const options = restoreOptionsFromNewValue(response.storedOptions);
  offscreenManager = new OffscreenManager(options);
  await offscreenManager.init();
  console.log("offscreen: offscreenManager init done")
}
main();

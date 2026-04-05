import {isExtensionMessage, MessageType, sendMessageWithReadiness, type GetOptionsResponse} from "@/common/messaging";
import {OffscreenManager} from "@/offscreen/OffscreenManager";
import {restoreOptionsFromNewValue} from "@/options/commonOptions";
import browser from "webextension-polyfill";

var isReady = false;
browser.runtime.onMessage.addListener((request: unknown) => {
  if (isExtensionMessage(request) && request.message === MessageType.PING_OFFSCREEN) {
    return Promise.resolve({isReady: isReady});
  }
});

var offscreenManager;
async function main() {
  const response = await sendMessageWithReadiness<GetOptionsResponse>({message: MessageType.GET_OPTIONS});
  const options = restoreOptionsFromNewValue(response.storedOptions);
  offscreenManager = new OffscreenManager(options);
  await offscreenManager.init();
  isReady = true;
}
main();

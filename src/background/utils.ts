import {MessageType} from "@/common/messaging";
import {updateOptions} from "@/options/commonOptions";
import browser from "webextension-polyfill";

export function addBasicListeners() {
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      await browser.runtime.openOptionsPage();
    } else if (details.reason === 'update') {
      await updateOptions();
    }
    browser.contextMenus.create({
      id: 'blockImage',
      title: 'Block/Unblock image',
      contexts: ['image']
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'blockImage' && tab?.id) {
      browser.tabs.sendMessage(tab.id, {message: MessageType.BLOCK_UNBLOCK, src: info.srcUrl});
    }
  });
}

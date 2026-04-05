import {isExtensionMessage, MessageType} from "@/common/messaging";
import {ImageManager} from "@/contentScript/ImageManager";
import {restoreOptions} from "@/options/commonOptions";
import browser from "webextension-polyfill";

function addBrowserEventListenersBeforeOptionsRestoring() {
  browser.runtime.onMessage.addListener((request: unknown) => {
    if (!isExtensionMessage(request)) {
      return;
    }
    if (request.message === MessageType.GET_URL && window.self === window.top) {
      return Promise.resolve({url: ImageManager.getUrl(), websiteUrl: document.location.origin});
    }
  });
}

var imageManager;
async function main() {
  addBrowserEventListenersBeforeOptionsRestoring();
  ImageManager.addTemporaryBlockCss();
  const options = await restoreOptions();
  imageManager = new ImageManager(options);
  await imageManager.init();
}
main();

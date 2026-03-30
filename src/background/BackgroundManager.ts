import {isExtensionMessage, MessageType, type ExtensionMessage, type GetUrlResponse} from "@/common/messaging";
import {setTitleAndIcon, State} from "@/common/state";
import {isUrlTrusted, restoreOptionsFromNewValue, type Options} from "@/options/commonOptions";
import {removePopupInfo} from "@/popup/commonPopupInfo";
import browser from "webextension-polyfill";

export class BackgroundManager {
  private options: Options;

  constructor(options: Options) {
    this.options = options;
  }

  async init() {
    console.log('global: init')
    await this.updateFromOptions(true);
    console.log('global: update from options')
    this.addBrowserEventListeners();
    console.log('global: browser event listener')
    this.addBrowserContextMenu();
    console.log('global: context menu')
    await this.setOffscreenDocument();
    console.log('global: offscreen established');
  }

  async updateFromOptions(isInitialization: boolean, hasResumedOrPaused?: boolean, hasTrustedWebsitesChanged?: boolean) {
    if (isInitialization || hasResumedOrPaused || hasTrustedWebsitesChanged) {
      console.log('global: before get tabs')
      const tabs = await browser.tabs.query({active: true, currentWindow: true})
      console.log('global: tabs', tabs)
      if (tabs && tabs[0]) {
        await this.updateCurrentTabTitleAndIcon(tabs[0].id!);
      }
    }
  }

  async addBrowserContextMenu() {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: 'blockImage',
      title: 'Block/Unblock image',
      contexts: ['image']
    });
    browser.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'blockImage' && tab?.id) {
        browser.tabs.sendMessage(tab.id, {message: MessageType.BLOCK_UNBLOCK, src: info.srcUrl});
      }
    });
  }

  addBrowserEventListeners() {
    browser.tabs.onActivated.addListener(async (activeInfo) => {
      await this.updateCurrentTabTitleAndIcon(activeInfo.tabId);
    });

    browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
      if (changeInfo.status === 'loading') {
        const tabs = await browser.tabs.query({active: true, currentWindow: true});
        if (tabs && tabs[0]) {
          console.log('tabs.onUpdated listener', tabId, tabs[0].id)
          await this.updateCurrentTabTitleAndIcon(tabs[0].id!);
        }
      }
    });

    const onOptionsChangedFunction = async (changes: any) => {
      if (!changes.options) {
        return;
      }
      this.options = restoreOptionsFromNewValue(changes.options.newValue);
      let hasResumedOrPaused = false;
      let hasTrustedWebsitesChanged = false;
      if (changes.options.oldValue) {
        hasResumedOrPaused = changes.options.oldValue.paused !== changes.options.newValue.paused;
        hasTrustedWebsitesChanged = changes.options.oldValue.trustedUrlRegexes !== changes.options.newValue.trustedUrlRegexes;
      }
      await this.updateFromOptions(false, hasResumedOrPaused, hasTrustedWebsitesChanged);
      await browser.runtime.sendMessage<ExtensionMessage>({
        message: MessageType.UPDATE_OPTIONS,
        options: this.options
      });
    };
    browser.storage.onChanged.addListener(onOptionsChangedFunction);
    // Firefox needs to have the listener removed otherwise an error is thrown in the console.
    // window.addEventListener("unload", () => {
    //   browser.storage.onChanged.removeListener(onOptionsChangedFunction);
    // }, {once: true});

    browser.tabs.onRemoved.addListener((tabId) => {
      removePopupInfo(tabId);
    });

    browser.runtime.onMessage.addListener((request: unknown, sender: any) => {
      console.log("global: message", request);
      if (!isExtensionMessage(request)) {
        return;
      }
      switch (request.message) {
        case MessageType.GET_TAB_ID:
          return Promise.resolve({id: sender.tab.id});
        case MessageType.GET_OPTIONS:
          return Promise.resolve({storedOptions: this.options});
      }
    });
  }

  async updateCurrentTabTitleAndIcon(tabId: number) {
    let url: string | null = null;
    try {
      const response = await browser.tabs.sendMessage<ExtensionMessage, GetUrlResponse>(tabId, {message: MessageType.GET_URL});
      if (response) {
        url = response.url;
      }
    } catch (error) {
      /* The content script is not always loaded because
       * - a new tab is created: the tab title and icon will be updated when browser.tabs.onUpdated will fire
       * - the tab has no content script because the extension was off, not installed or the page does not allow content script
       */
    }
    let state = State.DEFAULT;
    if (this.options.paused) {
      state = State.PAUSED;
    } else if (isUrlTrusted(this.options, url)) {
      state = State.TRUSTED;
    }
    await setTitleAndIcon(state);
  }

  async setOffscreenDocument(): Promise<void> {
    const url = browser.runtime.getURL('src/offscreen/offscreen.html');

    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [url]
    });

    if (existingContexts.length > 0) {
      return;
    }
    console.log('no offscreen document loaded')

    await chrome.offscreen.createDocument({
      url: 'src/offscreen/offscreen.html',
      reasons: ["DOM_PARSER"],
      justification: "Run DOM-based processing"
    });
  }
}

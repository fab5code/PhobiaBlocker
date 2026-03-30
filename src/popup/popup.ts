import {MessageType, type ExtensionMessage, type GetUrlResponse} from "@/common/messaging";
import {escapeRegex, isUrlTrusted, restoreOptions, saveOptions, type Options} from "@/options/commonOptions";
import {getKey, restorePopupInfo, type PopupInfo} from "@/popup/commonPopupInfo";
import browser from "webextension-polyfill";

class PopupManager {
  popupInfo: PopupInfo | null = null;
  options!: Options;
  url = '';
  websiteUrl = '';
  logoElement = document.getElementById('js-logo') as HTMLImageElement;
  tmElement = document.getElementById('js-tm')!;
  spiderLikeElement = document.getElementById('js-spiderLikeOption') as HTMLInputElement;
  insectLikeElement = document.getElementById('js-insectLikeOption') as HTMLInputElement;
  statsElement = document.getElementById('js-stats')!;
  nbImagesElement = document.getElementById('js-nbImages')!;
  nbAnalysedImagesElement = document.getElementById('js-nbAnalysedImages')!;
  nbBlockedImagesElement = document.getElementById('js-nbBlockedImages')!;
  nbIgnoredImagesElement = document.getElementById('js-nbIgnoredImages')!;
  nbFailedImagesElement = document.getElementById('js-nbFailedImages')!;
  trustSiteElement = document.getElementById('js-trustSite')!;
  trustSiteTrustedElement = document.getElementById('js-trustSite-trusted')!;
  trustSiteNotTrustedElement = document.getElementById('js-trustSite-notTrusted')!;
  trustSiteRegexElement = document.getElementById('js-trustSite-regex')!;
  trustSiteAddElement = document.getElementById('js-trustSite-add')!;
  pauseElement = document.getElementById('js-pause-input') as HTMLInputElement;
  allBlockElement = document.getElementById('js-allBlock-input') as HTMLInputElement;
  advancedOptionsLinkElement = document.getElementById('js-advancedOptions')!;

  async init() {
    this.advancedOptionsLinkElement.addEventListener('click', () => browser.runtime.openOptionsPage());

    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    if (!tabs || !tabs[0]) {
      return;
    }
    const tabId = tabs[0].id!;
    this.initAfterTabId(tabId);
    const popupInfo = await restorePopupInfo(tabId);
    if (popupInfo && !this.popupInfo) {
      this.initPopupInfo(popupInfo);
    }

    let response: GetUrlResponse | null = null;
    try {
      response = await browser.tabs.sendMessage<ExtensionMessage, GetUrlResponse>(tabId, {message: MessageType.GET_URL});
    } catch (error) {
    }
    if (response && response.url && response.websiteUrl) {
      this.initUrl(response.url, response.websiteUrl);
    }

    await this.initOptions();
  }

  initAfterTabId(tabId: number) {
    const popupInfoKey = getKey(tabId);
    let onPopupChangedFunction = (changes: any) => {
      if (popupInfoKey in changes) {
        this.initPopupInfo(changes[popupInfoKey].newValue);
      }
    };
    browser.storage.onChanged.addListener(onPopupChangedFunction);
    // Firefox needs to have the listener removed otherwise an error is thrown in the console.
    window.addEventListener("unload", () => {
      browser.storage.onChanged.removeListener(onPopupChangedFunction);
    }, {once: true});
  }

  initPopupInfo(popupInfo: PopupInfo) {
    this.popupInfo = popupInfo;
    this.updatePopupInfo();
  }

  async initOptions() {
    this.options = await restoreOptions();
    this.spiderLikeElement.addEventListener('click', () => this.manageSpiderLike());
    this.insectLikeElement.addEventListener('click', () => this.manageInsectLike());
    this.trustSiteAddElement.addEventListener('click', () => this.manageAddTrustSite());
    this.pauseElement.addEventListener('click', () => this.managePause());
    this.allBlockElement.addEventListener('click', () => this.manageAllBlock());
    this.updateOptionView();
  }

  initUrl(url: string, websiteUrl: string) {
    this.url = url;
    this.websiteUrl = websiteUrl;
  }

  updateSpiderLikeView() {
    this.spiderLikeElement.checked = this.options.spiderLike;
  }

  async manageSpiderLike() {
    this.options.spiderLike = this.spiderLikeElement.checked;
    await saveOptions(this.options);
  }

  updateInsectLikeView() {
    this.insectLikeElement.checked = this.options.insectLike;
  }

  async manageInsectLike() {
    this.options.insectLike = this.insectLikeElement.checked;
    await saveOptions(this.options);
  }

  updateTrustSiteView() {
    if (!this.url) {
      // Happens on the extension options page for example.
      this.trustSiteElement.classList.add('nodisplay');
      return;
    }
    this.trustSiteElement.classList.remove('nodisplay');
    let trustInfo: {regex?: string} = {};
    if (isUrlTrusted(this.options, this.url, trustInfo)) {
      this.trustSiteTrustedElement.classList.remove('nodisplay');
      this.trustSiteNotTrustedElement.classList.add('nodisplay');
      this.trustSiteRegexElement.textContent = trustInfo.regex!;
    } else {
      this.trustSiteTrustedElement.classList.add('nodisplay');
      this.trustSiteNotTrustedElement.classList.remove('nodisplay');
    }
  }

  async manageAddTrustSite() {
    if (this.options.trustedUrlRegexes) {
      this.options.trustedUrlRegexes += '\n';
    }
    this.options.trustedUrlRegexes += escapeRegex(this.websiteUrl);
    await saveOptions(this.options);
    this.updateTrustSiteView();
  }

  updatePauseView() {
    this.pauseElement.checked = this.options.paused;
  }

  async managePause() {
    this.options.paused = this.pauseElement.checked;
    await saveOptions(this.options);
  }

  updateAllBlockView() {
    this.allBlockElement.checked = this.options.doesAllBlock;
  }

  async manageAllBlock() {
    this.options.doesAllBlock = this.allBlockElement.checked;
    await saveOptions(this.options);
  }

  updateOptionView() {
    if (this.options.isDarkMode) {
      document.body.classList.add('darkMode');
      this.logoElement.src = browser.runtime.getURL('img/logo_darkMode.svg');
    } else {
      document.body.classList.remove('darkMode');
      this.logoElement.src = browser.runtime.getURL('img/logo.svg');
    }

    this.updateSpiderLikeView();
    this.updateInsectLikeView();
    this.updateTrustSiteView();
    this.updatePauseView();
    this.updateAllBlockView();
  }

  hideOrShowElement(element: HTMLElement, doesShow: boolean) {
    if (doesShow) {
      element.classList.remove('nodisplay');
    } else {
      element.classList.add('nodisplay');
    }
  }

  updatePopupInfo() {
    if (!this.popupInfo) {
      this.hideOrShowElement(this.statsElement, false);
      this.hideOrShowElement(this.tmElement, false);
      return;
    }
    this.hideOrShowElement(this.statsElement, true);
    this.nbImagesElement.textContent = this.popupInfo.nbImages.toString();
    this.nbAnalysedImagesElement.textContent = this.popupInfo.nbAnalysedImages.toString();
    this.nbBlockedImagesElement.textContent = this.popupInfo.nbBlockedImages.toString();
    this.nbIgnoredImagesElement.textContent = this.popupInfo.nbIgnoredImages.toString();
    this.hideOrShowElement(this.nbIgnoredImagesElement.parentElement!, this.popupInfo.nbIgnoredImages > 0);
    this.nbFailedImagesElement.textContent = this.popupInfo.nbFailedImages.toString();
    this.hideOrShowElement(this.nbFailedImagesElement.parentElement!, this.popupInfo.nbFailedImages > 0);
    this.hideOrShowElement(this.tmElement, this.popupInfo.isTm);
  }
}

var popupManager;
async function main() {
  popupManager = new PopupManager();
  await popupManager.init();
}
main();

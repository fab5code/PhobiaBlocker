import {MessageType, type ExtensionMessage, type GetTabIdResponse} from "@/common/messaging";
import {getNewPopupInfo, savePopupInfo, type PopupInfo} from "@/popup/commonPopupInfo";
import browser from "webextension-polyfill";

export class PopupHelper {
  /**
   * Only manage popup info if it is the top frame.
   *
   * The lower frames also produce statistics that could be nice to have in the popup.
   * But merging information with the lower frames is some work and does not worth the statistics.
   */
  private popupInfo!: PopupInfo;
  private doesUpdatePopup = window.self === window.top;
  private tabId: number | null = null;

  async resetPopupInfo() {
    this.popupInfo = getNewPopupInfo();
    await this.savePopupInfo();
  }

  async savePopupInfo() {
    if (!this.doesUpdatePopup) {
      return;
    }

    if (this.tabId) {
      await savePopupInfo(this.tabId, this.popupInfo);
    } else {
      const response = await browser.runtime.sendMessage<ExtensionMessage, GetTabIdResponse>({message: MessageType.GET_TAB_ID});
      if (response) {
        this.tabId = response.id;
        await savePopupInfo(this.tabId, this.popupInfo);
      }
    }
  }

  async updateTmInPopup(hasTm: boolean) {
    this.popupInfo.isTm = hasTm;
    await this.savePopupInfo();
  }

  async addImagesInPopup(nb: number) {
    this.popupInfo.nbImages += nb;
    await this.savePopupInfo();
  }

  async addAnalysedImageInPopup() {
    this.popupInfo.nbAnalysedImages++;
    await this.savePopupInfo();
  }

  async addBlockedImageInPopup() {
    this.popupInfo.nbAnalysedImages++;
    this.popupInfo.nbBlockedImages++;
    await this.savePopupInfo();
  }

  async addIgnoredImageInPopup() {
    this.popupInfo.nbAnalysedImages++;
    this.popupInfo.nbIgnoredImages++;
    await this.savePopupInfo();
  }

  async addFailedImageInPopup() {
    this.popupInfo.nbAnalysedImages++;
    this.popupInfo.nbFailedImages++;
    await this.savePopupInfo();
  }
}

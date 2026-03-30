import browser from "webextension-polyfill";

export interface PopupInfo {
  nbImages: number,
  nbAnalysedImages: number,
  nbBlockedImages: number,
  nbIgnoredImages: number,
  nbFailedImages: number,
  isTm: boolean
}

export function getKey(tabId: number) {
  return 'popupInfo-' + tabId;
}

export async function restorePopupInfo(tabId: number): Promise<PopupInfo | undefined> {
  const key = getKey(tabId);
  const result = await browser.storage.local.get(key);
  return result[key] as PopupInfo | undefined
}

export async function savePopupInfo(tabId: number, popupInfo: PopupInfo): Promise<void> {
  await browser.storage.local.set({[getKey(tabId)]: popupInfo});
}

export async function removePopupInfo(tabId: number): Promise<void> {
  await browser.storage.local.remove(getKey(tabId));
}

export function getNewPopupInfo(): PopupInfo {
  return {
    nbImages: 0,
    nbAnalysedImages: 0,
    nbBlockedImages: 0,
    nbIgnoredImages: 0,
    nbFailedImages: 0,
    isTm: false
  };
}

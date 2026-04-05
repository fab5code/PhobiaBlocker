import type {Risk} from "@/common/Risk";
import type {PerformanceInfo} from "@/offscreen/analyseTypes";
import type {StoredOptions} from "@/options/commonOptions";
import browser from "webextension-polyfill";

export enum MessageType {
  GET_URL = 'getUrl',
  GET_TAB_ID = 'getTabId',
  ANALYSE_FROM_DATA = 'analyseFromData',
  ANALYSE_FROM_SRC = 'analyseFromSrc',
  BLOCK_UNBLOCK = 'blockUnblock',
  GET_OPTIONS = 'getOptions',
  UPDATE_OPTIONS = 'updateOptions',
  PING_BACKGROUND = 'pingBackground',
  PING_OFFSCREEN = 'pingOffscreen'
}

interface GetUrlMessage {
  message: MessageType.GET_URL
}

interface GetTabIdMessage {
  message: MessageType.GET_TAB_ID
}

interface AnalyseFromDataMessage {
  message: MessageType.ANALYSE_FROM_DATA,
  data: number[],
  width: number,
  height: number,
  perfoInfo: PerformanceInfo
}

interface AnalyseFromSrcMessage {
  message: MessageType.ANALYSE_FROM_SRC,
  src: string
}

export interface BlockUnblockMessage {
  message: MessageType.BLOCK_UNBLOCK,
  src: string
}

interface GetOptionsMessage {
  message: MessageType.GET_OPTIONS
}

interface UpdateOptionsMessage {
  message: MessageType.UPDATE_OPTIONS,
  options: StoredOptions
}

interface PingBackgroundMessage {
  message: MessageType.PING_BACKGROUND
}

interface PingOffscreenMessage {
  message: MessageType.PING_OFFSCREEN
}

export type ExtensionMessage = GetUrlMessage | GetTabIdMessage | GetOptionsMessage | UpdateOptionsMessage | AnalyseFromDataMessage
  | AnalyseFromSrcMessage | BlockUnblockMessage | PingBackgroundMessage | PingOffscreenMessage;

export interface GetUrlResponse {
  url: string;
  websiteUrl: string;
}

export interface GetTabIdResponse {
  id: number;
}

export interface AnalyseResponse {
  decision: {
    isValid: boolean,
    isIgnored: boolean,
    isTm: boolean,
    risk: Risk
  }
}

export interface GetOptionsResponse {
  storedOptions: StoredOptions
}

export interface PingResponse {
  isReady: boolean
}

export function isExtensionMessage(request: unknown): request is ExtensionMessage {
  return typeof request === 'object' && request !== null && 'message' in request;
}

async function waitUntilReady(message: PingBackgroundMessage | PingOffscreenMessage): Promise<void> {
  const initialDelayMs = 50;
  const maxTotalTimeMs = 60 * 1000;
  const factor = 2;
  const maxDelayMs = 2000;

  let delay = initialDelayMs;
  const startTime = Date.now();
  while (true) {
    try {
      const result = await browser.runtime.sendMessage<ExtensionMessage, PingResponse>(message);
      if (result?.isReady) {
        return;
      }
    } catch {
    }

    const elapsed = Date.now() - startTime;

    if (elapsed + delay > maxTotalTimeMs) {
      throw new Error(`Timeout waiting for ${message.message} to be ready`);
    }

    const jitter = delay * 0.2 * Math.random();
    await new Promise((r) => setTimeout(r, delay + jitter));
    delay = Math.min(delay * factor, maxDelayMs);
  }
}

export async function sendMessageWithReadiness<TResponse>(message: ExtensionMessage, doesNeedOffscreen = false): Promise<TResponse> {
  try {
    const result = await browser.runtime.sendMessage<ExtensionMessage, TResponse>(message);
    if (result) {
      return result;
    }
  } catch (error: any) {
    const isBackgroundUnactive = typeof error?.message === "string" && error.message.includes("Receiving end does not exist");
    if (!isBackgroundUnactive) {
      throw error;
    }
  }
  await waitUntilReady({message: MessageType.PING_BACKGROUND});
  if (doesNeedOffscreen && __BROWSER__ === "chrome") {
    await waitUntilReady({message: MessageType.PING_OFFSCREEN});
  }
  return await browser.runtime.sendMessage<ExtensionMessage, TResponse>(message);
}

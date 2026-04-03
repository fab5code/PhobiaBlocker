import type {Risk} from "@/common/Risk";
import type {PerformanceInfo} from "@/offscreen/analyseTypes";
import type {StoredOptions} from "@/options/commonOptions";

export enum MessageType {
  GET_URL = 'getUrl',
  GET_TAB_ID = 'getTabId',
  ANALYSE_FROM_DATA = 'analyseFromData',
  ANALYSE_FROM_SRC = 'analyseFromSrc',
  BLOCK_UNBLOCK = 'blockUnblock',
  GET_OPTIONS = 'getOptions',
  UPDATE_OPTIONS = 'updateOptions'
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

interface GetOptions {
  message: MessageType.GET_OPTIONS
}

interface UpdateOptions {
  message: MessageType.UPDATE_OPTIONS,
  options: StoredOptions
}

export type ExtensionMessage = GetUrlMessage | GetTabIdMessage | GetOptions | UpdateOptions | AnalyseFromDataMessage | AnalyseFromSrcMessage | BlockUnblockMessage;

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

export function isExtensionMessage(request: unknown): request is ExtensionMessage {
  return typeof request === 'object' && request !== null && 'message' in request;
}

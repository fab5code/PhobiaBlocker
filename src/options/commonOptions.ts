import {ExecutionProvider} from "@/common/ExecutionProvider";
import {getIdFromWnid, getWnidFromId} from "@/common/imageNetClasses";
import {PreprocessType, type MlModel} from "@/common/MlModel";
import {Risk} from "@/common/Risk";
import browser from "webextension-polyfill";

// The options mutable data is kept nearly as a simple json instead of a class so as to make its storage easy.
export interface StoredOptions {
  spiderLike: boolean,
  insectLike: boolean,
  wnidIndexes: string[],
  modelIndex: number,
  risk: Risk,
  trustedUrlRegexes: string,
  trustedRegexes: string,
  blockedRegexes: string,
  paused: boolean,
  doesAllBlock: boolean,
  isDarkMode: boolean,
  doesUseDecisionCache: boolean,
  doesPersistDecisionCache: boolean,
  executionProvider: ExecutionProvider,
  wasChangedByOptionsManager: boolean
};

export interface Options extends StoredOptions {
  wnids: Set<string>
}

export const models: MlModel[] = [
  {
    path: browser.runtime.getURL('./model/mobilenet_v4.onnx'),
    name: 'mobilenet_v4',
    preprocessType: PreprocessType.CHW_NORMALIZED,
    doesNeedSoftmax: true,
    info: 'Fastest'
  },
  {
    path: browser.runtime.getURL('./model/efficientnet-lite4-11.onnx'),
    name: 'efficientnet-lite4-11',
    preprocessType: PreprocessType.HWC_CENTERED,
    doesNeedSoftmax: false,
    info: 'Most accurate'
  }
];
export const defaultModelIndex = 0;
export const defaultRisk = Risk.LOW;

export async function restoreOptions(): Promise<Options> {
  const result = await browser.storage.sync.get('options') as {options?: StoredOptions};
  const options: StoredOptions = result.options ?? {
    spiderLike: true,
    insectLike: false,
    wnidIndexes: [],
    modelIndex: defaultModelIndex,
    risk: defaultRisk,
    trustedUrlRegexes: '',
    trustedRegexes: '',
    blockedRegexes: '',
    paused: false,
    doesAllBlock: false,
    isDarkMode: true,
    doesUseDecisionCache: true,
    doesPersistDecisionCache: true,
    executionProvider: __BROWSER__ === 'chrome' ? ExecutionProvider.WEBGPU : ExecutionProvider.WASM,
    wasChangedByOptionsManager: false
  };
  const wnids = new Set(options.wnidIndexes.map(index => getWnidFromId(index)));
  return {
    ...options,
    wnids: wnids
  };
}

export function restoreOptionsFromNewValue(options: Options | StoredOptions): Options {
  (options as Options).wnids = new Set(options.wnidIndexes.map(index => getWnidFromId(index)));
  return options as Options;
}

export async function saveOptions(options: Options, wasChangedByOptionsManager = false): Promise<void> {
  options.wnidIndexes = [];
  options.wnids.forEach((wnid) => {
    const id = getIdFromWnid(wnid)
    if (id) {
      options.wnidIndexes.push(id);
    }
  });
  options.wasChangedByOptionsManager = wasChangedByOptionsManager;
  await browser.storage.sync.set({options: options});
}

export async function updateOptions(): Promise<void> {
  const options: any = await restoreOptions();
  let doesNeedUpdate = false;

  if ('model' in options) {
    delete options.model;
    doesNeedUpdate = true;
  }
  if (!Number.isInteger(options.modelIndex) || options.modelIndex < 0 || options.modelIndex >= models.length) {
    options.modelIndex = defaultModelIndex;
    options.risk = defaultRisk;
    doesNeedUpdate = true;
  }
  if (!Number.isInteger(options.risk) || options.risk < Risk.VERY_LOW || options.risk > Risk.VERY_HIGH) {
    options.risk = defaultRisk;
    doesNeedUpdate = true;
  }

  if (!('trustedUrlRegexes' in options)) {
    options.trustedUrlRegexes = '';
    doesNeedUpdate = true;
  }
  if ('trustedWebsites' in options) {
    if (Array.isArray(options.trustedWebsites)) {
      if (options.trustedUrlRegexes) {
        options.trustedUrlRegexes += '\n';
      }
      options.trustedUrlRegexes += options.trustedWebsites.map((hostname: string) => escapeRegex(hostname)).join('\n');
    }
    delete options.trustedWebsites;
    doesNeedUpdate = true;
  }
  if (typeof options.trustedRegexes !== 'string') {
    if (Array.isArray(options.trustedRegexes)) {
      options.trustedRegexes = options.trustedRegexes.join('\n');
    } else {
      options.trustedRegexes = '';
    }
    doesNeedUpdate = true;
  }
  if (typeof options.blockedRegexes !== 'string') {
    if (Array.isArray(options.blockedRegexes)) {
      options.blockedRegexes = options.blockedRegexes.join('\n');
    } else {
      options.blockedRegexes = '';
    }
    doesNeedUpdate = true;
  }

  if (!('doesAllBlock' in options)) {
    options.doesAllBlock = false;
    doesNeedUpdate = true;
  }
  if (!('doesUseDecisionCache' in options)) {
    options.doesUseDecisionCache = true;
    doesNeedUpdate = true;
  }
  if (!('doesPersistDecisionCache' in options)) {
    options.doesPersistDecisionCache = true;
    doesNeedUpdate = true;
  }
  if (!('executionProvider' in options)) {
    options.executionProvider = __BROWSER__ === 'chrome' ? ExecutionProvider.WEBGPU : ExecutionProvider.WASM;
    doesNeedUpdate = true;
  }

  if (doesNeedUpdate) {
    await saveOptions(options);
  }
}

export function getRiskDescription(risk: Risk): string {
  switch (risk) {
    case Risk.VERY_LOW:
      return 'Block at any risk';
    case Risk.LOW:
      return 'Block at low risk or above';
    case Risk.MEDIUM:
      return 'Block at medium risk or above';
    case Risk.HIGH:
      return 'Block at high risk or above';
    case Risk.VERY_HIGH:
      return 'Block only at very high risk';
  }
}

export function getRiskAssessmentDescription(assessment: Risk): string {
  switch (assessment) {
    case Risk.VERY_LOW:
      return 'very low';
    case Risk.LOW:
      return 'low';
    case Risk.MEDIUM:
      return 'medium';
    case Risk.HIGH:
      return 'high';
    case Risk.VERY_HIGH:
      return 'very high';
  }
}

export function escapeRegex(value: string): string {
  return value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export function isUrlTrusted(options: Options, url: string | null, info: {regex?: string} = {}) {
  if (!url) {
    return false;
  }
  const regexValues = options.trustedUrlRegexes.trim().split('\n');
  for (let i = 0; i < regexValues.length; i++) {
    let regexValue = regexValues[i].trim();
    if (!regexValue) {
      continue;
    }
    let regex = new RegExp(regexValue, 'i');
    if (regex.test(url)) {
      info.regex = regexValue;
      return true;
    }
  }
  return false;
}

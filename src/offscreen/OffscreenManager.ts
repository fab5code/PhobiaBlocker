import {getMaxNbImagesInAnalyse} from "@/common/concurrency";
import {insectLikeIds, spiderLikeIds} from "@/common/imageNetIds";
import {isExtensionMessage, MessageType} from "@/common/messaging";
import {getImageData, MIN_IMAGE_WIDTH_AND_HEIGHT} from "@/contentScript/imageDataHelper";
import type {AnalyseImageInfo, Decision, PerformanceInfo} from "@/offscreen/analyseTypes";
import {DecisionCache} from "@/offscreen/DecisionCache";
import {ImageAnalyser} from "@/offscreen/ImageAnalyser";
import {RiskAssessment} from "@/offscreen/RiskAssessment";
import {setsEqual} from "@/offscreen/utils";
import {models, restoreOptionsFromNewValue, type Options, type StoredOptions} from "@/options/commonOptions";
import browser from "webextension-polyfill";

interface RequestAnalyseInfo {
  imageInfo: AnalyseImageInfo,
  cacheKey: string | null,
  isLabelInProcess: boolean,
  perfoInfo: PerformanceInfo,
  resolve: (result: {decision: Decision}) => void
}

interface RequestProcessInfo {
  src: string,
  resolve: (result: {decision: Decision}) => void
}

export class OffscreenManager {
  private analyser = new ImageAnalyser();
  private isAnalyserWorking = false;
  /**
   * Calls to analyse an image are buffered so as to avoid too much strain on images loading and model processing.
   *
   * There is also a similar mechanism on the content script but calls from many tabs could add up.
   * It helps with network throttle.
   */
  private maxNbImagesInProcess = getMaxNbImagesInAnalyse();
  private imagesWaitingForProcess: RequestProcessInfo[] = [];
  private imagesWaitingForAnalyse: RequestAnalyseInfo[] = [];
  private decisionCache = new DecisionCache();
  private options: Options;
  private nbImagesInProcess = 0;

  constructor(options: Options) {
    this.options = options;
  }

  async init() {
    await this.updateFromOptions(true);
    this.addBrowserEventListeners();
    await this.decisionCache.init();
  }

  async updateFromOptions(isInitialization: boolean, hasModelChanged?: boolean, hasExecutionProviderChanged?: boolean,
    hasDecisionCacheDeactivated?: boolean, doesNotPersistDecisionCacheAnymore?: boolean) {
    const newBlockedIds = new Set<string>();
    this.options.wnidIndexes.forEach(newBlockedIds.add, newBlockedIds);
    if (this.options.spiderLike) {
      spiderLikeIds.forEach(newBlockedIds.add, newBlockedIds);
    }
    if (this.options.insectLike) {
      insectLikeIds.forEach(newBlockedIds.add, newBlockedIds);
    }
    const areBlockedIdsUpdated = !isInitialization && !setsEqual(newBlockedIds, this.analyser.blockedIds);
    this.analyser.blockedIds = newBlockedIds;

    this.decisionCache.doesPersist = this.options.doesPersistDecisionCache;
    if (hasModelChanged || hasDecisionCacheDeactivated || areBlockedIdsUpdated) {
      this.decisionCache.clear();
    }
    if (doesNotPersistDecisionCacheAnymore) {
      this.decisionCache.clearPersistence();
    }

    if (isInitialization || hasModelChanged || hasExecutionProviderChanged || this.analyser.session === null) {
      await this.analyser.initSession(models[this.options.modelIndex], this.options.executionProvider);
      console.log('Session with Machine Learning model', models[this.options.modelIndex].name, 'in', this.options.executionProvider, 'ready');
    }
  }

  async updateOptions(newStoredOptions: StoredOptions) {
    const newOptions = restoreOptionsFromNewValue(newStoredOptions);
    const hasModelChanged = this.options.modelIndex !== newOptions.modelIndex;
    const hasExecutionProviderChanged = this.options.executionProvider !== newOptions.executionProvider;
    const hasDecisionCacheDeactivated = this.options.doesUseDecisionCache && !newOptions.doesUseDecisionCache;
    const doesNotPersistDecisionCacheAnymore = this.options.doesPersistDecisionCache && !newOptions.doesPersistDecisionCache;
    this.options = newOptions;
    await this.updateFromOptions(false, hasModelChanged, hasExecutionProviderChanged, hasDecisionCacheDeactivated, doesNotPersistDecisionCacheAnymore);
  }

  addBrowserEventListeners() {
    browser.runtime.onMessage.addListener((request: unknown) => {
      if (!isExtensionMessage(request)) {
        return;
      }
      switch (request.message) {
        case MessageType.ANALYSE_FROM_DATA:
          return Promise.resolve(this.analyseImageFromData({data: new Uint8Array(request.data), width: request.width, height: request.height},
            false, request.perfoInfo));
        case MessageType.ANALYSE_FROM_SRC:
          return Promise.resolve(this.analyseImageFromSrc(request.src));
      }
      if (__BROWSER__ === 'chrome' && request.message === MessageType.UPDATE_OPTIONS) {
        return Promise.resolve(this.updateOptions(request.options));
      }
    });

    if (__BROWSER__ === 'firefox') {
      const onOptionsChangedFunction = async (changes: any) => {
        if (!changes.options) {
          return;
        }
        await this.updateOptions(changes.options.newValue);
      };
      browser.storage.onChanged.addListener(onOptionsChangedFunction);
    }
  }

  logPerfoInfo(perfoInfo: PerformanceInfo) {
    const total = perfoInfo.centerCropDuration + perfoInfo.modelPreprocessingDuration + perfoInfo.modelRunDuration + perfoInfo.decisionDuration;
    console.log('Total', total.toFixed(1) + 'ms', 'centerCrop', perfoInfo.centerCropDuration.toFixed(1) + 'ms',
      'modelPrep', perfoInfo.modelPreprocessingDuration.toFixed(1) + 'ms', 'run', perfoInfo.modelRunDuration.toFixed(1) + 'ms',
      'decision', perfoInfo.decisionDuration.toFixed(1) + 'ms', 'Proba', perfoInfo.probability.toFixed(2));
  }

  isAutomaticBlockPaused() {
    return this.options.paused || this.options.doesAllBlock;
  }

  clearPausedAutomaticBlock() {
    this.nbImagesInProcess = 0;
    this.imagesWaitingForProcess = [];
    this.imagesWaitingForAnalyse = [];
  }

  async analyseImageFromData(imageInfo: AnalyseImageInfo, isLabelInProcess: boolean, perfoInfo: PerformanceInfo): Promise<{decision: Decision}> {
    return new Promise(async (resolve) => {
      if (this.analyser.blockedIds.size === 0) {
        resolve({decision: {isValid: true, risk: RiskAssessment.NONE}});
        if (isLabelInProcess) {
          this.nbImagesInProcess--;
          await this.afterProcessImageCallback();
        }
        return;
      }

      let cacheKey: string | null = null;
      if (this.options.doesUseDecisionCache) {
        cacheKey = await this.decisionCache.computeKey(imageInfo);
        const cacheDecision = cacheKey ? this.decisionCache.getDecision(cacheKey) : null;
        if (cacheDecision) {
          resolve({decision: {isValid: true, risk: cacheDecision.risk, isTm: cacheDecision.isTm}});
          console.log('Cache hit', cacheDecision, 'centerCrop', perfoInfo.centerCropDuration.toFixed(1) + 'ms');
          if (isLabelInProcess) {
            this.nbImagesInProcess--;
            await this.afterProcessImageCallback();
          }
          return;
        }
      }
      const result = await this.tryAnalyseImage(imageInfo, cacheKey, isLabelInProcess, perfoInfo);
      resolve(result);
    });
  }

  async afterAnalyseImageCallback() {
    if (this.imagesWaitingForAnalyse.length === 0 || !this.canAnalyseImageNow()) {
      return;
    }
    const requestInfo = this.imagesWaitingForAnalyse.shift()!;
    const result = await this.tryAnalyseImage(requestInfo.imageInfo, requestInfo.cacheKey, requestInfo.isLabelInProcess, requestInfo.perfoInfo);
    requestInfo.resolve(result);
    await this.afterAnalyseImageCallback();
  }

  canAnalyseImageNow() {
    return !this.isAnalyserWorking;
  }

  tryAnalyseImage(imageInfo: AnalyseImageInfo, cacheKey: string | null, isLabelInProcess: boolean,
    perfoInfo: PerformanceInfo): Promise<{decision: Decision}> {
    return new Promise(async (resolve) => {
      if (this.isAutomaticBlockPaused()) {
        this.clearPausedAutomaticBlock();
        return;
      }

      if (!this.canAnalyseImageNow()) {
        this.imagesWaitingForAnalyse.push({
          imageInfo: imageInfo,
          cacheKey: cacheKey,
          isLabelInProcess: isLabelInProcess,
          perfoInfo: perfoInfo,
          resolve: resolve
        });
        return;
      }

      this.isAnalyserWorking = true;
      const decision = await this.analyser.analyseImage(imageInfo.data, imageInfo.width, imageInfo.height, perfoInfo);

      resolve({decision: decision});

      this.isAnalyserWorking = false;
      await this.decisionCache.set(cacheKey, {risk: decision.risk!, isTm: decision.isTm!});
      this.logPerfoInfo(perfoInfo);
      await this.afterAnalyseImageCallback();
      if (isLabelInProcess) {
        this.nbImagesInProcess--;
        await this.afterProcessImageCallback();
      }
    });
  }

  analyseImageFromSrc(src: string): Promise<{decision: Decision}> {
    return new Promise(async (resolve) => {
      if (this.analyser.blockedIds.size === 0) {
        resolve({decision: {isValid: true, risk: RiskAssessment.NONE, isTm: false}});
        return;
      }

      if (this.nbImagesInProcess >= this.maxNbImagesInProcess) {
        this.imagesWaitingForProcess.push({src: src, resolve: resolve});
        return;
      }

      this.nbImagesInProcess++;

      const imageObject = new Image();
      imageObject.crossOrigin = '';
      imageObject.onerror = () => {
        resolve({decision: {isValid: false}});
        this.nbImagesInProcess--;
        this.afterProcessImageCallback();
      };
      imageObject.onload = async () => {
        if (imageObject.width <= MIN_IMAGE_WIDTH_AND_HEIGHT || imageObject.height <= MIN_IMAGE_WIDTH_AND_HEIGHT) {
          resolve({decision: {isValid: true, isIgnored: true}});
          this.nbImagesInProcess--;
          this.afterProcessImageCallback();
        }
        let imageData: ImageData;
        const perfoInfo = {} as PerformanceInfo;
        try {
          const beforeCenterCropTime = performance.now();
          imageData = await getImageData(imageObject, imageObject.width, imageObject.height);
          perfoInfo.centerCropDuration = performance.now() - beforeCenterCropTime;
        } catch (error) {
          resolve({decision: {isValid: false}});
          this.nbImagesInProcess--;
          this.afterProcessImageCallback();
          return;
        }
        const result = await this.analyseImageFromData({
          data: new Uint8Array(imageData.data.buffer),
          width: imageData.width,
          height: imageData.height
        }, true, perfoInfo);
        resolve(result);
      };
      imageObject.src = src;
      return;
    });
  }

  async afterProcessImageCallback() {
    if (this.isAutomaticBlockPaused()) {
      this.clearPausedAutomaticBlock();
      return;
    }

    if (this.imagesWaitingForProcess.length === 0 || this.nbImagesInProcess >= this.maxNbImagesInProcess) {
      return;
    }
    const requestInfo = this.imagesWaitingForProcess.shift()!;
    const result = await this.analyseImageFromSrc(requestInfo.src);
    requestInfo.resolve(result);
    await this.afterProcessImageCallback();
  }
}

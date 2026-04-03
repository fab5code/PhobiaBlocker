import {getMaxNbImagesInAnalyse} from "@/common/concurrency";
import {tmId} from "@/common/imageNetIds";
import {isExtensionMessage, MessageType, type AnalyseResponse, type BlockUnblockMessage, type ExtensionMessage} from "@/common/messaging";
import {getImageData, MIN_IMAGE_WIDTH_AND_HEIGHT} from "@/contentScript/imageDataHelper";
import {ImageInfo, isSvgImageElement} from "@/contentScript/ImageInfo";
import {PopupHelper} from "@/contentScript/PopupHelper";
import type {PerformanceInfo} from "@/offscreen/analyseTypes";
import {getRiskAssessmentDescription, isUrlTrusted, restoreOptionsFromNewValue, type Options} from "@/options/commonOptions";
import browser from "webextension-polyfill";

function getElementWidth(element: HTMLImageElement | SVGImageElement): number {
  if (element instanceof SVGImageElement) {
    return element.width.baseVal.value;
  }
  return element.width;
}

function getElementHeight(element: HTMLImageElement | SVGImageElement): number {
  if (element instanceof SVGImageElement) {
    return element.height.baseVal.value;
  }
  return element.height;
}

export class ImageManager {
  public options: Options;
  /**
   * One svg filter must be initialised to censor svg images.
   */
  public isSvgFilterPlaced = false;
  public trustedRegexes: RegExp[] = [];
  public blockedRegexes: RegExp[] = [];

  /**
   * To temporary block elements as fast as possible css is injected into the paged before DOM load.
   *
   * The options (or user preferences) are needed to start working on the page but getting the options
   * is asynchronous so without the injected css images can sometimes appear briefly like a blink.
   * The injected css prevents this image blink.
   *
   * The injected css is removed once the options are restored.
   *
   * A unique id to fetch back the <style> created to temporary block images before analysing them.
   */
  private static temporaryBlockCssElementId = 'PhobiaBlocker_temporaryBlockCss_ee5f71b4-14ab-4f78-9d1d-06558a643b45';
  private static temporaryBlockImagesCss = 'img, svg { filter: brightness(0%) contrast(4242%) !important; background-color: #000 !important; transition: none !important; }';

  private isWebsiteTrusted = false;
  private nbTm = 0;
  /**
   * List of all the images currently detected.
   */
  private allImages: ImageInfo[] = [];
  /**
   * Calls to analyse images are buffered to avoid too many unfinished calls to background.
   *
   * In case the page is no longer relevant (because of an option change or the page is deleted)
   * numerous useless calls to background are avoided.
   */
  private maxNbImagesInAnalyse = getMaxNbImagesInAnalyse();
  private nbImagesInAnalyse = 0;
  private imagesWaitingForAnalyse: {image: ImageInfo, id: number, analyseFromSrc: boolean}[] = [];
  private popupHelper = new PopupHelper();
  private globalObserver!: MutationObserver;

  static addTemporaryBlockCss() {
    const styleElement = document.createElement("style");
    styleElement.type = 'text/css';
    styleElement.id = ImageManager.temporaryBlockCssElementId;
    styleElement.appendChild(document.createTextNode(ImageManager.temporaryBlockImagesCss));
    // Adding the style element in head would be cleaner but it does not exist at this point.
    document.documentElement.appendChild(styleElement);
  }

  static removeTemporaryBlockCss() {
    const styleElement = document.getElementById(ImageManager.temporaryBlockCssElementId);
    if (styleElement) {
      styleElement.parentNode!.removeChild(styleElement);
    }
  }

  static getUrl(): string {
    return window.location.href;
  }

  static isCorsSensitive(imageSrc: string) {
    if (__BROWSER__ === "firefox") {
      /* On firefox content script can also make cors requests with the right permission.
       * On chrome only background can do cors requests with the right permission
       */
      return false;
    }
    const imageUrl = new URL(imageSrc);
    return imageUrl.origin !== document.location.origin;
  }

  constructor(options: Options) {
    this.options = options;
  }

  async init() {
    this.isWebsiteTrusted = isUrlTrusted(this.options, ImageManager.getUrl());
    this.updateRegexes();
    await this.popupHelper.resetPopupInfo();
    this.addBrowserEventListeners();

    this.globalObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(async (node) => {
          if ((node instanceof HTMLImageElement) || (node instanceof SVGImageElement)) {
            await this.manageNewImage(node);
          } else if (node instanceof Element) {
            // This is necessary because added nodes can have children. The options 'childList' and 'subtree' could be misunderstood.
            const newImageElements = (Array.from(node.querySelectorAll('img')) as (HTMLImageElement | SVGImageElement)[])
              .concat(Array.from(node.querySelectorAll('image')));
            for (const newImageElement of newImageElements) {
              await this.manageNewImage(newImageElement);
            }
          }
        });
      }
    });

    if (!this.isAutomaticBlockPaused()) {
      if (document.body) {
        const nbNewImages = this.addAllPresentImages(false, false);
        await this.popupHelper.addImagesInPopup(nbNewImages);
        this.putImagesToWait(this.allImages);
        await this.manageImages(this.allImages);
      }
      this.globalObserver.observe(document.documentElement, {childList: true, subtree: true});
    }
    if (!this.options.doesAllBlock) {
      ImageManager.removeTemporaryBlockCss();
    }
  }

  updateRegexes() {
    let that = this;

    this.options.trustedRegexes.trim().split('\n').forEach((regexValue) => {
      regexValue = regexValue.trim();
      if (!regexValue) {
        return;
      }
      that.trustedRegexes.push(new RegExp(regexValue, 'i'));
    });
    this.options.blockedRegexes.trim().split('\n').forEach((regexValue) => {
      regexValue = regexValue.trim();
      if (!regexValue) {
        return;
      }
      that.blockedRegexes.push(new RegExp(regexValue, 'i'));
    });
  }

  addAllPresentImages(doesCheckDuplicate: boolean, doesProcessImageChange: boolean): number {
    if (!document.body) {
      return 0;
    }

    if (doesProcessImageChange) {
      for (const image of this.allImages) {
        if (image.hasChanged()) {
          this.processImageChange(image);
        }
      }
    }

    const imageElements = (Array.from(document.body.querySelectorAll('img')) as (HTMLImageElement | SVGImageElement)[])
      .concat(Array.from(document.body.querySelectorAll('image')));
    let nbNewImages = 0;
    for (const element of imageElements) {
      let doesIgnoreElement = false;
      if (doesCheckDuplicate) {
        for (const image of this.allImages) {
          if (image.element.isSameNode(element)) {
            doesIgnoreElement = true;
            break;
          }
        }
      }
      if (doesIgnoreElement) {
        continue;
      }
      const image = new ImageInfo(this, element);
      this.allImages.push(image);
      if (!image.isInternal) {
        nbNewImages++;
      }
    }
    return nbNewImages;
  }

  async manageNewImage(node: HTMLImageElement | SVGImageElement) {
    for (const image of this.allImages) {
      if (image.element.isSameNode(node)) {
        return;
      }
    }

    const image = new ImageInfo(this, node);
    this.allImages.push(image);
    if (!image.isInternal) {
      await this.popupHelper.addImagesInPopup(1);
    }

    image.putToWait();
    await this.manageImage(image);
  }

  async processImageChange(image: ImageInfo) {
    if (image.isTm) {
      this.nbTm--;
      if (this.nbTm === 0) {
        await this.popupHelper.updateTmInPopup(false);
      }
    }
    const didNeedAnalysing = image.doesNeedAnalysing;

    image.reset();
    if (!image.isInternal && !didNeedAnalysing) {
      await this.popupHelper.addImagesInPopup(1);
    }
  }

  addImageObserver(image: ImageInfo) {
    if (image.observer) {
      return;
    }
    image.observer = new MutationObserver(async () => {
      await this.processImageChange(image);
      image.putToWait();
      this.manageImage(image);
    });
    image.observe();
  }

  putImagesToWait(images: ImageInfo[]) {
    for (const image of images) {
      image.putToWait();
    }
  }

  async manageImages(images: ImageInfo[]) {
    for (const image of images) {
      await this.manageImage(image);
    }
  }

  hasNothingToAutomaticBlock() {
    return !this.options.spiderLike && !this.options.insectLike && this.options.wnidIndexes.length === 0;
  }

  isAutomaticBlockPaused() {
    return this.options.paused || this.isWebsiteTrusted || this.options.doesAllBlock;
  }

  shouldStopProcess(image: ImageInfo, id: number): boolean {
    // An image can become ignored because of manual blocking.
    return image.id !== id || this.isAutomaticBlockPaused() || image.isIgnored;
  }

  async manageImage(image: ImageInfo) {
    this.addImageObserver(image);

    if (image.isInternal) {
      return;
    }

    if (image.isIgnored) {
      if (image.isRegexBlocked) {
        await this.popupHelper.addBlockedImageInPopup();
      } else {
        await this.popupHelper.addIgnoredImageInPopup();
      }
      return;
    }

    if (this.hasNothingToAutomaticBlock() || !image.src) {
      await this.unblockImageAsAnalysed(image);
      return;
    }

    if (!isSvgImageElement(image.element) && image.element.complete && image.element.naturalHeight === 0) {
      // The image is loaded but it has an error.
      await this.unblockImageAsAnalysed(image);
      return;
    }

    if (ImageManager.isCorsSensitive(image.src)) {
      this.requestAnalyseFromSrc(image, image.id);
      return;
    }

    if (!isSvgImageElement(image.element) && image.element.complete) {
      await this.analyseImage(image, image.id);
      return;
    }

    const previousId = image.id;
    let onLoadImageCallback: () => void;
    let onErrorImageCallback: () => void;
    onLoadImageCallback = async () => {
      image.element.removeEventListener('load', onLoadImageCallback);
      image.element.removeEventListener('error', onErrorImageCallback);
      await this.analyseImage(image, previousId);
    };
    onErrorImageCallback = async () => {
      image.element.removeEventListener('load', onLoadImageCallback);
      image.element.removeEventListener('error', onErrorImageCallback);
      if (this.shouldStopProcess(image, previousId)) {
        return;
      }
      await this.unblockImageAsAnalysed(image);
    };
    image.element.addEventListener('load', onLoadImageCallback);
    image.element.addEventListener('error', onErrorImageCallback);
  }

  async unblockImageAsAnalysed(image: ImageInfo) {
    image.doesNeedAnalysing = false;
    image.unblock();
    await this.popupHelper.addAnalysedImageInPopup();
  }

  async unblockImageAsFailed(image: ImageInfo) {
    image.doesNeedAnalysing = false;
    image.unblock();
    await this.popupHelper.addFailedImageInPopup();
  }

  async afterImageAnalyseCallback() {
    if (this.isAutomaticBlockPaused() || this.imagesWaitingForAnalyse.length === 0 || this.nbImagesInAnalyse >= this.maxNbImagesInAnalyse) {
      return;
    }
    const info = this.imagesWaitingForAnalyse.shift()!;
    if (info.analyseFromSrc) {
      await this.requestAnalyseFromSrc(info.image, info.id);
    } else {
      await this.analyseImage(info.image, info.id);
    }
    await this.afterImageAnalyseCallback();
  }

  /**
   * Analyse the image content to block or unblock the image.
   *
   * @param {type} image
   * @param {type} id - id of the image when it was managed
   *
   * The given parameter id corresponds to the id of the image when the image was managed.
   * This id could have changed since because image element can change.
   * In this case the image needs to be ignored here because the change in the image has been
   * processed and the new version of the image is being managed.
   */
  async analyseImage(image: ImageInfo, id: number) {
    if (this.shouldStopProcess(image, id)) {
      return;
    }

    if (getElementWidth(image.element) <= MIN_IMAGE_WIDTH_AND_HEIGHT || getElementHeight(image.element) <= MIN_IMAGE_WIDTH_AND_HEIGHT) {
      image.doesNeedAnalysing = false;
      image.unblock();
      await this.popupHelper.addIgnoredImageInPopup();
      return;
    }

    if (this.nbImagesInAnalyse >= this.maxNbImagesInAnalyse) {
      this.imagesWaitingForAnalyse.push({image: image, id: id, analyseFromSrc: false});
      return;
    }
    this.nbImagesInAnalyse++;

    const imageObject = new Image();
    imageObject.crossOrigin = '';
    imageObject.onerror = async () => {
      this.nbImagesInAnalyse--;
      this.afterImageAnalyseCallback(); // Do not await here.
      if (this.shouldStopProcess(image, id)) {
        return;
      }
      await this.unblockImageAsFailed(image);
    };
    imageObject.onload = async () => {
      if (this.shouldStopProcess(image, id)) {
        this.nbImagesInAnalyse--;
        this.afterImageAnalyseCallback(); // Do not await here.
        return;
      }

      let imageData: ImageData;
      const perfoInfo = {} as PerformanceInfo;
      try {
        const beforeCenterCropTime = performance.now();
        imageData = await getImageData(imageObject, imageObject.width, imageObject.height);
        perfoInfo.centerCropDuration = performance.now() - beforeCenterCropTime;
      } catch (error) {
        this.nbImagesInAnalyse--;
        this.afterImageAnalyseCallback(); // Do not await here.
        this.unblockImageAsFailed(image);
        return;
      }
      this.requestAnalyse(image, imageData, id, perfoInfo);
    };
    imageObject.src = image.src!;
  }

  async requestAnalyse(image: ImageInfo, imageData: ImageData, id: number, perfoInfo: PerformanceInfo) {
    let response: AnalyseResponse | null = null;
    try {
      response = await browser.runtime.sendMessage<ExtensionMessage, AnalyseResponse>({
        message: MessageType.ANALYSE_FROM_DATA,
        data: Array.from(imageData.data),
        width: imageData.width,
        height: imageData.height,
        perfoInfo: perfoInfo
      });
    } catch (error) {
    }
    await this.processAnalyse(image, id, response);
  }

  async requestAnalyseFromSrc(image: ImageInfo, id: number) {
    if (this.shouldStopProcess(image, id)) {
      return;
    }

    if (this.nbImagesInAnalyse >= this.maxNbImagesInAnalyse) {
      this.imagesWaitingForAnalyse.push({image: image, id: id, analyseFromSrc: true});
      return;
    }
    this.nbImagesInAnalyse++;

    let response: AnalyseResponse | null = null;
    try {
      response = await browser.runtime.sendMessage<ExtensionMessage, AnalyseResponse>({
        message: MessageType.ANALYSE_FROM_SRC,
        src: image.src!
      });
    } catch (error) {
    }
    await this.processAnalyse(image, id, response);
  }

  async processAnalyse(image: ImageInfo, id: number, response: AnalyseResponse | null) {
    this.nbImagesInAnalyse--;
    this.afterImageAnalyseCallback(); // Do not await here.

    if (this.shouldStopProcess(image, id)) {
      return;
    }

    image.isAnalysed = true;
    image.doesNeedAnalysing = false;

    // TODO: adapt because try catch needs to be used instead of browser.runtime.lastError
    if (browser.runtime.lastError || !response) {
      image.unblock();
      await this.popupHelper.addFailedImageInPopup();
      return;
    }

    const decision = response.decision;
    if (!decision.isValid) {
      image.unblock();
      await this.popupHelper.addFailedImageInPopup();
      return;
    }

    if (decision.isIgnored) {
      image.unblock();
      await this.popupHelper.addIgnoredImageInPopup();
      return;
    }

    if (decision.isTm) {
      image.isTm = true;
      this.nbTm++;
      if (!this.options.wnidIndexes.includes(tmId.toString())) {
        await this.popupHelper.updateTmInPopup(true);
      }
    }

    if (this.options.risk <= decision.risk) {
      image.block(getRiskAssessmentDescription(decision.risk));
      await this.popupHelper.addBlockedImageInPopup();
    } else {
      image.unblock();
      await this.popupHelper.addAnalysedImageInPopup();
    }
  }

  addBrowserEventListeners() {
    browser.runtime.onMessage.addListener(async (request: unknown) => {
      if (!isExtensionMessage(request)) {
        return;
      }
      if (request.message === MessageType.BLOCK_UNBLOCK) {
        if (this.isAutomaticBlockPaused()) {
          const nbNewImages = this.addAllPresentImages(true, true);
          await this.popupHelper.addImagesInPopup(nbNewImages);
        }

        if (this.options.doesAllBlock) {
          return;
        }

        for (const image of this.allImages) {
          if (image.src === (request as BlockUnblockMessage).src) {
            image.isIgnored = true;
            image.doesNeedAnalysing = false;
            image.toggleBlock();
          }
        }
      }
    });

    const onOptionsChangedFunction = async (changes: any) => {
      if (!changes.options) {
        return;
      }
      this.options = restoreOptionsFromNewValue(changes.options.newValue);
      this.isWebsiteTrusted = isUrlTrusted(this.options, ImageManager.getUrl());
      this.updateRegexes();

      let hasResumed = false;
      let hasPaused = false;
      let isNotTrustedAnymore = false;
      let isNowTrusted = false;
      let doesNotAllBlockAnymore = false;
      let doesNowAllBlock = false;
      if (changes.options.oldValue) {
        hasResumed = changes.options.oldValue.paused && !changes.options.newValue.paused;
        hasPaused = !changes.options.oldValue.paused && changes.options.newValue.paused;

        const wasWebsiteTrusted = isUrlTrusted(changes.options.oldValue, ImageManager.getUrl());
        isNotTrustedAnymore = wasWebsiteTrusted && !this.isWebsiteTrusted;
        isNowTrusted = !wasWebsiteTrusted && this.isWebsiteTrusted;

        doesNotAllBlockAnymore = changes.options.oldValue.doesAllBlock && !changes.options.newValue.doesAllBlock;
        doesNowAllBlock = !changes.options.oldValue.doesAllBlock && changes.options.newValue.doesAllBlock;
      }

      if (doesNowAllBlock) {
        ImageManager.addTemporaryBlockCss();
      }

      if ((hasResumed && !this.isWebsiteTrusted && !this.options.doesAllBlock)
        || (!this.options.paused && isNotTrustedAnymore && !this.options.doesAllBlock)
        || (!this.options.paused && !this.isWebsiteTrusted && doesNotAllBlockAnymore)) {

        this.imagesWaitingForAnalyse = [];
        const nbNewImages = this.addAllPresentImages(true, true);
        await this.popupHelper.addImagesInPopup(nbNewImages);
        this.globalObserver.observe(document.documentElement, {childList: true, subtree: true});
        for (const image of this.allImages) {
          image.observe();
          if (image.doesNeedAnalysing) {
            image.putToWait();
            await this.manageImage(image);
          }
        }
      } else if (hasPaused || isNowTrusted || doesNowAllBlock) {
        this.globalObserver.disconnect();
        for (const image of this.allImages) {
          image.disconnect();
          if (image.isTemporaryBlocked) {
            image.unblock();
          }
        }
      }

      if (doesNotAllBlockAnymore) {
        ImageManager.removeTemporaryBlockCss();
      }
    };
    browser.storage.onChanged.addListener(onOptionsChangedFunction);
    // // Firefox needs to have the listener removed otherwise an error is thrown in the console.
    // window.addEventListener("unload", () => {
    //     browser.storage.onChanged.removeListener(onOptionsChangedFunction);
    // }, {once: true});
  }
}

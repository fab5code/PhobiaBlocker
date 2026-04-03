import {getStateColor, State} from "@/common/state";
import type {ImageManager} from "@/contentScript/ImageManager";
import browser from "webextension-polyfill";

enum ImageState {
  BLOCKED = 0,
  TEMPORARY_BLOCKED = 1,
  UNBLOCKED = 2
}

export function isSvgImageElement(element: HTMLImageElement | SVGImageElement): element is SVGImageElement {
  return element instanceof SVGImageElement;
}

export class ImageInfo {
  public id!: number;
  public src!: string | null;
  public isTemporaryBlocked = false;
  public isAnalysed = false;
  public doesNeedAnalysing = true;
  public isIgnored!: boolean;
  public isInternal!: boolean;
  public observer: MutationObserver | null = null;
  public isRegexBlocked = false;
  public isTm = false;
  public element: HTMLImageElement | SVGImageElement;

  private static imageSrcsToIgnore = [
    browser.runtime.getURL('img/default/icon32.png'),
    browser.runtime.getURL('img/analysing/icon32.png')
  ];
  /* The constrast has a weird value and is useless to block on purpose because
   * we want to have a value for filter quite unique so as to identify when the
   * value was given by the extension to manage a rare edge case.
   */
  private static blockFilterStyle = 'brightness(0%) contrast(4242%)';
  private static svgFilterId = browser.runtime.id + '-block';
  private static linkElementToComputeAbsoluteUrl: HTMLAnchorElement | null = null;
  /**
   * Each image has a unique id. It's needed to recognise when an image has changed.
   */
  private static idCounter = 0;

  private manager: ImageManager;
  private isBlocked = false;
  private formerFilter: string;
  private formerBackgroundColor: string;
  private formerTransition: string;
  private formerSvgFilter = '';
  private tooltip!: HTMLElement;
  private showTooltipFunction!: () => void;
  private hideTooltipFunction!: () => void;

  constructor(manager: ImageManager, element: HTMLImageElement | SVGImageElement) {
    this.manager = manager;
    this.element = element;

    if (this.element.style.filter !== ImageInfo.blockFilterStyle) {
      this.formerFilter = this.element.style.filter;
      this.formerBackgroundColor = this.element.style.backgroundColor;
      this.formerTransition = this.element.style.transition;
    } else {
      /* The element was probably built from a blocked image and its style copied from it.
       * But the src may be different or it was copied during a temporary block.
       * For example it was the case on a new tab to google on its logo.
       */
      this.formerFilter = '';
      this.formerBackgroundColor = '';
      this.formerTransition = '';
    }
    if (isSvgImageElement(this.element)) {
      this.formerSvgFilter = this.element.getAttribute('filter')!;
      this.element.addEventListener('contextmenu', () => {
        this.isIgnored = true;
        this.toggleBlock();
      });
    }
    this.reset();
  }

  reset() {
    this.id = ImageInfo.idCounter++;
    this.doesNeedAnalysing = true;
    this.isAnalysed = false;
    this.isTm = false;
    this.src = this.computeSrc();
    this.isIgnored = false;
    this.isInternal = false;
    this.isRegexBlocked = false;

    if (this.src && ImageInfo.imageSrcsToIgnore.includes(this.src)) {
      this.isIgnored = true;
      this.isInternal = true;
    }
    if (!this.isIgnored && this.src && !this.src.startsWith('data:image')) {
      for (const blockedRegex of this.manager.blockedRegexes) {
        if (blockedRegex.test(this.src)) {
          this.isIgnored = true;
          this.isRegexBlocked = true;
          break;
        }
      }
      if (!this.isIgnored) {
        for (const trustedRegex of this.manager.trustedRegexes) {
          if (trustedRegex.test(this.src)) {
            this.isIgnored = true;
            break;
          }
        }
      }
    }
    if (this.isIgnored) {
      this.doesNeedAnalysing = false;
    }
  }

  computeSrc(): string | null {
    if (isSvgImageElement(this.element)) {
      const href = this.element.getAttribute('href');
      if (href) {
        return this.getAbsoluteUrl(href);
      }
      const xlinkHref = this.element.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (xlinkHref) {
        return this.getAbsoluteUrl(xlinkHref);
      }
    } else if (this.element.src) {
      return this.element.src;
    }
    return null;
  }

  toggleBlock() {
    if (this.isBlocked || this.isTemporaryBlocked) {
      this.unblock();
    } else {
      this.block();
    }
  }

  blockElement() {
    if (isSvgImageElement(this.element)) {
      if (!this.manager.isSvgFilterPlaced) {
        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgElement.setAttribute('width', '0');
        svgElement.setAttribute('height', '0');
        svgElement.style = 'position: absolute; visibility: hidden;';
        const filterElement = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filterElement.id = ImageInfo.svgFilterId;
        svgElement.appendChild(filterElement);
        const colorMatrixElement = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
        colorMatrixElement.setAttribute('in', 'SourceGraphic');
        colorMatrixElement.setAttribute('type', 'matrix');
        colorMatrixElement.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1');
        filterElement.appendChild(colorMatrixElement);
        document.body.append(svgElement);
        this.manager.isSvgFilterPlaced = true;
      }
      this.element.setAttribute('filter', 'url(#' + ImageInfo.svgFilterId + ')');
    } else {
      this.element.style.filter = ImageInfo.blockFilterStyle;
      this.element.style.backgroundColor = '#000';
      this.element.style.transition = 'none';
    }
  }

  temporaryBlock() {
    this.changeState(ImageState.TEMPORARY_BLOCKED);
    this.blockElement();

    if (!this.tooltip) {
      this.createTooltip();
    }
    this.tooltip.innerHTML = '<img width="32" height="32" style="margin-right: 5px; margin-left: -8px;" src="' + browser.runtime.getURL('img/analysing/icon32.png') + '" alt="Analysing PhobiaBlocker logo">'
      + '<span><span style="font-weight: bold;">Analysing</span></span>';
    this.tooltip.style.color = getStateColor(State.ANALYSING);
    this.tooltip.style.borderColor = getStateColor(State.ANALYSING);

    if (!document.body.contains(this.tooltip)) {
      document.body.append(this.tooltip);
      this.element.addEventListener('mouseover', this.showTooltipFunction);
      this.element.addEventListener('mouseout', this.hideTooltipFunction);
    }
  }

  block(riskAssessment?: string) {
    this.changeState(ImageState.BLOCKED);
    this.blockElement();

    if (!this.tooltip) {
      this.createTooltip();
    }
    let riskMessage = '';
    if (riskAssessment) {
      riskMessage = ': ' + riskAssessment + ' risk';
    }
    this.tooltip.innerHTML = '<img width="32" height="32" style="margin-right: 5px; margin-left: -8px;" src="' + browser.runtime.getURL('img/default/icon32.png') + '" alt="PhobiaBlocker logo">'
      + '<span><span style="font-weight: bold;">Blocked</span>' + riskMessage
      + ' <span style="color:' + (this.manager.options.isDarkMode ? 'white;' : 'black;') + '">[Cancel with right click]</span></span>';
    this.tooltip.style.color = getStateColor(State.DEFAULT);
    this.tooltip.style.borderColor = getStateColor(State.DEFAULT);

    if (!document.body.contains(this.tooltip)) {
      document.body.append(this.tooltip);
      this.element.addEventListener('mouseover', this.showTooltipFunction);
      this.element.addEventListener('mouseout', this.hideTooltipFunction);
    }
  }

  unblock() {
    this.changeState(ImageState.UNBLOCKED);
    if (isSvgImageElement(this.element)) {
      this.element.setAttribute('filter', this.formerSvgFilter);
    } else {
      this.element.style.filter = this.formerFilter;
      this.element.style.backgroundColor = this.formerBackgroundColor;
      this.element.style.transition = this.formerTransition;
    }
    if (document.body.contains(this.tooltip)) {
      this.tooltip.remove();
      this.element.removeEventListener('mouseover', this.showTooltipFunction);
      this.element.removeEventListener('mouseout', this.hideTooltipFunction);
    }
  }

  putToWait() {
    if (this.isRegexBlocked) {
      this.block();
    }
    if (this.isIgnored) {
      return;
    }
    this.temporaryBlock();
  }

  createTooltip() {
    let that = this;

    this.tooltip = document.createElement('div');
    this.tooltip.style = 'position: fixed; z-index: 1000; padding-right: 10px; border: 1px solid; border-radius: 5px; background-color: white; font: 14px/1.3 sans-serif; text-align: center; box-shadow: 3px 3px 3px rgba(0, 0, 0, .3); transition: opacity 0.5s ease; opacity: 0; visibility: hidden; display: flex; align-items: center;';
    if (this.manager.options.isDarkMode) {
      this.tooltip.style.backgroundColor = 'black';
    }
    this.showTooltipFunction = () => this.showTooltip();
    this.hideTooltipFunction = () => this.hideTooltip();
  }

  showTooltip() {
    const coords = this.element.getBoundingClientRect();
    let elementOffsetWidth;
    let elementOffsetHeight;
    if (isSvgImageElement(this.element)) {
      elementOffsetWidth = coords.width;
      elementOffsetHeight = coords.height;
    } else {
      elementOffsetWidth = this.element.offsetWidth;
      elementOffsetHeight = this.element.offsetHeight;
    }

    let left = coords.left + (elementOffsetWidth - this.tooltip.offsetWidth) / 2;
    if (left < 0) {
      left = 0;
    }
    let top = coords.top - this.tooltip.offsetHeight - 5;
    if (top < 0) {
      top = coords.top + elementOffsetHeight + 5;
    }
    this.tooltip.style.left = left + 'px';
    this.tooltip.style.top = top + 'px';

    this.tooltip.style.visibility = "visible";
    this.tooltip.style.opacity = "1";
  }

  hideTooltip() {
    this.tooltip.style.opacity = '0';
    this.tooltip.style.visibility = 'hidden';
  }

  getAbsoluteUrl(url: string): string {
    if (!ImageInfo.linkElementToComputeAbsoluteUrl) {
      ImageInfo.linkElementToComputeAbsoluteUrl = document.createElement('a');
    }
    ImageInfo.linkElementToComputeAbsoluteUrl.href = url;
    return ImageInfo.linkElementToComputeAbsoluteUrl.href;
  }

  changeState(state: ImageState) {
    switch (state) {
      case ImageState.BLOCKED:
        this.isBlocked = true;
        this.isTemporaryBlocked = false;
        break;
      case ImageState.TEMPORARY_BLOCKED:
        this.isBlocked = false;
        this.isTemporaryBlocked = true;
        break;
      case ImageState.UNBLOCKED:
        this.isBlocked = false;
        this.isTemporaryBlocked = false;
        break;
    }
  }

  hasChanged() {
    return this.src !== this.computeSrc();
  }

  observe() {
    if (this.observer) {
      const attributeToFilter = isSvgImageElement(this.element) ? 'href' : 'src';
      this.observer.observe(this.element, {attributes: true, attributeFilter: [attributeToFilter]});
    }
  }

  disconnect() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}

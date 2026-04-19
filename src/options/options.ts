import {ExecutionProvider} from "@/common/ExecutionProvider";
import {Risk} from "@/common/Risk";
import {getRiskDescription, models, restoreOptions, restoreOptionsFromNewValue, saveOptions, type Options} from "@/options/commonOptions";
import browser from "webextension-polyfill";

type TimeoutKeys = 'trustedUrlRegexesTimeout' | 'trustedRegexesTimeout' | 'blockedRegexesTimeout';
type TimeoutOptions = 'trustedUrlRegexes' | 'trustedRegexes' | 'blockedRegexes';

class OptionsManager {
  options: Options;

  logoElement = document.getElementById('js-logo') as HTMLImageElement;
  spiderLikeElement = document.getElementById('js-spiderLikeOption') as HTMLInputElement;
  insectLikeElement = document.getElementById('js-insectLikeOption') as HTMLInputElement;
  freeChoiceCheckboxes = Array.from(document.getElementsByClassName("js-checkbox")) as HTMLInputElement[];

  speedAccuracyTradeoffElement = document.getElementById('js-speedAccuracyTradeoffOption') as HTMLInputElement;
  speedAccuracyTradeoffValueElement = document.getElementById('js-speedAccuracyTradeoffValue')!;
  executionProviderElement = document.getElementById('js-executionProviderOption') as HTMLInputElement;
  executionProviderValueElement = document.getElementById('js-executionProviderValue')!;
  executionProviderOrder = [ExecutionProvider.WEBGPU, ExecutionProvider.WASM];
  riskElement = document.getElementById('js-riskOption') as HTMLInputElement;
  riskValueElement = document.getElementById('js-riskValue')!;

  trustedUrlRegexesElement = document.getElementById('js-trustedUrlRegexes') as HTMLTextAreaElement;
  trustedUrlRegexesTimeout: number | null = null;
  trustedRegexesElement = document.getElementById('js-trustedRegexes') as HTMLTextAreaElement;
  trustedRegexesTimeout: number | null = null;
  blockedRegexesElement = document.getElementById('js-blockedRegexes') as HTMLTextAreaElement;
  blockedRegexesTimeout: number | null = null;

  pauseElement = document.getElementById('js-pause-input') as HTMLInputElement;
  allBlockElement = document.getElementById('js-allBlock-input') as HTMLInputElement;
  decisionCacheElement = document.getElementById('js-decisionCache-input') as HTMLInputElement;
  persistDecisionCacheElement = document.getElementById('js-persistDecisionCache-input') as HTMLInputElement;
  darkModeInputElement = document.getElementById('js-darkMode-input') as HTMLInputElement;
  darkModeMessageElement = document.getElementById('js-darkMode-message')!;

  constructor(options: Options) {
    this.options = options;
    this.addEvents();
    this.updateView();
  }

  updateSpiderLikeView() {
    this.spiderLikeElement.checked = this.options.spiderLike;
  }

  async manageSpiderLike() {
    this.options.spiderLike = this.spiderLikeElement.checked;
    await saveOptions(this.options, true);
  }

  updateInsectLikeView() {
    this.insectLikeElement.checked = this.options.insectLike;
  }

  async manageInsectLike() {
    this.options.insectLike = this.insectLikeElement.checked;
    await saveOptions(this.options, true);
  }

  manageFreeChoiceOption(child: HTMLInputElement) {
    const wnid = child.getAttribute("wnid")!;
    if (child.checked) {
      this.options.wnids.add(wnid);
    } else {
      this.options.wnids.delete(wnid);
    }
  }

  updateCheckbox(allCheckboxes: HTMLInputElement[], alreadyUpdatedCheckboxes: Set<string>, element: HTMLInputElement, isChecked: boolean) {
    if (alreadyUpdatedCheckboxes.has(element.id)) {
      return;
    }
    alreadyUpdatedCheckboxes.add(element.id);

    element.checked = isChecked;
    element.indeterminate = false;
    this.manageFreeChoiceOption(element);

    const childrenAndSelf = Array.prototype.slice.call(element.parentNode!.querySelectorAll('input'));
    childrenAndSelf.forEach((childOrSelf) => {
      if (alreadyUpdatedCheckboxes.has(childOrSelf.id)) {
        return;
      }
      this.updateCheckbox(allCheckboxes, alreadyUpdatedCheckboxes, childOrSelf, isChecked);
    });

    const wnid = element.getAttribute('wnid');
    allCheckboxes.forEach((checkbox) => {
      if (checkbox.getAttribute('wnid') !== wnid) {
        return;
      }
      if (alreadyUpdatedCheckboxes.has(checkbox.id)) {
        return;
      }
      this.updateCheckbox(allCheckboxes, alreadyUpdatedCheckboxes, checkbox, isChecked);
    });
  }

  updateFreeChoiceView() {
    for (const checkbox of this.freeChoiceCheckboxes) {
      const parent = (checkbox.closest('ul')!.parentNode!).querySelector("input")!;
      if (parent === checkbox) {
        return;
      }
      const siblings = Array.from(parent.closest('li')!.querySelector('ul')!.querySelectorAll('input')!);

      const checkStatus = siblings.map(check => check.checked);
      const every = checkStatus.every(Boolean);
      const some = checkStatus.some(Boolean);
      parent.checked = every;
      parent.indeterminate = !every && some;

      this.manageFreeChoiceOption(parent);
    }
  }

  addFreeChoiceOptionEvents() {
    const dropdowns = Array.from(document.getElementsByClassName("js-dropdown"));
    for (const dropdown of dropdowns) {
      dropdown.addEventListener("click", () => {
        dropdown.parentElement!.querySelector(".js-nested")!.classList.toggle("active");
        dropdown.parentElement!.querySelector(".js-nested")!.classList.toggle("nodisplay");
        dropdown.classList.toggle("collapsed");
        dropdown.classList.toggle("dropped");
      });
    }

    for (const checkbox of this.freeChoiceCheckboxes) {
      checkbox.addEventListener('change', async () => {
        const alreadyUpdatedCheckboxes: Set<string> = new Set();
        this.updateCheckbox(this.freeChoiceCheckboxes, alreadyUpdatedCheckboxes, checkbox, checkbox.checked);
        this.updateFreeChoiceView();
        await saveOptions(this.options, true);
      });
    }
  }

  updateSpeedAccuracyTradeoffView() {
    this.speedAccuracyTradeoffValueElement.textContent = models[parseInt(this.speedAccuracyTradeoffElement.value)].info;
  }

  async manageSpeedAccuracyTradeoff() {
    if (parseInt(this.speedAccuracyTradeoffElement.value) >= 0 && parseInt(this.speedAccuracyTradeoffElement.value) < models.length) {
      this.options.modelIndex = Number(this.speedAccuracyTradeoffElement.value);
      this.updateSpeedAccuracyTradeoffView();
      await saveOptions(this.options, true);
    }
  }

  updateExecutionProviderView() {
    switch (this.executionProviderOrder[parseInt(this.executionProviderElement.value)]) {
      case ExecutionProvider.WEBGPU:
        this.executionProviderValueElement.textContent = 'webgpu (faster, may vary by browser)';
        break;
      case ExecutionProvider.WASM:
        this.executionProviderValueElement.textContent = 'wasm (more reliable)';
        break;
    }
  }

  async manageExecutionProvider() {
    const executionProvider = this.executionProviderOrder[parseInt(this.executionProviderElement.value)];
    if (executionProvider) {
      this.options.executionProvider = executionProvider;
      this.updateExecutionProviderView();
      await saveOptions(this.options, true);
    }
  }

  updateRiskView() {
    this.riskValueElement.textContent = getRiskDescription(parseInt(this.riskElement.value));
  }

  async manageRisk() {
    const risk = parseInt(this.riskElement.value);
    if (risk === this.options.risk) {
      return;
    }
    this.options.risk = risk;
    this.updateRiskView();
    await saveOptions(this.options, true);
  }

  updateRegexes(regexes: string, element: HTMLElement) {
    element.textContent = regexes;
  }

  manageRegexes(optionName: TimeoutOptions, element: HTMLTextAreaElement, timeoutIdName: TimeoutKeys) {
    /* The options are not saved at every character change because that would be unnecessary inefficient.
     * The change event of the textarea fires when the user blurs out of the textarea which is not the best
     * since saving the options could be skipped.
     * This is why the options are saved only after the user has not changed the content for a certain amount of time.
     */
    if (this[timeoutIdName]) {
      window.clearTimeout(this[timeoutIdName]);
    }
    this[timeoutIdName] = window.setTimeout(async () => {
      this.options[optionName] = element.value;
      await saveOptions(this.options, true);
    }, 1000);
  }

  updatePauseView() {
    this.pauseElement.checked = this.options.paused;
  }

  async managePause() {
    this.options.paused = this.pauseElement.checked;
    await saveOptions(this.options, true);
  }

  updateAllBlockView() {
    this.allBlockElement.checked = this.options.doesAllBlock;
  }

  async manageAllBlock() {
    this.options.doesAllBlock = this.allBlockElement.checked;
    await saveOptions(this.options, true);
  }

  updateDecisionCacheView() {
    this.decisionCacheElement.checked = this.options.doesUseDecisionCache;
  }

  async manageDecisionCache() {
    this.options.doesUseDecisionCache = this.decisionCacheElement.checked;
    await saveOptions(this.options, true);
  }

  updatePersistDecisionCacheView() {
    this.persistDecisionCacheElement.checked = this.options.doesPersistDecisionCache;
  }

  async managePersistDecisionCache() {
    this.options.doesPersistDecisionCache = this.persistDecisionCacheElement.checked;
    await saveOptions(this.options, true);
  }

  updateDarkModeView() {
    this.darkModeInputElement.checked = this.options.isDarkMode;
    if (this.darkModeInputElement.checked) {
      this.darkModeMessageElement.textContent = 'Dark mode enabled';
      document.body.classList.add('darkMode');
      this.logoElement.src = browser.runtime.getURL('img/logo_darkMode.svg');
    } else {
      this.darkModeMessageElement.textContent = 'Light mode enabled';
      document.body.classList.remove('darkMode');
      this.logoElement.src = browser.runtime.getURL('img/logo.svg');
    }
  }

  async manageDarkMode() {
    this.options.isDarkMode = this.darkModeInputElement.checked;
    await saveOptions(this.options, true);
    this.updateDarkModeView();
  }

  addEvents() {
    this.spiderLikeElement.addEventListener('click', () => this.manageSpiderLike());
    this.insectLikeElement.addEventListener('click', () => this.manageInsectLike());

    this.speedAccuracyTradeoffElement.setAttribute('max', (models.length - 1).toString());
    this.speedAccuracyTradeoffElement.addEventListener('change', () => this.manageSpeedAccuracyTradeoff());
    this.speedAccuracyTradeoffElement.addEventListener('input', () => this.updateSpeedAccuracyTradeoffView());

    this.executionProviderElement.setAttribute('max', (Object.keys(ExecutionProvider).length - 1).toString());
    this.executionProviderElement.addEventListener('change', () => this.manageExecutionProvider());
    this.executionProviderElement.addEventListener('input', () => this.updateExecutionProviderView());

    const riskValues: number[] = Object.values(Risk).filter(v => typeof v === 'number');
    this.riskElement.setAttribute('min', (Math.min(...riskValues)).toString());
    this.riskElement.setAttribute('max', (Math.max(...riskValues)).toString());
    this.riskElement.addEventListener('change', () => this.manageRisk());
    this.riskElement.addEventListener('input', () => this.updateRiskView());

    this.trustedUrlRegexesElement.addEventListener('input', () => {
      this.manageRegexes('trustedUrlRegexes', this.trustedUrlRegexesElement, 'trustedUrlRegexesTimeout');
    });
    this.trustedRegexesElement.addEventListener('input', () => {
      this.manageRegexes('trustedRegexes', this.trustedRegexesElement, 'trustedRegexesTimeout');
    });
    this.blockedRegexesElement.addEventListener('input', () => {
      this.manageRegexes('blockedRegexes', this.blockedRegexesElement, 'blockedRegexesTimeout');
    });

    this.pauseElement.addEventListener('click', () => this.managePause());
    this.allBlockElement.addEventListener('click', () => this.manageAllBlock());
    this.decisionCacheElement.addEventListener('click', () => this.manageDecisionCache());
    this.persistDecisionCacheElement.addEventListener('click', () => this.managePersistDecisionCache());
    this.darkModeInputElement.addEventListener('click', () => this.manageDarkMode());
    this.darkModeMessageElement.addEventListener('click', () => this.darkModeInputElement.click());

    this.addFreeChoiceOptionEvents();

    const onOptionsChangedFunction = (changes: any) => {
      if (!changes.options || changes.options.newValue.wasChangedByOptionsManager) {
        return;
      }
      this.options = restoreOptionsFromNewValue(changes.options.newValue);
      this.updateView();
    };
    browser.storage.onChanged.addListener(onOptionsChangedFunction);
    // Firefox needs to have the listener removed otherwise an error is thrown in the console.
    window.addEventListener("unload", () => {
      browser.storage.onChanged.removeListener(onOptionsChangedFunction);
    }, {once: true});
  }

  updateView() {
    this.updateSpiderLikeView();
    this.updateInsectLikeView();

    /* The spped/accuracy tradeoff, execution provider and risk management must not be updated with the options values in the update view.
     * The view is updated in the input event and saving options is done in the change event so as to avoid saving
     * options multiple times.
     */
    this.speedAccuracyTradeoffElement.value = this.options.modelIndex.toString();
    this.updateSpeedAccuracyTradeoffView();
    this.executionProviderElement.value = this.executionProviderOrder.indexOf(this.options.executionProvider).toString();
    this.updateExecutionProviderView();
    this.riskElement.value = this.options.risk.toString();
    this.updateRiskView();

    this.updateRegexes(this.options.trustedUrlRegexes, this.trustedUrlRegexesElement);
    this.updateRegexes(this.options.trustedRegexes, this.trustedRegexesElement);
    this.updateRegexes(this.options.blockedRegexes, this.blockedRegexesElement);

    this.updatePauseView();
    this.updateAllBlockView();
    this.updateDecisionCacheView();
    this.updatePersistDecisionCacheView();
    this.updateDarkModeView();

    for (const checkbox of this.freeChoiceCheckboxes) {
      const wnid = checkbox.getAttribute('wnid')!;
      checkbox.checked = this.options.wnids.has(wnid);
    }
    this.updateFreeChoiceView();
  }
}

var optionsManager;
async function main() {
  const options = await restoreOptions();
  optionsManager = new OptionsManager(options);
}
main();

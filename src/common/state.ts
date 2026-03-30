import browser from "webextension-polyfill";

export enum State {
  DEFAULT = 0,
  ANALYSING = 1,
  TRUSTED = 2,
  PAUSED = 3
};

export function getStateColor(state: State): string {
  switch (state) {
    case State.DEFAULT:
      return "#BD2525";
    case State.ANALYSING:
      return "#BDAE25";
    case State.TRUSTED:
      return "#1E981E";
    case State.PAUSED:
      return "#A0A0A0";
  }
}

export async function setTitleAndIcon(state: State): Promise<void> {
  switch (state) {
    case State.DEFAULT:
      await browser.action.setTitle({title: 'PhobiaBlocker'});
      await browser.action.setIcon({
        path: { // TODO: cache all the calls to getURL
          16: browser.runtime.getURL('img/default/icon16.png'),
          32: browser.runtime.getURL('img/default/icon32.png'),
          48: browser.runtime.getURL('img/default/icon48.png'),
          64: browser.runtime.getURL('img/default/icon64.png'),
          96: browser.runtime.getURL('img/default/icon96.png'),
          128: browser.runtime.getURL('img/default/icon128.png'),
          256: browser.runtime.getURL('img/default/icon256.png')
        }
      });
      break;
    case State.ANALYSING:
      await browser.action.setTitle({title: 'Analysing'});
      await browser.action.setIcon({
        path: {
          16: browser.runtime.getURL('img/analysing/icon16.png'),
          32: browser.runtime.getURL('img/analysing/icon32.png'),
          48: browser.runtime.getURL('img/analysing/icon48.png'),
          64: browser.runtime.getURL('img/analysing/icon64.png'),
          96: browser.runtime.getURL('img/analysing/icon96.png'),
          128: browser.runtime.getURL('img/analysing/icon128.png'),
          256: browser.runtime.getURL('img/analysing/icon256.png')
        }
      });
      break;
    case State.TRUSTED:
      await browser.action.setTitle({title: 'Trusted site'});
      await browser.action.setIcon({
        path: {
          16: browser.runtime.getURL('img/trusted/icon16.png'),
          32: browser.runtime.getURL('img/trusted/icon32.png'),
          48: browser.runtime.getURL('img/trusted/icon48.png'),
          64: browser.runtime.getURL('img/trusted/icon64.png'),
          96: browser.runtime.getURL('img/trusted/icon96.png'),
          128: browser.runtime.getURL('img/trusted/icon128.png'),
          256: browser.runtime.getURL('img/trusted/icon256.png')
        }
      });
      break;
    case State.PAUSED:
      await browser.action.setTitle({title: 'Paused'});
      await browser.action.setIcon({
        path: {
          16: browser.runtime.getURL('img/paused/icon16.png'),
          32: browser.runtime.getURL('img/paused/icon32.png'),
          48: browser.runtime.getURL('img/paused/icon48.png'),
          64: browser.runtime.getURL('img/paused/icon64.png'),
          96: browser.runtime.getURL('img/paused/icon96.png'),
          128: browser.runtime.getURL('img/paused/icon128.png'),
          256: browser.runtime.getURL('img/paused/icon256.png')
        }
      });
      break;
  }
}

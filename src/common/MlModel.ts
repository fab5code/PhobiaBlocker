export enum PreprocessType {
  CHW_NORMALIZED = 'CHW_NORMALIZED',
  HWC_CENTERED = 'HWC_CENTERED'
}

export interface MlModel {
  name: string,
  path: string,
  preprocessType: PreprocessType,
  doesNeedSoftmax: boolean,
  info: string
}

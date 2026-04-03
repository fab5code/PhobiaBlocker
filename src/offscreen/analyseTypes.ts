import type {RiskAssessment} from "@/offscreen/RiskAssessment"

export interface PerformanceInfo {
  centerCropDuration: number,
  modelPreprocessingDuration: number,
  modelRunDuration: number,
  decisionDuration: number,
  probability: number
}

export interface Decision {
  isValid: boolean,
  isIgnored?: boolean,
  isTm?: boolean,
  risk?: RiskAssessment
}

export interface AnalyseImageInfo {
  data: Uint8Array,
  width: number,
  height: number
}

import {tmId} from "@/common/imageNetIds";
import {PreprocessType, type MlModel} from "@/common/MlModel";
import {MODEL_SIZE} from "@/contentScript/imageDataHelper";
import type {Decision, PerformanceInfo} from "@/offscreen/analyseTypes";
import {RiskAssessment} from "@/offscreen/RiskAssessment";
import * as ort from "onnxruntime-web";

interface WaitingForModelAnalyseImage {
  image: Float32Array,
  perfoInfo: PerformanceInfo,
  onCompleteCallback: (result: Decision) => void
}

export class ImageAnalyser {
  /**
   * ImageNet classes to block.
   */
  public blockedIds = new Set<string>();
  public session: ort.InferenceSession | null = null;

  /**
   * Machine Learning model session is updated by an option change and need to be initialised.
   */
  private isSessionReady = false;
  /**
   * Buffer of preprocessed images waiting for session initialisation.
   */
  private imagesWaitingForModelAnalyse: WaitingForModelAnalyseImage[] = [];
  private model!: MlModel;

  async initSession(model: MlModel) {
    this.isSessionReady = false;
    this.model = model;

    console.log('start init session with model', model)
    this.session = await ort.InferenceSession.create(this.model.path, {
      executionProviders: ["webgpu", "wasm"]
    });
    this.isSessionReady = true;

    console.log('session was initialized with model', model)

    // TODO: maybe should not await here (by creating a new function called after initSession without await)
    for (const imageInfo of this.imagesWaitingForModelAnalyse) {
      const decision = await this.analyseImageFromModel(imageInfo.image, imageInfo.perfoInfo);
      imageInfo.onCompleteCallback(decision);
    }
    this.imagesWaitingForModelAnalyse = [];
  }

  analyseImage(data: Uint8Array, width: number, height: number, perfoInfo: PerformanceInfo): Promise<Decision> {
    return new Promise(async (resolve) => {
      const image = this.preprocess(data, width, height, perfoInfo);
      if (!this.isSessionReady) {
        this.imagesWaitingForModelAnalyse.push({image: image, perfoInfo: perfoInfo, onCompleteCallback: resolve});
        return;
      }
      const decision = await this.analyseImageFromModel(image, perfoInfo);
      resolve(decision);
    });
  }

  preprocess(data: Uint8Array, width: number, height: number, perfoInfo: PerformanceInfo): Float32Array {
    const beforeModelPreprocessTime = performance.now();

    const output = new Float32Array(3 * height * width);
    const size = height * width;
    switch (this.model.preprocessType) {
      case PreprocessType.CHW_NORMALIZED: {
        // [1, 3, H, W]
        for (let i = 0; i < size; i++) {
          const r = data[i * 4] / 255;
          const g = data[i * 4 + 1] / 255;
          const b = data[i * 4 + 2] / 255;

          output[i] = (r - 0.485) / 0.229;
          output[i + size] = (g - 0.456) / 0.224;
          output[i + 2 * size] = (b - 0.406) / 0.225;
        }
        break;
      }
      case PreprocessType.HWC_CENTERED: {
        // [1, H, W, 3]
        for (let i = 0; i < size; i++) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];

          output[i * 3] = (r - 127) / 128;
          output[i * 3 + 1] = (g - 127) / 128;
          output[i * 3 + 2] = (b - 127) / 128;
        }
        break;
      }
    }

    // const output = new Float32Array(3 * height * width);
    // for (let i = 0; i < width * height; i++) {
    //   const r = data[i * 4] / 255;
    //   const g = data[i * 4 + 1] / 255;
    //   const b = data[i * 4 + 2] / 255;

    //   output[i] = (r - 0.485) / 0.229;
    //   output[i + width * height] = (g - 0.456) / 0.224;
    //   output[i + 2 * width * height] = (b - 0.406) / 0.225;
    // }

    perfoInfo.modelPreprocessingDuration = performance.now() - beforeModelPreprocessTime;

    return output;
  }

  async analyseImageFromModel(image: Float32Array, perfoInfo: PerformanceInfo): Promise<Decision> {
    const beforeTensorCreationTime = performance.now();

    const outputName = this.session!.outputNames[0];
    let tensor: ort.Tensor;
    switch (this.model.preprocessType) {
      case PreprocessType.CHW_NORMALIZED:
        tensor = new ort.Tensor('float32', image, [1, 3, MODEL_SIZE, MODEL_SIZE]);
        break;
      case PreprocessType.HWC_CENTERED:
        tensor = new ort.Tensor('float32', image, [1, MODEL_SIZE, MODEL_SIZE, 3]);
        break;
    }
    const input = {[this.session!.inputNames[0]]: tensor};
    const output = await this.session!.run(input);
    const afterModelRunTime = performance.now();
    perfoInfo.modelRunDuration = afterModelRunTime - beforeTensorCreationTime;

    const outputData = output[outputName].data;
    const decision = this.takeDecision(outputData as Float32Array<ArrayBufferLike>, perfoInfo);

    perfoInfo.decisionDuration = performance.now() - afterModelRunTime;

    return decision;
    // return {isValid: false};
  }

  getTopKClasses(classProbabilities: Float32Array<ArrayBufferLike>, k: number) {
    let probs = Array.from(classProbabilities);
    if (this.model.doesNeedSoftmax) {
      const exponents = probs.map(Math.exp);
      const sum = exponents.reduce((a, b) => a + b, 0);
      probs = exponents.map((exp) => exp / sum);
      // const maxProb = Math.max(...probs);
      // const exponents = probs.map((p) => Math.exp(p - maxProb));
      // const sum = exponents.reduce((a, b) => a + b, 0);
      // probs = exponents.map((exp) => exp / sum);
    }
    const probsIndices = probs.map((prob, index) => [prob, index]);
    const sorted = probsIndices.sort((a, b) => {
      if (a[0] < b[0]) {
        return -1;
      }
      if (a[0] > b[0]) {
        return 1;
      }
      return 0;
    }).reverse();
    // const sorted = probsIndices.sort((a, b) => b[0] - a[0]);
    const topK = sorted.slice(0, k).map((probIndice) => {
      return {
        id: probIndice[1],
        probability: probIndice[0]
      };
    });
    return topK;
  }

  takeDecision(outputData: Float32Array<ArrayBufferLike>, perfoInfo: PerformanceInfo): Decision {
    const k = 10;
    const outputClasses = this.getTopKClasses(outputData, k);
    const firstClass = outputClasses[0];

    const isTm = firstClass.id === tmId && firstClass.probability > 0.6;

    const isFirstClassBlocked = this.blockedIds.has(firstClass.id.toString());
    let totalProbability = 0;
    for (const outputClass of outputClasses) {
      if (this.blockedIds.has(outputClass.id.toString())) {
        totalProbability += outputClass.probability;
      }
    }
    perfoInfo.probability = totalProbability;

    let riskAssessment = RiskAssessment.NONE;
    if (isFirstClassBlocked) {
      if (totalProbability > 0.5) {
        riskAssessment = RiskAssessment.VERY_HIGH;
      } else if (totalProbability > 0.3) {
        riskAssessment = RiskAssessment.HIGH;
      } else if (totalProbability > 0.1) {
        riskAssessment = RiskAssessment.MEDIUM;
      } else if (totalProbability > 0.02) {
        riskAssessment = RiskAssessment.LOW;
      } else {
        riskAssessment = RiskAssessment.VERY_LOW;
      }
    } else {
      if (totalProbability > 0.8) {
        riskAssessment = RiskAssessment.VERY_HIGH;
      } else if (totalProbability > 0.5) {
        riskAssessment = RiskAssessment.HIGH;
      } else if (totalProbability > 0.2) {
        riskAssessment = RiskAssessment.MEDIUM;
      } else if (totalProbability > 0.1) {
        riskAssessment = RiskAssessment.LOW;
      } else if (totalProbability > 0.01) {
        riskAssessment = RiskAssessment.VERY_LOW;
      }
    }

    return {
      isTm: isTm,
      risk: riskAssessment,
      isValid: true
    };
  }
}

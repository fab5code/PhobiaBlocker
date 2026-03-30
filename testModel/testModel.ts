import {spiderLikeIds} from "@/common/imageNetIds";
import {PreprocessType} from "@/common/MlModel";
import {getImageData} from "@/contentScript/imageDataHelper";
import type {AnalyseImageInfo, Decision, PerformanceInfo} from "@/offscreen/analyseTypes";
import {ImageAnalyser} from "@/offscreen/ImageAnalyser";
import {RiskAssessment} from "@/offscreen/RiskAssessment";

const images = await fetch("/imageManifest.json").then(res => res.json());

const models = [
  {
    path: '/public/model/mobilenet_v4.onnx',
    name: 'mobilenet_v4',
    preprocessType: PreprocessType.CHW_NORMALIZED,
    doesNeedSoftmax: true,
    info: 'Fastest'
  },
  {
    path: '/public/model/efficientnet-lite4-11.onnx',
    name: 'efficientnet-lite4-11',
    preprocessType: PreprocessType.HWC_CENTERED,
    doesNeedSoftmax: false,
    info: 'Most accurate'
  }
];

interface BenchmarkPerformanceInfo {
  modelPreprocessingDuration: number,
  modelRunDuration: number,
  decisionDuration: number
}

enum PredictionType {
  TRUE_POSITIVE = 'truePositive',
  FALSE_POSITIVE = 'falsePositive',
  TRUE_NEGATIVE = 'trueNegative',
  FALSE_NEGATIVE = 'falseNegative',
}

interface PredictionInfo {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

interface Metrics {
  precision: number;
  recall: number;
  f1: number;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

class BenchmarkManager {
  private modelIndex: number;
  private analyser = new ImageAnalyser();
  private base = window.location.origin;
  private totalPerfoInfo: BenchmarkPerformanceInfo = {
    modelPreprocessingDuration: 0,
    modelRunDuration: 0,
    decisionDuration: 0
  };
  private thresholds = [
    RiskAssessment.VERY_LOW,
    RiskAssessment.LOW,
    RiskAssessment.MEDIUM,
    RiskAssessment.HIGH,
    RiskAssessment.VERY_HIGH
  ];
  private predictionInfoByThreshold: Record<number, PredictionInfo> = {};
  private nbProcessedElement = document.getElementById('js-nbProcessed') as HTMLInputElement;
  private etaElement = document.getElementById('js-eta') as HTMLInputElement;

  constructor(modelIndex: number) {
    this.modelIndex = modelIndex;
  }

  processImage(src: string): Promise<AnalyseImageInfo> {
    return new Promise(async (resolve, reject) => {
      const imageObject = new Image();
      imageObject.crossOrigin = '';
      imageObject.onerror = () => {
        console.log('error when loading image', src)
        reject();
      };
      imageObject.onload = async () => {
        let imageData: ImageData;
        try {
          imageData = await getImageData(imageObject, imageObject.width, imageObject.height);
        } catch (error) {
          console.log('could not resize center crop loaded image', src)
          reject();
          return;
        }
        const result = {
          data: new Uint8Array(imageData.data.buffer),
          width: imageData.width,
          height: imageData.height
        };
        resolve(result);
      };
      imageObject.src = src;
    });
  }

  async runAnalyse(image: {path: string, class: string}, perfoInfo: PerformanceInfo): Promise<Decision> {
    const url = `${this.base}/${image.path}`;
    const imageInfo = await this.processImage(url);
    return await this.analyser.analyseImage(imageInfo.data, imageInfo.width, imageInfo.height, perfoInfo);
  }

  async runModel(blockedIds: Set<string>) {
    console.log('Blocked ids', blockedIds);

    this.predictionInfoByThreshold = {};
    for (const threshold of this.thresholds) {
      this.predictionInfoByThreshold[threshold] = {tp: 0, fn: 0, fp: 0, tn: 0};
    }

    this.analyser.blockedIds = blockedIds;
    await this.analyser.initSession(models[this.modelIndex]);

    // Heat up the model with one inference for nothing.
    await this.runAnalyse(images[0], {} as PerformanceInfo);

    let nbProcessedImages = 0;
    const startTime = performance.now();
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const perfoInfo = {} as PerformanceInfo;
      const decision = await this.runAnalyse(image, perfoInfo);
      if (!decision.isValid || decision.isIgnored) {
        console.log('Decision invalid or ignored for', image.path);
        break;
      }

      this.totalPerfoInfo.modelPreprocessingDuration += perfoInfo.modelPreprocessingDuration;
      this.totalPerfoInfo.modelRunDuration += perfoInfo.modelRunDuration;
      this.totalPerfoInfo.decisionDuration += perfoInfo.decisionDuration;

      for (const threshold of this.thresholds) {
        this.updatePredictionInfo(image.class, decision.risk!, threshold, this.predictionInfoByThreshold[threshold]);
      }

      nbProcessedImages++;
      this.nbProcessedElement.textContent = `${nbProcessedImages} / ${images.length}`;

      const now = performance.now();
      const elapsed = now - startTime;
      const remaining = images.length - nbProcessedImages;
      const avgTimePerItem = elapsed / nbProcessedImages;
      const eta = avgTimePerItem * remaining;
      this.etaElement.textContent = `Elapsed: ${formatDuration(elapsed)} ETA: ${formatDuration(eta)}`
    }
    const avgPerfoInfo = {
      modelPreprocessingDuration: this.totalPerfoInfo.modelPreprocessingDuration / nbProcessedImages,
      modelRunDuration: this.totalPerfoInfo.modelRunDuration / nbProcessedImages,
      decisionDuration: this.totalPerfoInfo.decisionDuration / nbProcessedImages
    };
    this.printPerfoInfo(avgPerfoInfo);

    console.log(this.predictionInfoByThreshold)
    for (const threshold of this.thresholds) {
      const metrics = this.computeMetrics(this.predictionInfoByThreshold[threshold]);
      this.printMetrics(threshold, metrics);
    }
  }

  printPerfoInfo(perfoInfo: BenchmarkPerformanceInfo) {
    const total = perfoInfo.modelPreprocessingDuration + perfoInfo.modelRunDuration + perfoInfo.decisionDuration;
    console.log('Total', total.toFixed(1) + 'ms', 'modelPrep', perfoInfo.modelPreprocessingDuration.toFixed(1) + 'ms',
      'run', perfoInfo.modelRunDuration.toFixed(1) + 'ms', 'decision', perfoInfo.decisionDuration.toFixed(1) + 'ms');
  }

  evaluatePrediction(risk: RiskAssessment, threshold: RiskAssessment, isBlockedClass: boolean) {
    const predictedBlock = risk >= threshold;

    if (predictedBlock && isBlockedClass) {
      return PredictionType.TRUE_POSITIVE;
    }
    if (predictedBlock && !isBlockedClass) {
      return PredictionType.FALSE_POSITIVE;
    }
    if (!predictedBlock && !isBlockedClass) {
      return PredictionType.TRUE_NEGATIVE;
    };
    return PredictionType.FALSE_NEGATIVE;
  }

  updatePredictionInfo(classId: string, risk: RiskAssessment, threshold: RiskAssessment, predictionInfo: PredictionInfo) {
    const isBlockedClass = this.analyser.blockedIds.has(classId);

    const outcome = this.evaluatePrediction(risk, threshold, isBlockedClass);
    switch (outcome) {
      case PredictionType.TRUE_POSITIVE:
        predictionInfo.tp++;
        break;
      case PredictionType.FALSE_POSITIVE:
        predictionInfo.fp++;
        break;
      case PredictionType.TRUE_NEGATIVE:
        predictionInfo.tn++;
        break;
      case PredictionType.FALSE_NEGATIVE:
        predictionInfo.fn++;
        break;
    }
  }

  computeMetrics(predictionInfo: PredictionInfo): Metrics {
    const precision = (predictionInfo.tp + predictionInfo.fp) === 0 ? 0 : predictionInfo.tp / (predictionInfo.tp + predictionInfo.fp);
    const recall = (predictionInfo.tp + predictionInfo.fn) === 0 ? 0 : predictionInfo.tp / (predictionInfo.tp + predictionInfo.fn);
    const f1 = (precision + recall) === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return {precision: precision, recall: recall, f1: f1};
  }

  printMetrics(threshold: RiskAssessment, metrics: Metrics) {
    const thresholdName = RiskAssessment[threshold];
    console.log(thresholdName, 'Precision', metrics.precision.toFixed(3), 'Recall', metrics.recall.toFixed(3), 'F1', metrics.f1.toFixed(3));
  }
}

async function testModel(modelIndex: number) {
  const benchmark = new BenchmarkManager(modelIndex);
  const blockedIds = new Set<string>();
  spiderLikeIds.forEach(blockedIds.add, blockedIds);
  await benchmark.runModel(blockedIds);
}

// for (let i = 0; i < models.length; i++) {
//   await testModel(i);
// }
await testModel(3);

export function getMaxNbWorkers() {
  const nbThreads = window.navigator.hardwareConcurrency;
  if (nbThreads < 2) {
    return 1;
  }
  return Math.floor(nbThreads / 2);
}

export function getMaxNbImagesInAnalyse() {
  const nbThreads = window.navigator.hardwareConcurrency;
  if (nbThreads <= 2) {
    return 6 + getMaxNbWorkers();
  }
  return 10 + getMaxNbWorkers();
}

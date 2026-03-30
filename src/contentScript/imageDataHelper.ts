
export const MIN_IMAGE_WIDTH_AND_HEIGHT = 20;
export const MODEL_SIZE = 224;

export async function getImageData(imageElement: HTMLImageElement, width: number, height: number): Promise<ImageData> {
  const canvas = document.createElement("canvas");
  canvas.width = MODEL_SIZE;
  canvas.height = MODEL_SIZE;
  const ctx = canvas.getContext("2d")!;

  let sx = 0;
  let sy = 0;
  let sWidth = width;
  let sHeight = height;
  if (width > height) {
    let ratio = width / height;
    let d = (ratio * MODEL_SIZE - MODEL_SIZE) / ratio;
    sx = d / 2;
    sWidth = width - d;
  } else if (height > width) {
    let ratio = height / width;
    let d = (ratio * MODEL_SIZE - MODEL_SIZE) / ratio;
    sy = d / 2;
    sHeight = height - d;
  }
  // Center crop image then resize by canvas.
  ctx.drawImage(imageElement, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
}

export async function getImageDataFromBitmap(bitmap: ImageBitmap): Promise<ImageData> {
  const width = bitmap.width;
  const height = bitmap.height;

  // TODO: measure performance cost of having offscreencanvas
  const canvas = new OffscreenCanvas(MODEL_SIZE, MODEL_SIZE);
  const ctx = canvas.getContext("2d")!;

  let sx = 0;
  let sy = 0;
  let sWidth = width;
  let sHeight = height;
  if (width > height) {
    const ratio = width / height;
    const d = (ratio * MODEL_SIZE - MODEL_SIZE) / ratio;
    sx = d / 2;
    sWidth = width - d;
  } else if (height > width) {
    const ratio = height / width;
    const d = (ratio * MODEL_SIZE - MODEL_SIZE) / ratio;
    sy = d / 2;
    sHeight = height - d;
  }
  // Center crop image then resize by canvas.
  ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, MODEL_SIZE, MODEL_SIZE);
  return ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE);
}

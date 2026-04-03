import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";

const MODELS = [
  {
    name: "mobilenet_v4.onnx",
    url: "https://huggingface.co/onnx-community/mobilenetv4_conv_small.e2400_r224_in1k/resolve/main/onnx/model.onnx"
  },
  {
    name: "efficientnet-lite4-11.onnx",
    url: "https://huggingface.co/onnx/EfficientNet-Lite4/resolve/main/efficientnet-lite4-11.onnx"
  }
];

async function downloadFile(url, destination) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fsPromises.writeFile(destination, buffer);
}

async function main() {
  const modelsDir = path.join("public", "model");

  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, {recursive: true});
    console.log(`Created directory: ${modelsDir}`);
  }

  for (const model of MODELS) {
    const filePath = path.join(modelsDir, model.name);
    if (fs.existsSync(filePath)) {
      console.log(`Skipping existing file: ${model.name}`);
      continue;
    }
    console.log(`Downloading ${model.name}...`);
    await downloadFile(model.url, filePath);
    console.log(`Downloaded ${model.name}`);
  }
  console.log("All models are ready.");
}

main().catch((error) => {
  console.error("Failed to download models:");
  console.error(error);
  process.exit(1);
});

import json
import os

BASE_DIR = "testModel/public/imageNet1kValid"
OUTPUT_FILE = "testModel/public/imageManifest.json"

data = []

for class_folder in sorted(os.listdir(BASE_DIR)):
  folder_path = os.path.join(BASE_DIR, class_folder)

  if not os.path.isdir(folder_path):
    continue

  class_id = str(int(class_folder))

  for filename in os.listdir(folder_path):
    if filename.lower().endswith((".jpg", ".jpeg", ".png")):
      data.append({
        "path": f"imageNet1kValid/{class_folder}/{filename}",
        "class": class_id
      })

with open(OUTPUT_FILE, "w") as f:
  json.dump(data, f)

print(f"Generated {len(data)} entries")

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const express = require("express");
const multer = require("multer");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const venvPythonPath = path.join(__dirname, ".venv", "Scripts", "python.exe");
const PYTHON_BIN = process.env.PYTHON_BIN || (fs.existsSync(venvPythonPath) ? venvPythonPath : "python");

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "output");
const modelPath = path.join(__dirname, "model.pt");
const cascadePath = path.join(__dirname, "haarcascade_russian_plate_number.xml");

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, uploadDir);
  },
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname) || ".jpg";
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
    callback(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Only image uploads are allowed."));
      return;
    }

    callback(null, true);
  },
});

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadDir));
app.use("/output", express.static(outputDir));

app.get("/", (_request, response) => {
  response.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/upload", upload.array("image", 20), async (request, response) => {
  if (!request.files || request.files.length === 0) {
    response.status(400).json({ error: "Upload an image using the 'image' field." });
    return;
  }

  if (!fs.existsSync(modelPath) && !fs.existsSync(cascadePath)) {
    response.status(500).json({ error: "Add model.pt or haarcascade_russian_plate_number.xml to the project root." });
    return;
  }

  try {
    const results = [];

    for (const file of request.files) {
      const outputName = `blurred-${file.filename}`;
      const boxesName = `boxes-${file.filename}`;
      const jsonName = `detections-${path.parse(file.filename).name}.json`;
      const outputPath = path.join(outputDir, outputName);
      const boxesPath = path.join(outputDir, boxesName);
      const jsonPath = path.join(outputDir, jsonName);

      await runDetector(file.path, outputPath, boxesPath, jsonPath);

      let detections = [];
      if (fs.existsSync(jsonPath)) {
        detections = JSON.parse(fs.readFileSync(jsonPath, "utf8")).detections || [];
      }

      results.push({
        originalName: file.originalname,
        originalUrl: `/uploads/${file.filename}`,
        boxesUrl: `/output/${boxesName}`,
        outputUrl: `/output/${outputName}`,
        detectionCount: detections.length,
        detections,
      });
    }

    response.json({ results });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

function runDetector(inputPath, outputPath, boxesPath, jsonPath) {
  return new Promise((resolve, reject) => {
    const detector = spawn(PYTHON_BIN, [
      path.join(__dirname, "detect.py"),
      "--image",
      inputPath,
      "--model",
      modelPath,
      "--cascade",
      cascadePath,
      "--output",
      outputPath,
      "--boxes-output",
      boxesPath,
      "--json-output",
      jsonPath,
    ]);

    let stderr = "";

    detector.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    detector.on("error", (error) => {
      reject(new Error(`Could not start Python detector: ${error.message}`));
    });

    detector.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Detector exited with code ${code}.`));
        return;
      }

      resolve();
    });
  });
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

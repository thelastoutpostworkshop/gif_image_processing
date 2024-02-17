const express = require("express");
const app = express();
const Jimp = require("jimp");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

// Command line arguments
const [, , videoPath] = process.argv;

if (!videoPath) {
  console.log("Usage: node processVideo.js <videoPath>");
  process.exit(1);
}

if (!fs.existsSync(videoPath)) {
  console.log("Video file does not exist.");
  process.exit(1);
}

const outputPath = path.join(__dirname, "output");
if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath);
}

(async () => {
  try {
    ffmpeg.ffprobe(videoPath, async (err, metadata) => {
      if (err) {
        console.error("Error reading video metadata:", err);
        return;
      }

      const width = metadata.streams[0].width;
      const height = metadata.streams[0].height;

      if (width % 240 !== 0 || height % 240 !== 0) {
        console.error("Error: The width and height of the video must be divisible by 240.");
        process.exit(1);
      }

      const cropPositions = [
        { x: 0, y: 0 }, // Top-left
        { x: 240, y: 0 }, // Top-right
        { x: 0, y: 240 }, // Bottom-left
        { x: 240, y: 240 }, // Bottom-right
      ];

      // Process each part sequentially
      for (let index = 0; index < cropPositions.length; index++) {
        const pos = cropPositions[index];
        const outputFileName = `part_${index + 1}.mp4`;
        const outputFilePath = path.join(outputPath, outputFileName);

        await new Promise((resolve, reject) => {
          ffmpeg(videoPath)
            .videoFilters({
              filter: "crop",
              options: `240:240:${pos.x}:${pos.y}`,
            })
            .output(outputFilePath)
            .on("end", async () => {
              console.log(`${outputFileName} has been saved.`);
              await processPart(outputFilePath, index + 1); // Pass the WebSocket connection
              resolve();
            })
            .on("error", (err) => {
              console.log(`An error occurred: ${err.message}`);
              reject(err);
            })
            .run();
        });
      }
    });
  } catch (error) {
    console.error("Failed to establish WebSocket connection:", error);
  }
})();

async function processPart(videoPartPath, partIndex) {
  const framesDir = path.join(__dirname, "frames", `part_${partIndex}`);
  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir, { recursive: true });
  }

  const frameOutputPattern = path.join(framesDir, "frame_%03d.png");

  ffmpeg(videoPartPath)
    .outputOptions("-vf", "fps=1")
    .output(frameOutputPattern)
    .on("end", async function () {
      console.log(`Frames extracted for part ${partIndex} into ${framesDir}.`);
      convertFramesToBinFiles(partIndex); // Use WebSocket connection
    })
    .on("error", function (err) {
      console.log(`An error occurred while extracting frames for part ${partIndex}: ${err.message}`);
    })
    .run();
}

async function convertFramesToBinFiles(partIndex) {
  const framesDir = path.join(__dirname, "frames", `part_${partIndex}`);
  const outputDir = path.join(__dirname, "bin", `part_${partIndex}`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files = fs.readdirSync(framesDir);
  const pngFiles = files.filter((file) => path.extname(file) === ".png");

  for (const [index, file] of pngFiles.entries()) {
    try {
      const image = await Jimp.read(path.join(framesDir, file));
      let buffer = Buffer.alloc(image.bitmap.width * image.bitmap.height * 2); // Buffer for RGB565 data
      let offset = 0;

      for (let y = 0; y < image.bitmap.height; y++) {
        for (let x = 0; x < image.bitmap.width; x++) {
          const pixel = image.getPixelColor(x, y);
          const rgba = Jimp.intToRGBA(pixel);
          const rgb565 = ((rgba.r & 0xf8) << 8) | ((rgba.g & 0xfc) << 3) | (rgba.b >> 3);
          buffer.writeUInt16BE(rgb565, offset);
          offset += 2;
        }
      }

      // Define the output filename for the .bin file
      const outputFilePath = path.join(outputDir, `${path.basename(file, ".png")}.bin`);
      fs.writeFileSync(outputFilePath, buffer);
      console.log(`Frame ${index} written to ${outputFilePath}`);
    } catch (err) {
      console.error("Error processing image:", err);
    }
  }
}

const express = require("express");
const app = express();
const Jimp = require("jimp");
const WebSocket = require("ws");
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

// Setup WebSocket connection
async function setupWebSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://sphere.local/ws");

    ws.on("open", function open() {
      console.log("WebSocket connection established");
      resolve(ws);
    });

    ws.on("error", function error(error) {
      console.error("WebSocket error:", error);
      reject(error);
    });
  });
}

// Function to send WebSocket message
function sendWebSocketMessage(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(data);
    console.log("Message sent");
  } else {
    console.error("WebSocket is not open. Message not sent.");
  }
}

(async () => {
  try {
    const ws = await setupWebSocket(); // Wait for WebSocket connection

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
              await processPart(outputFilePath, index + 1, ws); // Pass the WebSocket connection
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


async function processPart(videoPartPath, partIndex, ws) {
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
      ws.send("start image");
      await convertFramesToBytesAndSend(partIndex, ws); // Use WebSocket connection
      ws.send("end image");
    })
    .on("error", function (err) {
      console.log(`An error occurred while extracting frames for part ${partIndex}: ${err.message}`);
    })
    .run();
}

async function convertFramesToBytesAndSend(partIndex, ws) {
  const framesDir = path.join(__dirname, "frames", `part_${partIndex}`);
  const files = fs.readdirSync(framesDir).filter((file) => path.extname(file) === ".png");

  for (const [index, file] of files.entries()) {
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

      if (ws.readyState === WebSocket.OPEN) {
        ws.send("start frame");
        ws.send(buffer);
        ws.send("end frame");
        console.log(`Frame ${index} sent for part ${partIndex}`);
      } else {
        console.error("WebSocket is not open. Frame not sent.");
      }
    } catch (err) {
      console.error("Error processing image:", err);
    }
  }
}
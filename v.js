const express = require("express");
const app = express();
const Jimp = require("jimp");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const os = require("os");

const outputFolder = "output";
const framesFolder = "frames";
const binFolder = "bin";
const screenPathPrefix = "screen_";

const port = 3000;

// Screen layout configuration
const layoutConfig = {
  totalScreens: 4, // Total number of screens
  screensPerRow: 2, // Number of screens per row
  screenWidth: 240, // Width of each screen (pixels)
  screenHeight: 240, // Height of each screen (pixels)
};

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

const outputPath = path.join(__dirname, outputFolder);
if (fs.existsSync(outputPath)) {
  fs.rmSync(outputPath, { recursive: true });
}
fs.mkdirSync(outputPath);

async function buildFrames() {
  return new Promise((resolve, reject) => {
    // Wrap the ffprobe call in a Promise
    ffmpeg.ffprobe(videoPath, async (err, metadata) => {
      if (err) {
        console.error("Error reading video metadata:", err);
        reject(err); // Reject the Promise on error
        return;
      }

      const width = metadata.streams[0].width;
      const height = metadata.streams[0].height;

      if (width % 240 !== 0 || height % 240 !== 0) {
        console.error("Error: The width and height of the video must be divisible by 240.");
        reject(new Error("Invalid video dimensions")); // Reject the Promise
        return;
      }

      // Process each part sequentially
      for (let index = 0; index < layoutConfig.totalScreens; index++) {
        const pos = calculateScreenPosition(index);
        const outputFileName = `${screenPathPrefix}${index}.mp4`;
        const outputFilePath = path.join(outputPath, outputFileName);

        try {
          await new Promise((innerResolve, innerReject) => {
            ffmpeg(videoPath)
              .videoFilters({
                filter: "crop",
                options: `240:240:${pos.x}:${pos.y}`,
              })
              .output(outputFilePath)
              .on("end", async () => {
                console.log(`${outputFileName} has been saved.`);
                await processPart(outputFilePath, index + 1);
                innerResolve(); // Resolve the inner Promise
              })
              .on("error", (err) => {
                console.log(`An error occurred: ${err.message}`);
                innerReject(err); // Reject the inner Promise
              })
              .run();
          });
        } catch (error) {
          reject(error); // Reject the outer Promise if any error occurs in the loop
          return;
        }
      }

      resolve(); // Resolve the outer Promise after all processing is done
    });
  });
}

async function processPart(videoPartPath, partIndex) {
  const output = path.join(__dirname, outputFolder, framesFolder, `${screenPathPrefix}${partIndex - 1}`);
  if (!fs.existsSync(output)) {
    fs.mkdirSync(output, { recursive: true });
  }

  const frameOutputPattern = path.join(output, "frame_%03d.png");

  ffmpeg(videoPartPath)
    .outputOptions("-vf", "fps=1")
    .output(frameOutputPattern)
    .on("end", async function () {
      convertFramesToBinFiles(partIndex); // Use WebSocket connection
    })
    .on("error", function (err) {
      console.log(`An error occurred while extracting frames for part ${partIndex - 1}: ${err.message}`);
    })
    .run();
}

async function convertFramesToBinFiles(partIndex) {
  const framesDir = path.join(__dirname, outputFolder, framesFolder, `${screenPathPrefix}${partIndex - 1}`);
  const outputDir = path.join(__dirname, outputFolder, binFolder, `${screenPathPrefix}${partIndex - 1}`);

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
    } catch (err) {
      console.error("Error processing image:", err);
    }
  }
}
// Function to calculate the position (x, y coordinates) of each screen based on its index
function calculateScreenPosition(screenIndex) {
  const row = Math.floor(screenIndex / layoutConfig.screensPerRow);
  const col = screenIndex % layoutConfig.screensPerRow;

  const x = layoutConfig.screenWidth * col;
  const y = layoutConfig.screenHeight * row;

  return { x, y };
}

function framesCount() {
  const screenNumber = 0;
  const framesDir = path.join(__dirname, outputFolder, framesFolder, `${screenPathPrefix}${screenNumber}`);
  return countFilesInFolder(framesDir);
}
function countFilesInFolder(folderPath) {
  try {
    // Read directory contents
    const entries = fs.readdirSync(folderPath);

    // Filter the entries to count only files
    const files = entries.filter((entry) => {
      const entryPath = path.join(folderPath, entry);
      return fs.statSync(entryPath).isFile();
    });

    // Return the count of files
    return files.length;
  } catch (error) {
    console.error("Error reading folder:", error);
    return -1; // Return 0 or handle the error as appropriate for your application
  }
}

function getServerIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e., localhost) addresses
      if ("IPv4" !== iface.family || iface.internal !== false) continue;
      return iface.address;
    }
  }
  return "0.0.0.0";
}

function getClientIP(req) {
  // Attempt to get the IP address from the 'x-forwarded-for' header first (in case of proxy)
  // Then fall back to the direct connection's remote address
  const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  return ip;
}

(async () => {
  await buildFrames(); // Wait for buildFrames to finish

  app.get("/api/frames-count", (req, res) => {
    const count = framesCount();
    console.log(`Sent Frame count = ${count} to ${getClientIP()}`);
    res.json({ count });
  });

  // And start your server
  app.listen(port, () => {
    const ip = getServerIP(); // Get the server IP
    console.log(`Image Server listening at http://${ip}:${port}`);
  });
})();

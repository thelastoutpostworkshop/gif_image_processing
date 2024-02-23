// Require the framework and instantiate it
const app = require("fastify")({ logger: false });
const Jimp = require("jimp");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const os = require("os");

const outputFolder = "output";
const framesFolder = "frames";
const binFolder = "bin";
const screenPathPrefix = "screen_";
const framePathPrefix = "frame_";

const FPS = 20;

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
                await processPartJPG(outputFilePath, index + 1);
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

async function processPartJPG(videoPartPath, partIndex) {
  const output = path.join(__dirname, outputFolder, framesFolder, `${screenPathPrefix}${partIndex - 1}`);
  if (!fs.existsSync(output)) {
    fs.mkdirSync(output, { recursive: true });
  }

  // Change the file extension from .png to .jpg
  const frameOutputPattern = path.join(output, "frame_%03d.jpg");

  return new Promise((resolve, reject) => {
    ffmpeg(videoPartPath)
      .outputOptions("-vf", `fps=${FPS}`)
      // Optionally, specify JPEG quality (e.g., 90%)
      .outputOptions("-q:v", "2") // JPEG quality scale: 2 is high quality, 31 is low quality.
      .output(frameOutputPattern)
      .on("end", function () {
        convertFramesToBinFiles(partIndex) // Assuming convertFramesToBinFiles returns a Promise
          .then(resolve)
          .catch(reject);
      })
      .on("error", function (err) {
        console.log(`An error occurred while extracting frames for part ${partIndex - 1}: ${err.message}`);
        reject(err);
      })
      .run();
  });
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
      const frameNumber = extractFrameNumberFromString(outputFilePath);
      addFrameData(partIndex - 1, frameNumber - 1, buffer);
      // console.log(`screen ${partIndex-1} frame ${frameNumber-1}`);
      fs.writeFileSync(outputFilePath, buffer);
    } catch (err) {
      console.error("Error processing image:", err);
    }
  }
}

function extractFrameNumberFromString(path) {
  const match = path.match(/frame_(\d+)/); // This regex matches "frame_" followed by one or more digits (\d+)

  if (match && match[1]) {
    return parseInt(match[1], 10); // Convert the matched group (the numbers) to an integer
  } else {
    console.error("No numbers found in the string");
    return null; // Or any other error handling or default value
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

function getFrameDataFromFile(filePath) {
  try {
    // const start = process.hrtime.bigint(); // Start time in nanoseconds

    const data = fs.readFileSync(filePath);
    // console.log(`Size of data read from ${filePath}: ${data.length} bytes`);

    // const end = process.hrtime.bigint(); // End time in nanoseconds
    // const durationInNanoseconds = end - start;
    // const durationInMilliseconds = Number(durationInNanoseconds) / 1_000_000; // Convert nanoseconds to milliseconds
    // console.log(`Read file took ${durationInMilliseconds} milliseconds.`);

    return data;
  } catch (err) {
    console.error("Error reading frame:", err);
    throw err; //
  }
}

// function getFrameData(screenNumber,frameNumber) {
//   const formattedFrameNumber = String(frameNumber+1).padStart(3, '0');
//   const frameFile = path.join(__dirname, outputFolder, binFolder, `${screenPathPrefix}${screenNumber}`, `${framePathPrefix}${formattedFrameNumber}.bin`);
//   return getFrameDataFromFile(frameFile);
// }
function getFrameJPGData(screenNumber, frameNumber) {
  const formattedFrameNumber = String(frameNumber + 1).padStart(3, "0");
  const frameFile = path.join(
    __dirname,
    outputFolder,
    framesFolder,
    `${screenPathPrefix}${screenNumber}`,
    `${framePathPrefix}${formattedFrameNumber}.jpg`
  );
  return getFrameDataFromFile(frameFile);
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
  let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // Check if the IP is in IPv6 format (IPv4-mapped IPv6)
  if (ip.startsWith("::ffff:")) {
    ip = ip.split("::ffff:")[1];
  }

  return ip;
}

(async () => {
  await buildFrames(); // Wait for buildFrames to finish

  app.get("/api/frames-count", (req, res) => {
    const count = framesCount();
    console.log(`Sending Frame count = ${count} to ${getClientIP(req)}`);
    res.send(count.toString());
  });

  app.get("/api/frame/:screenNumber/:frameNumber", (req, res) => {
    try {
      // const start = process.hrtime.bigint(); // Start time in nanoseconds

      // Convert screenNumber and frameNumber to integers
      const screenNumber = parseInt(req.params.screenNumber, 10);
      const frameNumber = parseInt(req.params.frameNumber, 10);

      // Validate the conversion results to ensure they are numbers
      if (isNaN(screenNumber) || isNaN(frameNumber)) {
        // Respond with an error if the conversion fails
        res.status(400).send("Screen number and frame number must be valid integers");
        return;
      }

      const frameData = getFrameData(screenNumber, frameNumber);
      // console.log(`Sending frame #${frameNumber} for screen #${screenNumber} to ${getClientIP(req)}`);

      // Set the appropriate Content-Type for binary data
      res.setHeader("Content-Type", "application/octet-stream");
      res.send(frameData);

      // const end = process.hrtime.bigint(); // End time in nanoseconds
      // const durationInNanoseconds = end - start;
      // const durationInMilliseconds = Number(durationInNanoseconds) / 1_000_000; // Convert nanoseconds to milliseconds
      // console.log(`API call took ${durationInMilliseconds} milliseconds.`);
    } catch (error) {
      console.error(error);
      res.status(500).send("Error retrieving frame data");
    }
  });
  app.get("/api/framejpg/:screenNumber/:frameNumber", (req, res) => {
    try {
      // const start = process.hrtime.bigint(); // Start time in nanoseconds

      // Convert screenNumber and frameNumber to integers
      const screenNumber = parseInt(req.params.screenNumber, 10);
      const frameNumber = parseInt(req.params.frameNumber, 10);
      console.log(`Sending frame #${frameNumber} for screen #${screenNumber} to ${getClientIP(req)}`);

      // Validate the conversion results to ensure they are numbers
      if (isNaN(screenNumber) || isNaN(frameNumber)) {
        // Respond with an error if the conversion fails
        res.status(400).send("Screen number and frame number must be valid integers");
        return;
      }

      const frameData = getFrameJPGData(screenNumber, frameNumber);
      console.log(`Sending frame #${frameNumber} for screen #${screenNumber} to ${getClientIP(req)}`);

      // Set the appropriate Content-Type for binary data
      // res.setHeader("Content-Type", "application/octet-stream");

      res.send(frameData);

      // const end = process.hrtime.bigint(); // End time in nanoseconds
      // const durationInNanoseconds = end - start;
      // const durationInMilliseconds = Number(durationInNanoseconds) / 1_000_000; // Convert nanoseconds to milliseconds
      // console.log(`API call took ${durationInMilliseconds} milliseconds.`);
    } catch (error) {
      console.error(error);
      res.status(500).send("Error retrieving frame data");
    }
  });

  app.listen({ port: 3000, host: "192.168.1.90" }, (err, address) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    } else {
      console.log(`Image Server listening at ${address}`);
    }
  });
})();

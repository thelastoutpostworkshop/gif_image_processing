// GIF Server program
//
const app = require("fastify")({ logger: false });
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

const outputFolder = "output";
const framesFolder = "frames";
const binFolder = "bin";
const screenPathPrefix = "screen_";
const framePathPrefix = "frame_";

const FPS = 24;

const port = 80;

// Screen layout configuration
const layoutConfig = {
  totalScreens: 8, // Total number of screens
  screensPerRow: 4, // Number of screens per row
  screenWidth: 240, // Width of each screen (pixels)
  screenHeight: 240, // Height of each screen (pixels)
  screens: [
    {
      id: "206947137185152",
      screenDetails: [
        { num: 0, x: 0, y: 0 },
        { num: 1, x: 240, y: 0 },
        { num: 2, x: 480, y: 0 },
        { num: 3, x: 720, y: 0 },
      ],
    },
    {
      id: "84024946623796",
      screenDetails: [
        { num: 0, x: 0, y: 240 },
        { num: 1, x: 240, y: 240 },
        { num: 2, x: 480, y: 240 },
        { num: 3, x: 720, y: 240 },
      ],
    },
  ],
};
//   screens: [
//     {
//       id: "206947137185152",
//       screenDetails: [
//         { num: 0, x: 240, y: 0 },
//         { num: 1, x: 240, y: 240 },
//         { num: 2, x: 240, y: 480 },
//         { num: 3, x: 240, y: 720 },
//       ],
//     },
//     {
//       id: "84024946623796",
//       screenDetails: [
//         { num: 0, x: 0, y: 0 },
//         { num: 1, x: 0, y: 240 },
//         { num: 2, x: 0, y: 480 },
//         { num: 3, x: 0, y: 720 },
//       ],
//     },
//   ],
// };

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

function checkLayoutResolution() {
  let maxWidth = 0;
  let maxHeight = 0;

  layoutConfig.screens.forEach((group) => {
    group.screenDetails.forEach((screen) => {
      // Calculate the rightmost and bottommost edges of each screen
      const rightEdge = screen.x + layoutConfig.screenWidth;
      const bottomEdge = screen.y + layoutConfig.screenHeight;

      // Update maxWidth and maxHeight if this screen extends beyond the previous maximum
      maxWidth = Math.max(maxWidth, rightEdge);
      maxHeight = Math.max(maxHeight, bottomEdge);
    });
  });

  // Calculate the expected total width and height based on the layout configuration
  const expectedWidth = layoutConfig.screensPerRow * layoutConfig.screenWidth;
  // Assuming each row has the same number of screens and screens are evenly distributed in rows
  const numRows = layoutConfig.totalScreens / layoutConfig.screensPerRow;
  const expectedHeight = numRows * layoutConfig.screenHeight;

  // Check if the calculated dimensions match the expected dimensions
  if (maxWidth === expectedWidth && maxHeight === expectedHeight) {
    return true;
  } else {
    console.log(`Mismatch in layout resolution. Expected: ${expectedWidth}x${expectedHeight}, Found: ${maxWidth}x${maxHeight}`);
    return false;
  }
}

async function buildAnimatedGIF() {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, async (err, metadata) => {
      if (err) {
        console.error("Error reading video metadata:", err);
        reject(err);
        return;
      }

      const width = metadata.streams[0].width;
      const height = metadata.streams[0].height;

      if (width % layoutConfig.screenWidth !== 0 || height % layoutConfig.screenHeight !== 0) {
        console.error("Error: The video dimensions must be divisible by the screen dimensions.");
        reject(new Error("Invalid video dimensions"));
        return;
      }

      try {
        for (const screenGroup of layoutConfig.screens) {
          for (const screen of screenGroup.screenDetails) {
            const outputFileName = `screen_${screenGroup.id}_${screen.num}.gif`; // Changed extension to .gif
            const outputFilePath = path.join(__dirname, outputFolder, outputFileName);

            await new Promise((innerResolve, innerReject) => {
              ffmpeg(videoPath)
                .videoFilters([
                  {
                    filter: "crop",
                    options: `${layoutConfig.screenWidth}:${layoutConfig.screenHeight}:${screen.x}:${screen.y}`,
                  },
                  {
                    filter: "fps", // Adjust frame rate for the GIF
                    options: FPS, // Example frame rate, adjust as needed
                  },
                ])
                .outputOptions([
                  "-pix_fmt",
                  "rgb24", // This can help with color representation in GIFs
                  "-loop",
                  "0", // Make the GIF loop
                ])
                .output(outputFilePath)
                .on("end", async () => {
                  console.log(`${outputFileName} has been saved.`);
                  innerResolve();
                })
                .on("error", (err) => {
                  console.log(`An error occurred: ${err.message}`);
                  innerReject(err);
                })
                .run();
            });
          }
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function buildFramesWithLayout() {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, async (err, metadata) => {
      if (err) {
        console.error("Error reading video metadata:", err);
        reject(err);
        return;
      }

      const width = metadata.streams[0].width;
      const height = metadata.streams[0].height;

      if (width % layoutConfig.screenWidth !== 0 || height % layoutConfig.screenHeight !== 0) {
        console.error("Error: The video dimensions must be divisible by the screen dimensions.");
        reject(new Error("Invalid video dimensions"));
        return;
      }

      try {
        for (const screenGroup of layoutConfig.screens) {
          for (const screen of screenGroup.screenDetails) {
            const outputFileName = `screen_${screenGroup.id}_${screen.num}.mp4`;
            const outputFilePath = path.join(__dirname, outputFolder, outputFileName);

            await new Promise((innerResolve, innerReject) => {
              ffmpeg(videoPath)
                .videoFilters({
                  filter: "crop",
                  options: `${layoutConfig.screenWidth}:${layoutConfig.screenHeight}:${screen.x}:${screen.y}`,
                })
                .output(outputFilePath)
                .on("end", async () => {
                  await processPartJPG(outputFilePath, screenGroup, screen);

                  console.log(`${outputFileName} has been saved.`);
                  innerResolve();
                })
                .on("error", (err) => {
                  console.log(`An error occurred: ${err.message}`);
                  innerReject(err);
                })
                .run();
            });
          }
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function processPartJPG(videoPartPath, screenGroup, screen) {
  const output = path.join(__dirname, outputFolder, framesFolder, screenGroup.id, `${screenPathPrefix}${screen.num}`);
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
        // Directly resolve the promise since convertFramesToBinFiles(partIndex) call is removed
        resolve();
      })
      .on("error", function (err) {
        console.log(`An error occurred while extracting frames for part ${partIndex - 1}: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

function framesCount() {
  const framesDir = path.join(__dirname, outputFolder, framesFolder, layoutConfig.screens[0].id, `${screenPathPrefix}0`);
  return countFilesInFolder(framesDir);
}

function getFrameDataFromFile(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    return data;
  } catch (err) {
    console.error("Error reading frame:", err);
    throw err; //
  }
}

function getFrameJPGData(espid, screenNumber, frameNumber) {
  const formattedFrameNumber = String(frameNumber + 1).padStart(3, "0");
  const frameFile = path.join(
    __dirname,
    outputFolder,
    framesFolder,
    espid,
    `${screenPathPrefix}${screenNumber}`,
    `${framePathPrefix}${formattedFrameNumber}.jpg`
  );
  return getFrameDataFromFile(frameFile);
}
function getGifData(espid, screenNumber) {
  const gifFile = path.join(__dirname, outputFolder, screenPathPrefix + espid + `_${screenNumber}.gif`);
  return getFrameDataFromFile(gifFile);
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

function getClientIP(req) {
  let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // Check if the IP is in IPv6 format (IPv4-mapped IPv6)
  if (ip.startsWith("::ffff:")) {
    ip = ip.split("::ffff:")[1];
  }

  return ip;
}

(async () => {
  if (!checkLayoutResolution()) {
    process.exit(1);
  }
  // await buildFramesWithLayout();
  await buildAnimatedGIF();

  app.get("/api/frames-count", (req, res) => {
    const count = framesCount();
    console.log(`Sending Frame count = ${count} to ${getClientIP(req)}`);
    res.send(count.toString());
  });

  app.get("/api/gif/:espid/:screenNumber", (req, res) => {
    try {
      const screenNumber = parseInt(req.params.screenNumber, 10);
      const espid = req.params.espid;
      // console.log(`ESP id=${espid}`);
      // console.log(`Sending frame #${frameNumber} for screen #${screenNumber} to ${getClientIP(req)}`);

      // Validate the conversion results to ensure they are numbers
      if (isNaN(screenNumber)) {
        // Respond with an error if the conversion fails
        res.status(400).send("Screen number and frame number must be valid integers");
        return;
      }

      const gifData = getGifData(espid, screenNumber);
      console.log(`Sending gif for screen #${screenNumber} to ESPID=${espid} ip=${getClientIP(req)}`);

      res.send(gifData);
    } catch (error) {
      console.error(error);
      res.status(500).send("Error retrieving gif data");
    }
  });

  app.get("/api/framejpg/:espid/:screenNumber/:frameNumber", (req, res) => {
    try {
      const screenNumber = parseInt(req.params.screenNumber, 10);
      const frameNumber = parseInt(req.params.frameNumber, 10);
      const espid = req.params.espid;
      // console.log(`ESP id=${espid}`);
      // console.log(`Sending frame #${frameNumber} for screen #${screenNumber} to ${getClientIP(req)}`);

      // Validate the conversion results to ensure they are numbers
      if (isNaN(screenNumber) || isNaN(frameNumber)) {
        // Respond with an error if the conversion fails
        res.status(400).send("Screen number and frame number must be valid integers");
        return;
      }

      const frameData = getFrameJPGData(espid, screenNumber, frameNumber);
      console.log(`Sending frame #${frameNumber} for screen #${screenNumber} to ESPID=${espid} ip=${getClientIP(req)}`);

      res.send(frameData);
    } catch (error) {
      console.error(error);
      res.status(500).send("Error retrieving frame data");
    }
  });

  app.listen({ port: port, host: "192.168.1.90" }, (err, address) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    } else {
      console.log(`Image Server listening at ${address}`);
    }
  });
})();

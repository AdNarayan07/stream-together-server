import express from "express";
import fs from "fs";
import path from "path";
import axios from "axios";
import WebTorrent from "webtorrent";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

// Set FFmpeg binary path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const PORT = 3000;
const VIDEO_DIR = path.join(process.cwd(), "videos");

// Ensure the videos directory exists
if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR);
}

// Middleware to parse JSON bodies
app.use(express.json());

// Serve video files with streaming
app.get("/videos/:filename", (req, res) => {
  const { filename } = req.params;
  const videoPath = path.join(VIDEO_DIR, filename);

  fs.stat(videoPath, (err, stats) => {
    if (err || !stats.isFile()) {
      return res.status(404).send("File not found");
    }

    const range = req.headers.range;
    const videoSize = stats.size;

    if (!range) {
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Length": videoSize,
      });
      fs.createReadStream(videoPath).pipe(res);
    } else {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : videoSize - 1;

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${videoSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "video/mp4",
      });

      fs.createReadStream(videoPath, { start, end }).pipe(res);
    }
  });
});

// Download a video from a direct URL
app.post("/download/url", async (req, res) => {
  const { url, filename } = req.body;

  if (!url || !filename) {
    return res.status(400).send("URL and filename are required");
  }

  const videoPath = path.join(VIDEO_DIR, filename);

  try {
    const response = await axios({ method: "get", url, responseType: "stream" });
    const writer = fs.createWriteStream(videoPath);

    response.data.pipe(writer);
    writer.on("finish", () => res.status(200).send("Video downloaded successfully"));
    writer.on("error", (err) => {
      console.error("Error downloading video:", err);
      res.status(500).send("Error downloading video");
    });
  } catch (err) {
    console.error("Error downloading video:", err);
    res.status(500).send("Failed to download video from URL");
  }
});

// Download a video using a torrent magnet link
app.post("/download/torrent", (req, res) => {
  const { magnetLink } = req.body;

  if (!magnetLink) {
    return res.status(400).send("Magnet link is required");
  }

  const client = new WebTorrent();

  client.add(magnetLink, { path: VIDEO_DIR }, (torrent) => {
    console.log(`Downloading torrent: ${torrent.name}`);

    torrent.on("done", () => {
      console.log(`Torrent download complete: ${torrent.name}`);
      res.status(200).send(`Downloaded: ${torrent.name}`);
      client.destroy();
    });

    torrent.on("error", (err) => {
      console.error("Error downloading torrent:", err);
      res.status(500).send("Error downloading torrent");
      client.destroy();
    });
  });
});

// Change video codec
app.post("/process/change-codec", (req, res) => {
  const { inputFilename, outputFilename, codec } = req.body;

  if (!inputFilename || !outputFilename || !codec) {
    return res.status(400).send("Input filename, output filename, and codec are required");
  }

  const inputPath = path.join(VIDEO_DIR, inputFilename);
  const outputPath = path.join(VIDEO_DIR, outputFilename);

  ffmpeg(inputPath)
    .videoCodec(codec)
    .on("end", () => res.status(200).send(`File converted successfully to ${outputFilename}`))
    .on("error", (err) => {
      console.error("Error changing codec:", err);
      res.status(500).send("Error changing codec");
    })
    .save(outputPath);
});

// Compress video
app.post("/process/compress", (req, res) => {
  const { inputFilename, outputFilename } = req.body;

  if (!inputFilename || !outputFilename) {
    return res.status(400).send("Input filename and output filename are required");
  }

  const inputPath = path.join(VIDEO_DIR, inputFilename);
  const outputPath = path.join(VIDEO_DIR, outputFilename);

  ffmpeg(inputPath)
    .videoCodec("libx264")
    .size("50%")
    .on("end", () => res.status(200).send(`File compressed successfully to ${outputFilename}`))
    .on("error", (err) => {
      console.error("Error compressing video:", err);
      res.status(500).send("Error compressing video");
    })
    .save(outputPath);
});

// Extract subtitles
app.post("/process/extract-subtitles", (req, res) => {
  const { inputFilename, outputFilename } = req.body;

  if (!inputFilename || !outputFilename) {
    return res.status(400).send("Input filename and output filename are required");
  }

  const inputPath = path.join(VIDEO_DIR, inputFilename);
  const outputPath = path.join(VIDEO_DIR, outputFilename);

  ffmpeg(inputPath)
    .outputOptions("-map 0:s:0")
    .on("end", () => res.status(200).send(`Subtitles extracted to ${outputFilename}`))
    .on("error", (err) => {
      console.error("Error extracting subtitles:", err);
      res.status(500).send("Error extracting subtitles");
    })
    .save(outputPath);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

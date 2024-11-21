import express from "express";
import fs from "fs";
import path from "path";
import axios from "axios";
import WebTorrent from "webtorrent";

const app = express();
const PORT = 3000;
const VIDEO_DIR = path.join(process.cwd(), "videos");

// Ensure the videos directory exists
if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR);
}

// Serve video files
app.get("/videos/:filename", (req, res) => {
  try {
    const { filename } = req.params;
    const videoPath = path.join(VIDEO_DIR, filename);

    fs.stat(videoPath, (err, stats) => {
      if (err || !stats.isFile()) {
        return res.status(404).send("File not found");
      }

      const range = req.headers.range;
      const videoSize = stats.size;

      if (!range) {
        const headers = {
          "Content-Type": "video/mp4",
          "Content-Length": videoSize,
        };
        res.writeHead(200, headers);
        fs.createReadStream(videoPath).pipe(res);
      } else {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : videoSize - 1;

        const chunkSize = end - start + 1;
        const headers = {
          "Content-Range": `bytes ${start}-${end}/${videoSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": "video/mp4",
        };

        res.writeHead(206, headers);
        fs.createReadStream(videoPath, { start, end }).pipe(res);
      }
    });
  } catch (err) {
    console.error("Error in video streaming:", err);
    res.status(500).send("Internal server error");
  }
});

// Download a video from a direct URL
app.post("/download/url", express.json(), async (req, res) => {
  const { url, filename } = req.body;

  if (!url || !filename) {
    return res.status(400).send("URL and filename are required");
  }

  const videoPath = path.join(VIDEO_DIR, filename);

  try {
    const response = await axios({
      method: "get",
      url,
      responseType: "stream",
    });

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
app.post("/download/torrent", express.json(), (req, res) => {
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

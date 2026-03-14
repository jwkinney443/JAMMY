const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

function deezerGet(apiPath) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.deezer.com",
        path: apiPath,
        method: "GET",
        headers: { Accept: "application/json" },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function serveStatic(res, urlPath) {
  const filePath = path.join(
    __dirname,
    "public",
    urlPath === "/" ? "index.html" : urlPath
  );

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const types = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
    };

    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "text/plain",
    });

    res.end(data);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function mapTrack(t) {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist?.name || "",
    album: t.album?.title || "",
    cover: t.album?.cover_medium || t.album?.cover || "",
    preview: t.preview || "",
    deezer: t.link || `https://www.deezer.com/track/${t.id}`,
    year: "",
  };
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  // CHART — fetch tracks from a specific Deezer genre chart
  if (p === "/api/chart") {
    const genreId = url.searchParams.get("genre") || "0"; // 0 = overall top tracks
    deezerGet(`/chart/${genreId}/tracks?limit=100`)
      .then((data) => sendJson(res, 200, (data.data || []).map(mapTrack)))
      .catch((e) => sendJson(res, 500, { error: e.message }));
    return;
  }

  // SEARCH
  if (p === "/api/search") {
    const q = url.searchParams.get("q");

    if (!q) {
      sendJson(res, 400, { error: "Missing q" });
      return;
    }

    deezerGet(`/search/track?q=${encodeURIComponent(q)}&limit=50`)
      .then((data) => sendJson(res, 200, (data.data || []).map(mapTrack)))
      .catch((e) => sendJson(res, 500, { error: e.message }));

    return;
  }

  // TRACK
  if (p.startsWith("/api/track/")) {
    const id = p.split("/").pop();

    deezerGet(`/track/${id}`)
      .then((t) => sendJson(res, 200, mapTrack(t)))
      .catch((e) => sendJson(res, 500, { error: e.message }));

    return;
  }

  serveStatic(res, p);
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () =>
  console.log(`\n🎵 MVDLE running at http://localhost:${PORT}\n`)
);
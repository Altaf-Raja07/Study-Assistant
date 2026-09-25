import express from "express";
import generateHandler from "./generate.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(express.json());

if (process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, "../dist")));
}

app.post("/api/generate", generateHandler);

if (process.env.VERCEL) {
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(path.join(__dirname, "../dist/index.html"));
    } else {
      next();
    }
  });
}

if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    if (!process.env.GROQ_API_KEY) {
      console.warn(
        "[server] warning: GROQ_API_KEY is not set. Copy .env.example to .env and add your key — generation requests will fail until you do.",
      );
    }
  });

  // Without this listener a port conflict is near-silent: the 'listening'
  // callback still fires (misleadingly logging that startup succeeded), then
  // the server is torn down and Node exits 0 — which makes `concurrently -k`
  // kill Vite, so the frontend just never comes up. Fail loudly instead.
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[server] error: port ${PORT} is already in use. Another copy of the backend is probably still running.\n` +
          `[server] fix: stop it with \`lsof -ti tcp:${PORT} | xargs -r kill\`, then re-run \`npm start\`.`,
      );
    } else {
      console.error(`[server] error: ${err.message}`);
    }
    process.exit(1);
  });
}

export default app;

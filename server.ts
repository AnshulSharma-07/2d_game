import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Database
  const db = new Database("game.db");
  db.exec(`
    CREATE TABLE IF NOT EXISTS highscores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      date TEXT NOT NULL
    )
  `);

  app.use(express.json());

  // API Routes
  app.get("/api/highscores", (req, res) => {
    try {
      const scores = db.prepare("SELECT name, score, date FROM highscores ORDER BY score DESC LIMIT 10").all();
      res.json(scores);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch high scores" });
    }
  });

  app.post("/api/highscores", (req, res) => {
    const { name, score } = req.body;
    if (!name || typeof score !== "number") {
      return res.status(400).json({ error: "Invalid name or score" });
    }

    try {
      const date = new Date().toLocaleDateString();
      db.prepare("INSERT INTO highscores (name, score, date) VALUES (?, ?, ?)").run(name, score, date);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to save high score" });
    }
  });

  app.get("/api/players", (req, res) => {
    try {
      const players = db.prepare("SELECT DISTINCT name FROM highscores ORDER BY name ASC").all();
      res.json(players.map((p: any) => p.name));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "appdb",
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.get("/api/items", async (req, res) => {
  const result = await pool.query("SELECT * FROM items");
  res.json(result.rows);
});

app.listen(3001, () => console.log("Backend running on :3001"));
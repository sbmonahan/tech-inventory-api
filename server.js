import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import express from "express";
import morgan from "morgan";
import crypto from "crypto";
import yaml from "js-yaml";          // <- parses openapi.yaml
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data files (plain text files containing JSON)
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.txt");
const SEED_FILE = path.join(DATA_DIR, "seed.txt");
const OAS_FILE = path.join(__dirname, "openapi.yaml");

// Ensure data dir & db files exist
async function ensureFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, "[]\n", "utf8");
  }
  try {
    await fs.access(SEED_FILE);
  } catch {
    // default seed with a few tech items
    const seed = JSON.stringify(
      [
        {
          id: crypto.randomUUID(),
          name: "ThinkPad X1 Carbon",
          type: "laptop",
          price: 1899.0,
          in_stock: true,
          tags: ["ultrabook", "14in"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          name: "Pixel Phone",
          type: "phone",
          price: 799.0,
          in_stock: true,
          tags: ["android", "camera"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          name: "USB-C Hub",
          type: "accessory",
          price: 49.99,
          in_stock: false,
          tags: ["dock", "usb-c"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      null,
      2
    ) + "\n";
    await fs.writeFile(SEED_FILE, seed, "utf8");
    // initialize DB with seed on first run
    await fs.writeFile(DB_FILE, seed, "utf8");
  }
}

function getNextId(items) {
  // tolerate numeric ids stored as numbers or strings
  const max = items.reduce((m, i) => {
    const v = typeof i.id === "number" ? i.id : Number(i.id);
    return Number.isFinite(v) ? Math.max(m, v) : m;
  }, 0);
  return max + 1;
}

function parseIdParam(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function readDB() {
  const raw = await fs.readFile(DB_FILE, "utf8");
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error("DB is not an array");
    return data;
  } catch (err) {
    throw new Error(`Failed to parse DB file: ${err.message}`);
  }
}

async function writeDB(items) {
  // Write atomically: write to temp and rename
  const tmp = DB_FILE + ".tmp";
  const content = JSON.stringify(items, null, 2) + "\n";
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, DB_FILE);
}

function validateItemInput(body, { partial = false } = {}) {
  const allowedTypes = ["laptop", "phone", "accessory", "component", "service"];
  const required = ["name", "type", "price", "in_stock"];
  if (!partial) {
    for (const k of required) {
      if (!(k in body)) return `Missing required field: ${k}`;
    }
  }
  if ("type" in body && !allowedTypes.includes(body.type)) {
    return `Invalid type. Allowed: ${allowedTypes.join(", ")}`;
  }
  if ("price" in body && (typeof body.price !== "number" || body.price < 0)) {
    return "price must be a non-negative number";
  }
  if ("name" in body && (typeof body.name !== "string" || body.name.trim().length === 0)) {
    return "name must be a non-empty string";
  }
  if ("in_stock" in body && typeof body.in_stock !== "boolean") {
    return "in_stock must be boolean";
  }
  if ("tags" in body && !Array.isArray(body.tags)) {
    return "tags must be an array of strings";
  }
  return null;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// ---------- Usage (/usage) built from openapi.yaml ----------
let USAGE_CACHE = null;
async function buildUsageFromOAS() {
  if (USAGE_CACHE) return USAGE_CACHE;

  const raw = await fs.readFile(OAS_FILE, "utf8");
  // tolerate JSON as well; yaml.load handles both
  const doc = yaml.load(raw) ?? {};

  const title = doc?.info?.title ?? "API";
  const version = doc?.info?.version ?? "unknown";
  const serverUrl =
    (Array.isArray(doc?.servers) && doc.servers[0]?.url) || "http://localhost:3000";

  const methodList = ["get", "post", "put", "patch", "delete", "options", "head"];

  const lines = [];
  lines.push(`${title} (v${version})`);
  lines.push(`Base URL: ${serverUrl}`);
  if (doc?.info?.description) {
    lines.push("");
    lines.push(String(doc.info.description).trim());
  }
  lines.push("");
  lines.push("Endpoints:");

  const paths = doc?.paths || {};
  for (const [p, ops] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(ops)) {
      if (!methodList.includes(method)) continue; // skip $ref/parameters keys
      const summary = op?.summary || "(no summary)";
      lines.push(`- ${method.toUpperCase()} ${p} — ${summary}`);

      // crude cURL suggestion
      const hasBody = Boolean(op?.requestBody);
      const curlParts = [`curl -X ${method.toUpperCase()} "${serverUrl}${p}"`];
      if (hasBody) {
        curlParts.push(`-H "content-type: application/json" -d '{"...": "..."}'`);
      }
      lines.push(`  e.g., ${curlParts.join(" ")}`);
    }
  }

  lines.push("");
  lines.push("Tip: Get the full spec at /openapi.yaml");

  USAGE_CACHE = lines.join("\n");
  return USAGE_CACHE;
}

app.get("/usage", async (req, res, next) => {
  try {
    if (req.query.refresh === "1" || req.query.refresh === "true") {
      USAGE_CACHE = null;
    }
    const usage = await buildUsageFromOAS();
    res.type("text/plain").send(usage);
  } catch (e) {
    next(e);
  }
});
// ------------------------------------------------------------

// Health
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

// List items
app.get("/items", async (req, res, next) => {
  try {
    const { q, type } = req.query;
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10), 200);
    const offset = Math.max(parseInt(req.query.offset ?? "0", 10), 0);
    let items = await readDB();

    if (type) items = items.filter((i) => i.type === type);
    if (q) {
      const needle = String(q).toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(needle) ||
          (Array.isArray(i.tags) && i.tags.some((t) => t.toLowerCase().includes(needle)))
      );
    }

    const total = items.length;
    const paged = items.slice(offset, offset + limit);
    res.json({ total, items: paged });
  } catch (e) {
    next(e);
  }
});

// Get by id
app.get("/items/:id", async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) return res.status(404).json({ error: "Not found" });
    const items = await readDB();
    const item = items.find((i) => (typeof i.id === 'number' ? i.id === id : Number(i.id) === id));
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (e) {
    next(e);
  }
});

// Create
app.post("/items", async (req, res, next) => {
  try {
    const err = validateItemInput(req.body);
    if (err) return res.status(400).json({ error: err });

    const now = new Date().toISOString();
    const items = await readDB();
    const item = {
      id: getNextId(items),
      name: req.body.name,
      type: req.body.type,
      price: req.body.price,
      in_stock: req.body.in_stock,
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      createdAt: now,
      updatedAt: now,
    };

    items.push(item);
    await writeDB(items);

    res.status(201).location(`/items/${item.id}`).json(item);
  } catch (e) {
    next(e);
  }
});

// Replace (PUT)
app.put("/items/:id", async (req, res, next) => {
  try {
    const err = validateItemInput(req.body);
    if (err) return res.status(400).json({ error: err });

  const id = parseIdParam(req.params.id);
  if (id === null) return res.status(404).json({ error: "Not found" });

  const items = await readDB();
  const idx = items.findIndex((i) => (typeof i.id === 'number' ? i.id === id : Number(i.id) === id));
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  const existing = items[idx];
    const updated = {
      ...existing,
      name: req.body.name,
      type: req.body.type,
      price: req.body.price,
      in_stock: req.body.in_stock,
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      updatedAt: new Date().toISOString(),
    };
    items[idx] = updated;
    await writeDB(items);
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// Partial update (PATCH)
app.patch("/items/:id", async (req, res, next) => {
  try {
    const err = validateItemInput(req.body, { partial: true });
    if (err) return res.status(400).json({ error: err });

  const id = parseIdParam(req.params.id);
  if (id === null) return res.status(404).json({ error: "Not found" });

  const items = await readDB();
  const idx = items.findIndex((i) => (typeof i.id === 'number' ? i.id === id : Number(i.id) === id));
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  const existing = items[idx];
    const updated = {
      ...existing,
      ...req.body,
      // ensure tags is an array when present
      tags: req.body.tags ? (Array.isArray(req.body.tags) ? req.body.tags : existing.tags) : existing.tags,
      updatedAt: new Date().toISOString(),
    };

    items[idx] = updated;
    await writeDB(items);
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// Delete
app.delete("/items/:id", async (req, res, next) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) return res.status(404).json({ error: "Not found" });

    const items = await readDB();
    const idx = items.findIndex((i) => (typeof i.id === 'number' ? i.id === id : Number(i.id) === id));
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    items.splice(idx, 1);
    await writeDB(items);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// Reset DB to seed
app.post("/reset", async (_req, res, next) => {
  try {
    const seed = await fs.readFile(SEED_FILE, "utf8");
    // Validate seed is JSON array before writing
    JSON.parse(seed);
    await fs.writeFile(DB_FILE, seed, "utf8");
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// Serve the OpenAPI file (handy for docs tools)
app.get("/spec", (_req, res) => {
  const stream = createReadStream(OAS_FILE);
  res.type("text/yaml");
  stream.pipe(res);
});

// Basic error handler
app.use((err, _req, res, _next) => {
  // log to stdout/stderr so container logs capture it
  console.error(err && err.stack ? err.stack : err);
  try {
    res.status(500).json({ error: err && err.message ? err.message : "internal error" });
  } catch (e) {
    // fallback if headers already sent
    console.error("Failed to send error response:", e);
  }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function main() {
  await ensureFiles();

  // Support CLI reset: `node server.js --reset` (package.json script expects this)
  if (process.argv.includes("--migrate-ids")) {
    // Read DB, reassign integer ids sequentially starting at 1, update DB and seed
    const items = await readDB();
    if (!items || items.length === 0) {
      console.log("No items to migrate.");
      process.exit(0);
    }
    const mapping = new Map();
    let next = 1;
    const migrated = items.map((it) => {
      const old = it.id;
      const id = next++;
      mapping.set(String(old), id);
      return { ...it, id };
    });
    await writeDB(migrated);
    await fs.writeFile(SEED_FILE, JSON.stringify(migrated, null, 2) + "\n", "utf8");
    console.log("Migration complete. ID mapping (old -> new):");
    for (const [old, id] of mapping.entries()) console.log(`${old} -> ${id}`);
    process.exit(0);
  }

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});

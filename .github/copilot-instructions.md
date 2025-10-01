## Tech Inventory API — Agent instructions

Purpose: help an AI coding agent become immediately productive in this repository by describing the runtime shape, key files, developer workflows, and project-specific patterns.

Quick run (dev & prod)
- Install & run locally (works on Windows/macOS/Linux with Node >= 18/20):
  ```bash
  npm install
  npm run dev        # node --watch server.js (dev)
  npm run start      # node server.js (production-like)
  ```
- Docker (dev): uses `docker-compose.yml`; Docker (prod): `docker-compose.prod.yml` or build with `Dockerfile`.
  ```bash
  # dev
  docker compose up --build
  # prod
  docker compose -f docker-compose.prod.yml up -d --build
  ```

Big picture
- Single-process Express API that persists data to a simple file-backed JSON array under `data/db.txt`.
- OpenAPI contract is authoritative: `openapi.yaml` describes endpoints and is also read at runtime to produce `/usage` text.
- The app is intentionally small: request handlers live in `server.js`; the service provides CRUD for `/items`, a `POST /reset` to restore `data/seed.txt`, and helper routes `/openapi.yaml` and `/usage`.

Key files and what they show (examples)
- `server.js` — entire API implementation. Notable patterns:
  - ES modules (package.json: `type: "module").
  - Express with `express.json({ limit: '1mb' })` and `morgan('dev')`.
  - DB is a JSON array in `data/db.txt`; `readDB()` parses it and `writeDB()` writes atomically to `db.txt.tmp` then renames.
  - Input validation via `validateItemInput()`; allowed `type` values: `laptop, phone, accessory, component, service`.
  - `/usage` is generated from `openapi.yaml` using `js-yaml` at runtime.
- `openapi.yaml` — the OpenAPI 3.1 contract. Use this for expected request/response shapes and example cURL commands.
- `Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml` — show recommended Node version (Node 20 in images), port (3000), and a persisted `data` volume.

Developer workflows & useful commands
- Quick health check: `curl http://localhost:3000/healthz` (should return `{ status: "ok" }`).
- Usage text: `curl http://localhost:3000/usage` (optionally `?refresh=1` to re-read `openapi.yaml`).
- Seed/reset:
  - There is a `POST /reset` endpoint which copies `data/seed.txt` over `data/db.txt`.
  - package.json contains a script `npm run reset` that runs `node server.js --reset` — note: when changing CLI behavior, check `server.js` for argv handling (I did not find a `process.argv` handler in the code read). If `--reset` CLI support is required, add/verify it in `server.js`.

API examples (explicit)
- List items:
  curl -X GET "http://localhost:3000/items"
- Create item:
  curl -X POST "http://localhost:3000/items" -H "content-type: application/json" -d '{"name":"Widget","type":"accessory","price":9.99,"inStock":true}'
- Reset DB (server must be running):
  curl -X POST "http://localhost:3000/reset"
- Get usage text (derived from `openapi.yaml`):
  curl "http://localhost:3000/usage?refresh=1"

Project-specific conventions & gotchas
- Data is file-backed JSON (not a DB). `writeDB()` is atomic (tmp file + rename) but there is no multi-process locking — concurrent writers can still lose updates. Treat the app as single-writer or add external locking if you need concurrent writes.
- The OpenAPI file is treated as the source of truth for endpoints and docs. The runtime builds a `/usage` string from it — update `openapi.yaml` when adding endpoints.
- ES module code style (import/export, `fileURLToPath` to compute __dirname) — avoid CommonJS require() without changing package.json.
- Docker images use Node 20 (Dockerfile). Local Node should be similar to avoid runtime surprises.

Where to look when changing behavior
- Endpoints & validation: `server.js` (search `validateItemInput`, `readDB`, `writeDB`).
- Contract & examples: `openapi.yaml` (the `paths` section lists expected parameters and payload shapes).
- Data: `data/db.txt` and `data/seed.txt`.
- Dev/prod container behavior: `docker-compose.yml`, `docker-compose.prod.yml`, `Dockerfile`.

Notes for implementors and agents
- Be explicit: change `openapi.yaml` and `server.js` together to keep runtime `/usage` accurate.
- When editing `server.js`, run `npm run dev` and check `/usage` and `/healthz` quickly to validate changes.
- If you add CLI flags (e.g., `--reset`), document them in README and ensure `package.json` scripts remain correct.

If anything here is unclear or you'd like more detail (for example, a few unit tests or a small script to run API smoke tests), tell me which area and I'll add it.

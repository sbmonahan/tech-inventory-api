// scripts/1-publish-consumer.js
import { spawnSync } from "child_process";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Load .env at repo root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const baseUrl = process.env.PACT_BROKER_BASE_URL;
const token = process.env.PACT_BROKER_TOKEN;

if (!baseUrl || !token) {
  console.error("Missing PACT_BROKER_BASE_URL or PACT_BROKER_TOKEN in .env");
  process.exit(1);
}

// Optional CLI overrides: --version=XYZ --branch=main
const cliArgs = new Map(
  process.argv.slice(2)
    .filter(a => a.startsWith("--"))
    .map(a => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v];
    })
);

// Choose version/branch without Git
const version =
  cliArgs.get("version") ||
  process.env.PACT_CONSUMER_VERSION ||
  `local-${Date.now()}`;

const branch =
  cliArgs.get("branch") ||
  process.env.PACT_BRANCH ||
  "local";

const pactsDir = path.resolve(process.cwd(), "pacts");
if (!fs.existsSync(pactsDir)) {
  console.error("No ./pacts directory found. Run your consumer tests first.");
  process.exit(1);
}

const pactFiles = fs.readdirSync(pactsDir).filter(f => f.endsWith(".json"));
if (pactFiles.length === 0) {
  console.error("No pact files found in ./pacts. Nothing to publish.");
  process.exit(1);
}

const args = [
  "publish",
  "./pacts",
  "--consumer-app-version", version,
  "--branch", branch,
  "--broker-base-url", baseUrl,
  "--broker-token", token,
  // Uncomment for more logs:
  // "--verbose",
];

console.log(`Publishing consumer pacts:
  version = ${version}
  branch  = ${branch}
  broker  = ${baseUrl}
  files   = ${pactFiles.length}
`);

const r = spawnSync("pact-broker", args, { stdio: "inherit", shell: true });
process.exit(r.status ?? 0);

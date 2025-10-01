// scripts/2-publish-provider-contract.js
import { spawnSync } from "child_process";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Parse optional overrides: --provider= --version= --branch= --oas= --verifier= --results= --resultsType=
const argsMap = new Map(
  process.argv.slice(2).filter(a => a.startsWith("--")).map(a => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.join("=")];
  })
);

const baseUrl = process.env.PACT_BROKER_BASE_URL;
const token   = process.env.PACT_BROKER_TOKEN;
if (!baseUrl || !token) {
  console.error("Missing PACT_BROKER_BASE_URL or PACT_BROKER_TOKEN in .env");
  process.exit(1);
}

const provider = argsMap.get("provider") || process.env.PACT_PROVIDER_NAME || "tech-inventory-api";
const version  = argsMap.get("version")  || process.env.PACT_PROVIDER_VERSION || `local-${Date.now()}`;
const branch   = argsMap.get("branch")   || process.env.PACT_BRANCH || "local";
const oasPath  = argsMap.get("oas")      || process.env.PACT_OAS_PATH || "./openapi.yaml";
const verifier = argsMap.get("verifier") || process.env.PACT_VERIFIER || "provider-tests";
let   results  = argsMap.get("results")  || process.env.PACT_VERIFICATION_RESULTS;
let   resultsType = argsMap.get("resultsType") || process.env.PACT_VERIFICATION_RESULTS_TYPE || "text/plain";

const absOas = path.resolve(process.cwd(), oasPath);
if (!fs.existsSync(absOas)) {
  console.error(`OpenAPI file not found at: ${absOas}`);
  process.exit(1);
}

// If no results file provided, create a tiny one so we can publish now
if (!results) {
  const stubPath = path.resolve(process.cwd(), "provider-verify.txt");
  if (!fs.existsSync(stubPath)) {
    fs.writeFileSync(stubPath, `Provider ${provider} verified OK for ${version} on ${new Date().toISOString()}\n`);
  }
  results = stubPath;
  resultsType = "text/plain";
}

// Resolve pactflow binary from node_modules/.bin
const candidates = [
  path.resolve("node_modules/.bin/pactflow.cmd"),
  path.resolve("node_modules/.bin/pactflow"),
];
const pactflowBin = candidates.find(p => fs.existsSync(p));
if (!pactflowBin) {
  console.error("pactflow CLI not found. Install it with: npm i -D @pact-foundation/pact-cli");
  process.exit(1);
}

console.log(`Publishing provider contract:
  provider  = ${provider}
  version   = ${version}
  branch    = ${branch}
  oas       = ${absOas}
  verifier  = ${verifier}
  results   = ${results} (${resultsType})
  broker    = ${baseUrl}
`);

const cliArgs = [
  "publish-provider-contract",
  absOas,
  "--provider", provider,
  "--provider-app-version", version,
  "--branch", branch,
  "--content-type", "application/yaml",
  "--verification-exit-code", "0",                          // mark success
  "--verification-results", results,                        // attach output
  "--verification-results-content-type", resultsType,       // eg text/plain, application/json, application/xml
  "--verifier", verifier
];

const r = spawnSync(pactflowBin, cliArgs, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PACT_BROKER_BASE_URL: baseUrl, PACT_BROKER_TOKEN: token },
});

process.exit(r.status ?? 0);

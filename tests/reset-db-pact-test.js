// tests/reset-db-pact-test.js
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { PactV3 } from "@pact-foundation/pact";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const provider = new PactV3({
  consumer: "reset-db-script",
  provider: "tech-inventory-api",
  dir: "./pacts",
  logLevel: "warn",
});

// Single interaction: POST /reset -> 204 No Content
provider
  .uponReceiving("a request to reset the database")
  .withRequest({
    method: "POST",
    path: "/reset",
  })
  .willRespondWith({
    status: 204,
  });

await provider.executeTest(async (mockServer) => {
  // Run your reset CLI against the Pact mock
  execSync(`node ${path.resolve(__dirname, "../scripts/reset-db.js")}`, {
    env: { ...process.env, BASE_URL: mockServer.url },
    stdio: "inherit",
  });
});

console.log("OK");

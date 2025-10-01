// tests/delete-random-pact-test.js

import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { PactV3, MatchersV3 } from "@pact-foundation/pact";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { like, integer, regex } = MatchersV3;

const provider = new PactV3({
  consumer: "delete-random-script",
  provider: "tech-inventory-api",
  dir: "./pacts",
  logLevel: "warn",
});

// --- GET /items (expect integer query params) ---
provider
  .uponReceiving("list items before delete (with integer QPs)")
  .withRequest({
    method: "GET",
    path: "/items",
    query: {
      // any non-negative integers
      limit:  regex(/^\d+$/, "50"),
      offset: regex(/^\d+$/, "0"),
    },
  })
  .willRespondWith({
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      total: integer(1),
      items: [
        {
          id: integer(99),
          name: like("ToDelete"),
          type: regex(/^(laptop|phone|accessory|component|service)$/, "accessory"),
        },
      ],
    },
  });

// --- DELETE /items/{id} (deterministic: id 99 from the GET) ---
provider
  .uponReceiving("delete an item by id")
  .withRequest({
    method: "DELETE",
    path: "/items/99",
  })
  .willRespondWith({
    status: 204,
  });

await provider.executeTest(async (mockServer) => {
  // Run your existing consumer CLI against the Pact mock
  execSync(`node ${path.resolve(__dirname, "../scripts/delete-random.js")}`, {
    env: { ...process.env, BASE_URL: mockServer.url },
    stdio: "inherit",
  });
});

console.log("OK");

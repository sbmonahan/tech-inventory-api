// tests/add-items-pact-test.js
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { PactV3, MatchersV3 } from "@pact-foundation/pact";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { like, integer, number, boolean, regex } = MatchersV3;

const provider = new PactV3({
  consumer: "add-items-script",
  provider: "tech-inventory-api",
  dir: "./pacts",
  logLevel: "warn",
});

// --- GET /items (expect integer query params) ---
provider
  .uponReceiving("list items (initial, with integer QPs)")
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
    headers: { "Content-Type": "application/json" }, // plain string (no matcher)
    body: {
      // Return 4 existing so the script will POST only the missing one
      items: [
        { name: "Demo Laptop",    type: "laptop" },
        { name: "Demo Phone",     type: "phone" },
        { name: "Demo Cable",     type: "accessory" },
        { name: "Demo Component", type: "component" },
      ],
    },
  });

// --- POST /items (shape-first) ---
provider
  .uponReceiving("create missing item (shape-first)")
  .withRequest({
    method: "POST",
    path: "/items",
    headers: { "content-type": "application/json" }, // match what fetch actually sends
    body: like({
      name: like("Demo Service"),
      type: regex(/^(laptop|phone|accessory|component|service)$/, "service"),
      price: number(199),         // <-- number() instead of decimal()
      in_stock: boolean(true),
      tags: like(["demo", "service"]), // array-of-strings shape, not exact values
    }),
  })
  .willRespondWith({
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: like({
      id: integer(1001),
      name: like("Demo Service"),
    }),
  });

await provider.executeTest(async (mockServer) => {
  // Run your existing consumer CLI against the Pact mock
  execSync(`node ${path.resolve(__dirname, "../scripts/add-items.js")}`, {
    env: { ...process.env, BASE_URL: mockServer.url },
    stdio: "inherit",
  });
});

console.log("OK");

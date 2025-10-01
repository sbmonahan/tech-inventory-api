// tests/report-pact-test.js
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { PactV3, MatchersV3 } from "@pact-foundation/pact";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { like, integer, number, boolean, regex } = MatchersV3;

const provider = new PactV3({
  consumer: "report-script",
  provider: "tech-inventory-api",
  dir: "./pacts",
  logLevel: "warn",
});

// GET /items with integer query params; return a small sample set
provider
  .uponReceiving("list items for report (with integer QPs)")
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
    body: like({
      total: integer(3),
      items: [
        {
          id: integer(1),
          name: like("X"),
          type: regex(/^(laptop|phone|accessory|component|service)$/, "laptop"),
          price: number(100),
          in_stock: boolean(true),
          tags: like(["demo", "laptop"]),
        },
        {
          id: integer(2),
          name: like("Y"),
          type: regex(/^(laptop|phone|accessory|component|service)$/, "phone"),
          price: number(200),
          in_stock: boolean(false),
          tags: like(["demo", "phone"]),
        },
        {
          id: integer(3),
          name: like("Z"),
          type: regex(/^(laptop|phone|accessory|component|service)$/, "accessory"),
          price: number(9.99),
          in_stock: boolean(true),
          tags: like(["demo", "accessory"]),
        },
      ],
    }),
  });

await provider.executeTest(async (mockServer) => {
  // Run the report script; it prints to stdout
  execSync(`node ${path.resolve(__dirname, "../scripts/report.js")}`, {
    env: { ...process.env, BASE_URL: mockServer.url },
    stdio: "inherit",
  });
});

console.log("OK");

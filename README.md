
# Tech Inventory API (Dockerized)

## Quickstart
```bash
npm install
npm run start
# or with Docker
docker compose build
docker compose up -d
curl http://localhost:3000/healthz
```
See `/openapi.yaml` for the contract.

## Pact demo: motivation and high-level plan

This repository contains a small provider API (the Tech Inventory API) and a set of small consumer scripts that exercise the API (under `scripts/`). The goal of the Pact demo is to show how consumer-driven contract testing works end-to-end: generate consumer pacts, publish them to a Pact Broker (PactFlow), and verify the provider against those pacts — all in a reproducible, containerized environment.

Motivation
- Demonstrate consumer-driven contract testing with Pact using a small, easy-to-understand API.
- Keep provider running in Docker, and run consumer tests in Linux containers for reliability.
- Publish consumer pacts and provider verification results to PactFlow to demonstrate bi-directional verification and deployment gating.

High-level architecture
- Provider: the API in this repo (runs in Docker via `docker compose` as the `api-dev` service).
- Consumers: small Node scripts in `scripts/` that act as lightweight consumers (reset-db, add-items, report, delete-random).
- Consumer test runner: a Dockerized test container (compose service `consumer`) that runs Pact consumer tests and generates `pacts/*.json`.
- Broker: PactFlow (or any Pact Broker) to publish pacts and verification results.

Planned demo flow (steps)
1. Generate consumer pacts:
	- Start the provider: `docker compose up -d api-dev`
	- Run the consumer test runner (builds image and executes Pact consumer tests):
	  `docker compose run --rm consumer`
	- Pact files will be produced under `pacts/` (mounted from the host).

2. Publish consumer pacts to PactFlow (example):
	- Use a CLI or small script to publish the `pacts/` directory to your PactFlow instance.
	- Example (replace with your broker URL/token):
	```powershell
	pact-broker publish pacts/ --consumer-app-version 1.0.0 --broker-base-url https://<your-pactflow> --broker-token $env:PACTFLOW_TOKEN
	```

3. Verify provider against pacts:
	- Start the provider locally (or start it in a CI job).
	- Run a provider verification job that pulls pacts from PactFlow and executes verification against the running provider.
	- Publish verification results back to PactFlow.

4. Demonstrate bidirectional testing and CI integration:
	- Wire consumer CI to publish pacts on change.
	- Wire provider CI to run verification on pact-published webhooks or on PRs.
	- Use PactFlow UI to show verification history, tags, and promotion.

Notes and tips
- Pact native components can be sensitive to the host OS. Running consumer Pact tests inside Linux containers (the approach used here) avoids Windows-specific native build and socket issues.
- Keep interactions in consumer tests explicit and deterministic. Use Pact matchers for fields that vary (IDs, timestamps).
- Store your PactFlow token as an environment variable or CI secret (`PACTFLOW_TOKEN`).

What I can do next (available tasks)
- Stabilize the consumer-runner so it reliably generates pacts in this environment.
- Add scripts to publish pacts to PactFlow and to run provider verification (local + CI ready).
- Add CI workflows (GitHub Actions) to automate the publish/verify flow.

If you want, I can implement the consumer-runner stabilization and a small `publish-pacts` script next — say the word and I'll proceed.

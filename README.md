# Medusa v2.21.2: refund provider HTTP 503 and order transaction

This is a minimal reproduction of the behavior previously reported in [Medusa issue #15306](https://github.com/medusajs/medusa/issues/15306). It uses Medusa **v2.21.2**, its integration test runner, an isolated local PostgreSQL database, and a synthetic payment provider that calls an HTTP server on `127.0.0.1`. There is no payment processor, real refund, production system, or customer data.

The files in this repository are an **overlay for a fresh Medusa v2.21.2 backend**, rather than a copy of Medusa or a patched Medusa package. The original local run was on 2026-10-01 with Node.js `22.23.3`, PostgreSQL `17.10`, and published `@medusajs/medusa`, `@medusajs/core-flows`, and `@medusajs/test-utils` packages at `2.21.2`. The application was generated with the official `create-medusa-app` and used its `test:integration:http` script. The exact generator invocation, generated lockfile, and separately resolved `@medusajs/framework` package version were not retained, so use a fresh official v2.21.2 app and confirm the retained package versions before comparing results.

## Set up

1. Create a fresh, disposable Medusa v2.21.2 application with the official `create-medusa-app`. Use its backend directory and install its dependencies. Confirm that the three versioned packages named above resolve to `2.21.2`. Use Node.js `22.23.3` and an isolated PostgreSQL `17.10` database reachable only from your local machine. Do not point `DATABASE_URL` at a shared or production database.
2. From the root of **this** repository, set `BACKEND` to the absolute path of that generated backend and copy in the four source files:

   ```sh
   BACKEND=/absolute/path/to/generated-app/backend
   mkdir -p "$BACKEND/src/modules/v38-gateway" "$BACKEND/integration-tests/http"
   cp medusa-config.ts "$BACKEND/medusa-config.ts"
   cp src/modules/v38-gateway/index.ts src/modules/v38-gateway/service.ts "$BACKEND/src/modules/v38-gateway/"
   cp integration-tests/http/v38-refund.spec.ts "$BACKEND/integration-tests/http/"
   ```

3. In the generated backend, set `DATABASE_URL` to the isolated local PostgreSQL database. Set throwaway local values for `JWT_SECRET` and `COOKIE_SECRET`, and local development origins for `STORE_CORS`, `ADMIN_CORS`, and `AUTH_CORS`. These values belong in your local environment and must not be committed. For example, with a local database and local-only test secrets:

   ```sh
   export DATABASE_URL='postgres://127.0.0.1:5432/medusa_refund_repro'
   export JWT_SECRET='synthetic-local-test-only-jwt'
   export COOKIE_SECRET='synthetic-local-test-only-cookie'
   export STORE_CORS='http://localhost:8000'
   export ADMIN_CORS='http://localhost:9000'
   export AUTH_CORS='http://localhost:9000'
   ```

   Adapt the PostgreSQL connection string to your local account. The database must be disposable. The test's gateway starts itself on a random `127.0.0.1` port; `V38_GATEWAY_URL` is set and removed by the test.

4. From that backend directory, run the generated project's integration test script:

   ```sh
   npm run test:integration:http -- --runTestsByPath integration-tests/http/v38-refund.spec.ts
   ```

## Reproduction and control

The test creates two separate synthetic orders, payment collections, and captured payments of `100`. For each, it calls the programmatic plural `refundPaymentsWorkflow` with one `{ payment_id, amount: 50 }` input. The provider sends a POST to the local gateway. The only controlled difference is its response status: `503` for the failure case, then `200` for the control. The test reads the workflow result, persisted `payment.refunds`, and the order's transactions. Synthetic IDs vary by run; compare the counts, `reference`, payment reference, and amount.

| Local gateway | Expected for an unaccepted refund | Observed on v2.21.2 in the saved run |
| --- | --- | --- |
| HTTP `503` | No persisted refund or completed refund transaction; a failure must not appear as a completed refund. | Workflow result: **0** refunded payments. Payment refund records: **0**. Order: **one** `reference=refund` transaction for `-50`, referencing the payment. |
| HTTP `200` control | A refund record and matching order transaction. | Workflow result: **1** refunded payment. Payment refund records: **1**. Order: **one** matching `reference=refund` transaction for `-50`. |

The saved [observation JSON](evidence/observations.json) and [limited test summary](evidence/test-summary.txt) show the original `1/1 PASS` run. [SHA256SUMS](SHA256SUMS) fixes the bytes of the four source files and two evidence files. Those evidence files contain only synthetic identifiers. A Search seed connection termination also appeared in that run; its relation to the refund assertions was not established. The overlay was assembled from the saved source files, but has **not been independently rerun** after packaging.

## Source context and limits

In the saved review of v2.21.2, [`refundPaymentsStep`](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/core-flows/src/payment/steps/refund-payments.ts) logs a `paymentModule.refundPayment` exception and returns only successful payments. The [`refundPaymentsWorkflow`](https://github.com/medusajs/medusa/blob/v2.21.2/packages/core/core-flows/src/payment/workflows/refund-payments.ts) creates order transactions from the original input rather than that returned success list. This is source context for the observed local mismatch, not a claim that every refund entry point has the same behavior.

This reproduction exercises the **programmatic plural workflow**. It does not exercise the stock Admin single-refund endpoint, a real provider's response semantics, Medusa Cloud, production, external money movement, or customer-facing effects. A real HTTP failure can be ambiguous about a provider's final state; the local `503` is deliberately synthetic. No patch, regression implementation, or adjacent issue investigation is included.

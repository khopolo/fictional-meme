# Production launch checklist

This checklist is the concrete next pass for taking the app from a validated local build to a hosted production-ready launch.

## 1. Local readiness gate

Before touching hosted credentials, confirm the repo still passes its local validation gates:

- `npm test`
- `npm run build`
- `PORT=3000 node --env-file-if-exists=.env server/index.js`
- `curl -sS http://localhost:3000/api/health`

Expected result:

- all automated tests pass
- production build completes
- health endpoint returns `status: "ok"`

If any of these fail, do not proceed to external deployment.

## 2. Supabase staging setup

### Required env vars

Set these in a real `.env` file, not in the browser:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Required actions

1. Create a new Supabase project.
2. Apply the SQL migrations in order:
   - `supabase/schema.sql`
   - `supabase/002_runtime.sql`
3. Enable Auth and Storage in the project.
4. Configure allowed redirect URLs for sign-in/reset flows.
5. Verify private bucket configuration.
6. Confirm RLS policies are active and owner isolation is enforced.

### Validation checklist

- sign up works
- sign in works
- reset password works
- owner-scoped data is isolated
- private file URLs are generated correctly
- cross-owner mutation attempts are rejected

## 3. AI provider setup

### Required env vars

- `AI_API_KEY`
- `AI_BASE_URL` (if using OpenAI-compatible provider)
- `AI_MODEL`

### Required actions

1. Add a real provider key from an OpenAI-compatible vendor.
2. Configure a model that supports the exact-evidence validation pattern used by the app.
3. Verify `AI_API_KEY` is server-only and not exposed to the browser.

### Validation checklist

- AI extraction works with a real provider
- unsupported or fabricated claims are rejected
- provider errors fail cleanly without guessing values
- health endpoint no longer reports AI as missing

## 4. PayFast sandbox setup

### Required env vars

- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_PASSPHRASE`
- `PAYFAST_MODE=sandbox`
- `PAYFAST_RETURN_URL`
- `PAYFAST_CANCEL_URL`
- `PAYFAST_NOTIFY_URL`

### Required actions

1. Create sandbox merchant credentials in PayFast.
2. Configure public HTTPS callback URLs.
3. Verify the webhook callback is reachable.
4. Validate the return/cancel flow.

### Validation checklist

- checkout request resolves successfully
- payment notification verification succeeds
- pending subscription record is created
- `user_subscriptions` is activated after a completed payment
- plan entitlements are granted

## 5. Durable background queue hardening

The code already has queue logic, but production requires stronger guarantees.

### Required actions

1. Persist jobs outside the process memory.
2. Ensure restart-safe recovery logic marks stale jobs correctly.
3. Add idempotency so retries do not duplicate work.
4. Add retry/backoff policy for failed processing jobs.
5. Add monitoring and alerting for stuck jobs.

### Validation checklist

- interrupted jobs are resumed correctly
- duplicate retries do not create duplicate outputs
- worker concurrency is bounded under load
- failed tasks remain visible and diagnosable

## 6. Security and compliance gate

Before production launch, confirm:

- HTTPS is enforced everywhere
- CSRF protections are evaluated in hosted environment
- rate limits are checked under real traffic
- uploaded file types are limited
- storage is isolated by owner
- legal/privacy text is reviewed
- retention policy and data deletion flow are documented
- audit history cannot be bypassed

## 7. Deployment gate

Before final launch, run the following checks in a staging environment:

- health endpoint is green
- app starts without warnings that indicate missing provider config
- sign-up / sign-in / protected routes work over hosted Supabase
- document workflow works end-to-end with real provider keys
- billing and webhook flow works in sandbox
- background jobs process reliably during retries
- rollback plan is documented

## 8. Definition of done

The app is ready to launch when all of the following are true:

- Supabase project is configured and live
- AI provider is configured and tested
- PayFast sandbox is working end-to-end
- queued jobs are durable and recoverable
- production security and compliance checks are signed off
- staging environment passes a final smoke test
- the team has a rollback and monitoring plan

## 9. Current status

The app is already in a strong local-working state and has passed the local validation suite, but hosted launch readiness still depends on external credentials, service configuration, and production hardening work.

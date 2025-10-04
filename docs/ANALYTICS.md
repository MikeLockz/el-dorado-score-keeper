# ANALYTICS: Lightweight User Tracking Plan

This document proposes a minimal, privacy‑aware user tracking system triggered from the client on initial page load. The client sends a single webhook with key context (referral, browser, IP, etc.). Emojis are included in select payload values for quick visual scanning downstream.

## Goals

- Zero backend changes to the main app; only a client snippet and a webhook receiver.
- Send exactly one event per session per page load (avoid reload/SPA duplication).
- Include referral source, browser, and IP (with emojis) plus basic context.
- Respect privacy and compliance (DNT, consent, retention, minimization).
- Keep operable on static hosting and easy to disable in development.

## High‑Level Flow

1. User loads a page on the hosted site.
2. A small inline script collects context and sends a POST to a configured webhook URL.
3. The webhook receiver logs/persists the event and derives the request IP (preferred) or uses the client‑provided IP if enabled.
4. Events are viewable in your destination (e.g., database, Zapier, Slack, etc.).

## Webhook Contract

- Method: `POST`
- Headers: `Content-Type: application/json` (Beacon fallback may send as a Blob)
- CORS: Allow `POST` from your site origin, allow `Content-Type: application/json`.
- Recommended auth: Static bearer token or signed HMAC header.

Example payload (values contain emojis for key fields):

```json
{
  "siteId": "el-dorado-score-keeper",
  "ts": "2025-01-01T12:34:56.789Z",
  "url": "https://app.example.com/scores?utm_source=google",
  "path": "/scores",
  "referrer": "🔗 https://www.google.com/",
  "utm": { "source": "google", "medium": null, "campaign": null },
  "browser": "🧭 Chrome",
  "userAgent": "Mozilla/5.0 ...",
  "language": "en-US",
  "timezone": "America/Los_Angeles",
  "screen": { "w": 1440, "h": 900, "dpr": 2 },
  "ip": "🌐 203.0.113.42",
  "sessionId": "f3b42b3a-3c36-4d1b-8a5c-1b3e0f4d8a11",
  "env": "prod"
}
```

Notes:

- IP best practice: do NOT attempt to compute the user’s IP in the browser; instead, the receiver should derive it from the request (e.g., `X-Forwarded-For`). Client IP fetching from third parties is optional and configurable.
- Emojis are included in the string values for `referrer`, `browser`, and `ip` as requested.

## Client Implementation

Embed a tiny script on every page (ideally inline in the `<head>` to avoid blocking and to maximize send reliability). It fires once on first navigation and respects user privacy controls.

Script responsibilities:

- Collect: URL, path, referrer, basic UTM, browser name, UA, language, timezone, screen size, sessionId.
- Respect: Do Not Track (DNT), optional consent, bot filtering, local dev disable.
- Send: `navigator.sendBeacon` when available; otherwise `fetch` with `keepalive: true`.
- De‑dup: Use `sessionStorage` to avoid repeat sends on reloads.

Suggested configuration hook (before the script runs). Use your deployed Cloudflare Worker URL and set your production origin for CORS on the Worker side:

```html
<script>
  window.analyticsConfig = {
    // Point to your Cloudflare Worker relay
    webhookUrl: 'https://analytics-relay.YOUR_ACCOUNT.workers.dev',
    siteId: 'el-dorado-score-keeper',
    env: 'prod',
    includeIP: 'server', // 'server' | 'client' | 'none'
    emoji: true,
    disabledInDev: true,
    // Optional: token to authenticate with the Worker
    // Note: sendBeacon cannot set headers, so the token will be sent in the JSON body.
    // The fetch fallback (when used) will send it as Authorization header.
    authToken: undefined, // e.g., "abc123" if you configured ANALYTICS_TOKEN
  };
</script>
```

Implementation snippet:

```html
<script>
  (function () {
    const cfg = window.analyticsConfig || {};
    try {
      // Respect DNT and optional consent hook
      if (
        navigator.doNotTrack === '1' ||
        window.doNotTrack === '1' ||
        navigator.msDoNotTrack === '1'
      )
        return;
      if (typeof window.hasUserConsented === 'function' && !window.hasUserConsented('analytics'))
        return;

      // Disable in local dev if desired
      if (cfg.disabledInDev && /(^localhost$|^127\.0\.0\.1$)/.test(location.hostname)) return;

      // Only send once per session per page path
      const onceKey = `analytics.sent:${location.pathname}`;
      if (sessionStorage.getItem(onceKey)) return;

      // Only on first navigation (avoid reload/back-forward cache)
      const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      if (nav && nav.type && nav.type !== 'navigate') return;

      const webhookUrl = cfg.webhookUrl;
      if (!webhookUrl) return;

      // Basic fields
      const url = new URL(location.href);
      const params = Object.fromEntries(url.searchParams.entries());
      const referrer = document.referrer || null;
      const ua = navigator.userAgent || '';

      // Lightweight browser name detection
      const browser = (function () {
        const ua = navigator.userAgent || '';
        if (/Edg\//.test(ua)) return 'Edge';
        if (/OPR\//.test(ua)) return 'Opera';
        if (/Firefox\//.test(ua)) return 'Firefox';
        if (/Chrome\//.test(ua)) return 'Chrome';
        if (/Safari\//.test(ua)) return 'Safari';
        return 'Unknown';
      })();

      // Helper to send the event
      function send(ip) {
        const decorate = (flag, emoji, value) =>
          !value ? null : flag ? `${emoji} ${value}` : String(value);

        const payload = {
          siteId: cfg.siteId || null,
          ts: new Date().toISOString(),
          url: url.href,
          path: location.pathname,
          referrer: decorate(cfg.emoji !== false, '🔗', referrer),
          utm: {
            source: params.utm_source || null,
            medium: params.utm_medium || null,
            campaign: params.utm_campaign || null,
          },
          browser: decorate(cfg.emoji !== false, '🧭', browser),
          userAgent: ua,
          language: navigator.language || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
          screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio || 1 },
          ip: decorate(cfg.emoji !== false, '🌐', ip || null), // Prefer server-derived IP; client IP optional
          // For Cloudflare Worker auth support when using sendBeacon (no headers allowed)
          authToken: cfg.authToken || undefined,
          sessionId: (function () {
            try {
              let id = sessionStorage.getItem('analytics.sid');
              if (!id) {
                id = crypto.randomUUID
                  ? crypto.randomUUID()
                  : Math.random().toString(36).slice(2) + Date.now();
                sessionStorage.setItem('analytics.sid', id);
              }
              return id;
            } catch (_) {
              return null;
            }
          })(),
          env: cfg.env || null,
        };

        const json = JSON.stringify(payload);
        const blob = new Blob([json], { type: 'application/json' });

        if (navigator.sendBeacon) {
          navigator.sendBeacon(webhookUrl, blob);
        } else {
          // Fallback with keepalive for page close
          try {
            fetch(webhookUrl, {
              method: 'POST',
              mode: 'cors',
              credentials: 'omit',
              headers: Object.assign(
                { 'Content-Type': 'application/json' },
                cfg.authToken ? { Authorization: `Bearer ${cfg.authToken}` } : {},
              ),
              body: json,
              keepalive: true,
            }).catch(function () {});
          } catch (_) {}
        }

        sessionStorage.setItem(onceKey, '1');
      }

      // IP handling strategy
      if (cfg.includeIP === 'client') {
        // Optional: fetch public IP from a third-party. Use only if policy allows.
        // Example service: https://api.ipify.org?format=json
        // If blocked or fails, fall back to null and let server derive.
        try {
          fetch('https://api.ipify.org?format=json', { mode: 'cors', credentials: 'omit' })
            .then(function (r) {
              return r.json();
            })
            .then(function (d) {
              send((d && d.ip) || null);
            })
            .catch(function () {
              send(null);
            });
        } catch (_) {
          send(null);
        }
      } else {
        // Prefer server-side derivation from request headers
        send(null);
      }
    } catch (_) {
      // Swallow to avoid impacting the app
    }
  })();
</script>
```

How to include:

- Static HTML: Place the config and script near the end of `<head>`.
- Frameworks (React/Next/Vite): Inject via a layout component or HTML template. Ensure it renders only client‑side and only once.

## Webhook Receiver (Options)

- Third‑party (e.g., Zapier/Make): Accepts JSON POST; map fields to your destinations. Ensure CORS allows your site origin.
- Minimal custom receiver:
  - Cloudflare Worker / Vercel Edge / Netlify Function / Express.
  - Derive IP from `request.headers['x-forwarded-for']` or the platform’s request IP.
  - Validate an auth token header (e.g., `Authorization: Bearer <token>`).
  - Optionally normalize emoji‑decorated strings into canonical fields for storage.

Cloudflare Worker specifics for this repo:

- Path: `cloudflare/analytics-worker/src/worker.ts`
- Secrets: `SLACK_WEBHOOK_URL` (required), `ANALYTICS_TOKEN` (optional), `ALLOWED_ORIGIN` (comma‑separated list of allowed origins).
- Auth: Worker accepts either `Authorization: Bearer <token>` or `authToken` in the JSON body (to support `sendBeacon`).

Example normalization (pseudocode):

```js
function stripEmoji(s) {
  return s ? s.replace(/^\p{Emoji_Presentation}\s+/u, '') : s;
}
const referrer = stripEmoji(body.referrer);
const browser = stripEmoji(body.browser);
const ip = stripEmoji(body.ip) || req.ipFromPlatform;
```

Suggested storage schema:

- `id` (UUID), `ts` (ISO), `site_id`, `url`, `path`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`,
- `browser`, `user_agent`, `language`, `timezone`, `screen_w`, `screen_h`, `screen_dpr`, `ip`, `session_id`, `env`.

## Privacy, Security, Compliance

- Consent: If needed for your region, gate send behind a consent function (see `hasUserConsented`).
- Do Not Track: Fully honored; if DNT is on, no event is sent.
- Data minimization: Collect only what is listed. No cookies beyond `sessionStorage` sessionId.
- IP handling: Prefer server‑side derivation; optionally hash or anonymize (e.g., zero last octet for IPv4).
- Retention: Define and enforce a retention window (e.g., 90 days) and purge jobs.
- Auth & integrity: Require a bearer token or signed HMAC header; reject without it.
- Bot filtering: Skip obvious bots (`/bot|spider|crawler/i` on UA; ignore `navigator.webdriver`).

## QA Checklist

- Verify a single event fires on first navigation, not on reload.
- Confirm payload fields and emoji decorations.
- Ensure CORS allows your production origin; block unexpected origins.
- Validate server derives IP when `includeIP !== 'client'`.
- Test DNT on/off and consent gating.
- Test dev disable on `localhost` and that production hosts send events.

## Rollout

1. Add `window.analyticsConfig` with your webhook URL and IDs.
2. Embed the client snippet in the site’s base HTML/layout.
3. Deploy the webhook receiver (or configure third‑party) with CORS and auth.
4. Smoke test in production with test traffic; verify events received.
5. Enable IP handling mode as desired; turn on retention and monitoring.

## Future Enhancements

- Event types (pageview vs. custom events) and batching.
- Lightweight UA parsing library or `userAgentData` usage where supported.
- Geo IP lookup server‑side (avoid client calls to third parties).
- Real‑time alerts (Slack/Discord) for specific UTM campaigns.
- Dashboard or simple query endpoint for summaries.

## Setup: Cloudflare Worker + Slack

Prereqs

- Cloudflare account with Workers enabled and an API token with Workers Writes.
- Slack Incoming Webhook URL (store as a secret).

Local quick test

1. Install Wrangler v4: `npm i -g wrangler@4`
2. Authenticate: `wrangler login`
3. Set secrets:
   - `wrangler --config cloudflare/analytics-worker/wrangler.toml secret put SLACK_WEBHOOK_URL`
   - Optional: `wrangler ... secret put ANALYTICS_TOKEN`
   - Optional: `wrangler ... secret put ALLOWED_ORIGIN` (e.g., `https://yourdomain.com`)
4. Deploy:
   - `wrangler deploy --config cloudflare/analytics-worker/wrangler.toml`
5. Note the deployed URL (e.g., `https://analytics-relay.<acct>.workers.dev`).

GitHub Actions (CI/CD)

- Add repo secrets:
  - `CLOUDFLARE_API_TOKEN` (Workers publish token)
  - `CLOUDFLARE_ACCOUNT_ID` (from Cloudflare dashboard)
  - `SLACK_WEBHOOK_URL`
  - Optional: `ANALYTICS_TOKEN`, `ALLOWED_ORIGIN`
- On push to `main` touching `cloudflare/analytics-worker/**`, the workflow publishes the Worker and updates secrets.

Client config example

```html
<script>
  window.analyticsConfig = {
    webhookUrl: 'https://analytics-relay.<acct>.workers.dev',
    siteId: 'el-dorado-score-keeper',
    env: 'prod',
    includeIP: 'server',
    emoji: true,
    disabledInDev: true,
    authToken: '${ANALYTICS_TOKEN}', // if configured
  };
</script>
```

Verification steps

- Open your site in a fresh session (not localhost if `disabledInDev` is true).
- Check Slack for a message like:
  - `📄 /  ·  🔗 https://google.com\n🧭 Chrome  ·  🌐 203.0.113.42\nhttps://...`
- Confirm only one event on first navigation (reload should not resend).

## PostHog Dashboards Automation

- Automate creation of the PostHog dashboards introduced in the analytics rollout guide instead of reconfiguring them by hand.
- Required environment variables:
  - `POSTHOG_PERSONAL_API_KEY` – personal key with **write** access to the target project.
  - `POSTHOG_PROJECT_ID` – numeric project identifier from PostHog settings.
  - Optional `POSTHOG_API_HOST` if using a self-hosted PostHog instance (`https://app.posthog.com` by default).
- Inspect the outbound payloads first:
  ```bash
  POSTHOG_PERSONAL_API_KEY=phx_demo POSTHOG_PROJECT_ID=12345 \
    pnpm posthog:bootstrap --dry-run --json
  ```
- Remove `--dry-run` to upsert the trends, funnel, and HogQL insights defined in `scripts/posthog/insights.ts`. The script reports per-insight `created`/`updated` status and exits non-zero on API errors.
- Re-run the command after event schema changes or when provisioning new environments so dashboards stay consistent across staging and production.

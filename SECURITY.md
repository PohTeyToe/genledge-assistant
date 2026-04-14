# Security Notes

## Claude Code OAuth token

The backend talks to Claude via the `claude` CLI, authenticated with a
Claude Code OAuth token (`sk-ant-oat01-...`). The token lives in **one
place only**: the `CLAUDE_CODE_OAUTH_TOKEN` environment variable on the
Render service `genledge-assistant-api`.

Rules:

- Never commit the token. It must not appear in `.env` files, source
  code, logs, CI configs, GitHub Actions, or anywhere else in this repo.
- Never ship the token to the browser. The frontend never sees it. It
  only ever runs inside the Docker container behind `/chat`.
- Never log the token. The Python backend does not echo env vars.
- The shared-secret header `x-demo-secret` (value in
  `DEMO_SHARED_SECRET` / `VITE_DEMO_SECRET`) is a speed bump, not a
  secret. It ships in the frontend bundle. Real defenses are the
  per-IP rate limit, CORS origin lock, CLI budget cap, and input
  length cap — all enforced server-side in `backend/main.py`.

## Rotating the token

If the token ever leaks:

1. Revoke it in claude.ai settings.
2. Generate a new OAuth token in the Claude Code CLI.
3. Update `CLAUDE_CODE_OAUTH_TOKEN` on Render via the Render dashboard
   or MCP tools. Render will redeploy.

## Rotating the shared secret

1. Generate: `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
2. Update `DEMO_SHARED_SECRET` on Render and `VITE_DEMO_SECRET` on
   Vercel for the Production environment.
3. Redeploy both services.

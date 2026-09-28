# @imagenevolutiva/n8n-nodes-1minai

n8n community node for the [1min.AI API](https://docs.1min.ai/docs/api/intro) — chat completions, conversations, AI features, asset uploads, and result retrieval.

> **Status:** code-complete, not yet published to npm. After your first `npm publish`, remove this note.

## Features

- **Chat → Send Prompt** — unified chat endpoint (`POST /api/chat-with-ai`, `type: UNIFY_CHAT_WITH_AI`). Simple-prompt mode with optional conversation ID, web search, AI memories, brand voice, attachments JSON, and settings JSON — plus a raw JSON body mode for full control.
- **Conversation → Create** — `POST /api/conversations` (`{type, title, model}`), returns the conversation UUID for reuse as `promptObject.conversationId`.
- **AI Feature → Execute** — generic `POST /api/features` pass-through (`type` / `model` / `promptObject`, optional `async`), with built-in polling via the documented Get Result API.
- **Asset → Upload** (experimental) — binary upload to `POST /api/assets` using the documented multipart field `asset`; the body is framed manually (no `form-data` import, n8n Cloud-safe).
- **Result → Get** — `GET /api/results/{id}` with optional wait-for-completion polling.
- **usableAsTool** — the node can be used as a tool by the n8n AI Agent node.

## Requirements

- n8n 1.0+ with community packages enabled (self-hosted: `N8N_COMMUNITY_PACKAGES_ENABLED=true`).
- A 1min.AI API key (create one at app.1min.ai → Settings → API Keys).
- Node.js 18+ for development.

## Testing

The package ships a three-tier smoke test that exercises the real compiled code:

```bash
npm run test                                  # Tier 0 (offline helpers) + Tier 1 (live 401 probe)
ONEMIN_API_KEY=your-key npm run test          # additionally runs Tier 2 (live happy path)
```

- **Tier 0** — offline: validates auth headers, multipart framing, response extraction, and error wrapping against the shapes documented at docs.1min.ai. No network needed.
- **Tier 1** — live: calls `GET /api/results/{uuid}` with an intentionally invalid key and asserts the API returns 401, then feeds the real error body through the node's `enrichApiError()` so you can see exactly what an n8n user would see. Always safe to run.
- **Tier 2** — live: with a real key, creates a conversation, chats inside it (`PONG` round-trip), looks up the history, and uploads a test asset. Note: creates one real conversation + one AI request (billable) per run.

## Installation

### From n8n community nodes (after npm publish)

1. In n8n: **Settings → Community nodes**.
2. Select **Install a community node**.
3. Enter the npm package name: `@imagenevolutiva/n8n-nodes-1minai`.
4. Agree to the risks and confirm.

On n8n Cloud only **verified** community packages can be installed by end users; self-hosted instances can install any community package. See the [n8n community nodes docs](https://docs.n8n.io/integrations/community-nodes/installation-and-management/gui-installation).

### Self-hosted via CLI (once on npm)

```bash
# n8n installed via npm:
n8n install-node @imagenevolutiva/n8n-nodes-1minai

# Docker:
docker exec -it <container> n8n install-node @imagenevolutiva/n8n-nodes-1minai
```

### Local dev install (packed tarball)

```bash
npm run build
npm pack
# produces @imagenevolutiva/n8n-nodes-1minai-0.1.0.tgz
mkdir -p ~/.n8n/custom
cd ~/.n8n/custom
npm init -y        # only if no package.json exists there yet
npm install /path/to/@imagenevolutiva/n8n-nodes-1minai-0.1.0.tgz
# restart n8n — "1min.AI" appears in the nodes panel
```

### Local dev install (npm link)

```bash
# in this package folder:
npm run build && npm link

# in ~/.n8n/custom:
mkdir -p ~/.n8n/custom && cd ~/.n8n/custom
npm init -y        # only if no package.json exists there yet
npm link @imagenevolutiva/n8n-nodes-1minai
# restart n8n
```

## Credentials setup

1. Create an API key in 1min.AI: app.1min.ai → Settings → API Keys ([docs](https://docs.1min.ai/docs/api/create-api-key)).
2. In n8n, add the 1min.AI node, open the credential dropdown → **Create New**.
3. **API Key** (required): your 1min.AI API key.
4. **Base URL** (optional): leave blank for production (`https://api.1min.ai`). Override only for testing/proxy; trailing slashes are stripped.
5. **Auth Header Style** (optional): `API-KEY` header (default — used in every curl example in the endpoint docs) or `Authorization: Bearer` (also documented on the API intro page).
6. Use the credential **Test** button: it calls `GET /api/results/{random-uuid}` — a documented, side-effect-free endpoint that returns 200 with `{aiRecord: null}` for unknown IDs, so it validates the key without creating anything.

## Example operations

### 1. Send a simple prompt (Chat → Send Prompt)

- Resource **Chat**, Operation **Send Prompt**, Input Mode **Simple Prompt**
- Model: `gpt-4o-mini` (or any model ID available to your account)
- Prompt: `Say hello in three words.`

The output item contains the full raw API response plus convenience fields:

```json
{
  "generatedText": "Hello there, friend!",
  "aiRecordUuid": "3f...",
  "aiRecord": {
    "uuid": "3f...",
    "aiRecordDetail": { "resultObject": ["Hello there, friend!"] },
    "status": "SUCCESS"
  }
}
```

### 2. Create a conversation, then reuse its conversationId

1. **Conversation → Create** (Title: `Support bot thread`, Model: `gpt-4o-mini`).
   The output includes `conversationUuid` (extracted from the response; the docs say to use "the returned uuid" without pinning the JSON path — extraction checks several likely paths, and the raw response is always returned alongside).
2. **Chat → Send Prompt** with **Conversation ID** set to `{{ $json.conversationUuid }}` (chained directly after the conversation node). Subsequent prompts in the same conversation keep history via the API.

### 3. Send a raw JSON feature request (AI Feature → Execute)

- Resource **AI Feature**, Operation **Execute**, Input Mode **Raw JSON Body**:

```json
{
  "type": "PROMPT_GENERATOR",
  "model": "gpt-4o-mini",
  "promptObject": {
    "prompt": "Write a haiku about workflow automation"
  }
}
```

Feature types and their per-feature fields come from the [AI Feature API docs](https://docs.1min.ai/docs/api/ai-feature-api); the raw JSON mode sends your body exactly as provided.

Or in structured mode: set Feature Type, Model, Prompt Object JSON — and optionally **Enable Async** plus **Wait For Completion** (Additional Fields), which polls `GET /api/results/{id}` until the record reaches SUCCESS/FAILURE.

## Assumptions

- **Auth header**: the endpoint docs use `API-KEY: <key>` in every curl example; the API intro also documents `Authorization: Bearer`. Both are supported (credential toggle, default `API-KEY`).
- **Conversation UUID path**: the docs say to use "the returned uuid" from `POST /api/conversations` without pinning the JSON path; extraction checks likely paths and always returns the raw response as fallback.
- **Model IDs**: free-form strings (e.g. `gpt-4o-mini`). No hardcoded list — the docs don't pin a stable model list.
- **Feature types**: free-form strings; the raw JSON mode is the safe path for features whose schemas aren't covered by the structured fields (`type`/`model`/`promptObject`/`async`).
- **Asset upload**: multipart field name `asset` per the Asset API docs; `asset.key` is surfaced as `assetKey` when present in the response.

## Known gaps

- **No SSE streaming** (`?isStreaming=true`): n8n's `httpRequest` helper buffers whole responses, so incremental streaming can't be surfaced from a community node. Async features are covered by polling instead.
- **No loadOptions dropdowns** for models or feature types: no stable list endpoint is documented, so a hardcoded list would rot. Free-form strings keep the node working as models/features evolve.
- **Asset upload is experimental**: the multipart field name is documented, but size limits, large-file behavior, and error semantics are not; test with a small file first.
- **No conversation list/update/delete**: the docs only document creation via `POST /api/conversations`.
- **Wait For Completion** polls inside the node with `sleep` (n8n helper); for very long tasks, split the workflow instead: run the async request, then a separate Result → Get execution.

## Local testing in n8n (checklist)

```bash
npm install
npm run lint        # expect 0 errors
npm run build       # produces dist/
npm pack            # inspect tarball before installing
mkdir -p ~/.n8n/custom && cd ~/.n8n/custom
npm init -y         # only if no package.json exists there yet
npm install /path/to/@imagenevolutiva/n8n-nodes-1minai-0.1.0.tgz
# restart n8n and verify:
#   "1min.AI" appears in the nodes panel
#   credential "1min.AI API" accepts key + Test button succeeds
#   Chat → Send Prompt returns generatedText
#   Conversation → Create returns conversationUuid
#   AI Feature → Execute (async) + Wait For Completion reaches SUCCESS
#   Asset → Upload returns assetKey (experimental)
#   Continue On Fail: set a bad API key → item-level {error:...} output instead of failure
```

## License

[MIT](LICENSE)

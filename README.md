# slack-mcp

This repository is now configured to use `gpt-5.5` by default through the OpenAI Responses API.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set your API key:

```bash
copy .env.example .env
```

3. Run a test prompt:

```bash
npm run ask -- "Summarize why GPT-5.5 is a good default for complex coding tasks."
```

## Configuration

- Default model: `gpt-5.5`
- Override model with `OPENAI_MODEL`
- Override reasoning with `OPENAI_REASONING_EFFORT`

## Files

- `src/index.js`: minimal CLI example using the Responses API
- `src/config.js`: environment-based model configuration

## Notes

OpenAI's current model docs recommend `gpt-5.5` as the starting point for complex reasoning and coding workloads, and GPT-5.5 is supported on the Responses API.

## GPTers MCP Social Digest

Post the daily GPTers MCP top-liked summary to Slack `#소셜`:

```bash
npm run gpters:social
```

Required environment variables:

- `FIRECRAWL_API_KEY`
- `SLACK_BOT_TOKEN`
- `SLACK_SOCIAL_CHANNEL_ID` (defaults to the configured `#소셜` channel)
- `OPENAI_API_KEY` (required; summaries are generated in Korean with OpenAI)

Register the Windows scheduled task for every day at 06:30:

```bash
npm run gpters:social:install-task
```

### GitHub Actions

This repository also includes `.github/workflows/gpters-social-digest.yml`.
It runs every day at 06:30 Asia/Seoul and can also be run manually from the
GitHub Actions tab.

Add these repository secrets in GitHub:

- `OPENAI_API_KEY`
- `FIRECRAWL_API_KEY`
- `SLACK_BOT_TOKEN`
- `SLACK_SOCIAL_CHANNEL_ID`

Optional repository variables:

- `OPENAI_MODEL` (default: `gpt-5.5`)
- `OPENAI_REASONING_EFFORT` (default: `medium`)
- `GPTERS_DIGEST_LIMIT` (default: `10`)
- `GPTERS_DIGEST_CANDIDATES` (default: `14`)

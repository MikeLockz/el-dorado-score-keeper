# AI Smoke Tests

This directory contains experiments for driving the app with
[browser-use](https://github.com/browser-use/browser-use).

## Start Single Player smoke test

The `start_single_player_test.py` script uses a local Ollama model to open
`http://localhost:3000` and click the **Start Single Player** button.

### Prerequisites

- `pnpm dev` (or equivalent) is running so the app is available on port 3000.
- [Ollama](https://github.com/ollama/ollama) is running (`ollama serve`) and a
  vision-capable model is pulled locally. By default the script uses
  `qwen2.5vl:3b`.
- `browser-use` and its CLI dependencies are installed (follow the project quick
  start: `uv add browser-use && uvx browser-use install`).

### Run the test

```bash
pnpm test:ai:start-single-player
```

You can also run the script directly:

```bash
python ai-smoke-test/start_single_player_test.py
```

The run prints a ✅/❌ result, saves the final screenshot under
`artifacts/ai-tests/`, and returns a non-zero exit code on failure.

### Useful environment variables

- `APP_URL` – change the target URL (default `http://localhost:3000`)
- `OLLAMA_MODEL` – choose a different local model (default `llama3.1:8b`)
- `AI_TEST_HEADLESS` – defaults to showing the browser; set to `1` for headless runs
- `AI_TEST_ARTIFACT_DIR` – customise where screenshots are saved

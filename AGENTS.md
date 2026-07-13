# opencode-metasearch2 AGENTS.md

## Overview

OpenCode plugin that adds a `web_search` tool powered by a patched fork of metasearch2. Runs a local metasearch engine that aggregates results from Google, Bing, Brave, and others. No API keys required.

## Architecture

```
opencode-metasearch2/
├── index.ts              # Plugin entry point — hooks & tool registration
├── service.ts            # MetasearchService — binary resolution, lifecycle, search
├── test.ts               # Backend unit tests (node:test)
├── benchmark.ts          # Startup & search latency benchmark
├── dist/index.js         # Built output (esbuild bundle)
├── AGENTS.md             # This file
├── README.md
├── package.json
└── tsconfig.json
```

## Subcomponents

| Component | Purpose |
|-----------|---------|
| `index.ts` | Plugin function — registers `config`, `experimental.chat.messages.transform`, `experimental.session.compacting` hooks and the `web_search` tool |
| `service.ts` | `MetasearchService` class — binary resolution (env var → bundled npm package → cargo → auto-install), process lifecycle (spawn, health check, stop), HTTP search API |

## Design Decisions

### Guidance hooks always fire

Unlike the original upstream plugin, the `catch` block in the plugin function does **not** return `{}`. Instead:
- **Guidance hooks** (`config`, `messages.transform`, `compacting`) always fire regardless of service availability
- **Tool registration** is conditional — `web_search` is only exposed when the service is running
- When unavailable, guidance messages explain how to install the patched fork

This ensures the LLM always knows about the `web_search` capability, even when the binary isn't installed.

### Patched fork

The upstream `metasearch2` crate (crates.io) has issues. This plugin uses a [patched fork](https://github.com/Ron-RONZZ-org/metasearch2). The `installViaCargo` method installs from this fork:
```
cargo install --git https://github.com/Ron-RONZZ-org/metasearch2 metasearch
```

### Binary resolution order

1. `METASEARCH_BIN` environment variable
2. Bundled platform-specific npm package (`@galelmalah/metasearch2-*`)
3. `$CARGO_HOME/bin/metasearch` (cargo install location)
4. `/tmp/metasearch2-build/bin/metasearch`
5. Auto-install from the patched fork via `cargo install --git <fork> metasearch`

## Key Behaviors

- **On service start failure**: Guidance hooks inform the LLM with install instructions; no tool is registered
- **On service start success**: Full guidance hooks + `web_search` tool registered
- **Idempotency**: `messages.transform` checks for `<WEB_SEARCH_TOOL>` marker to avoid duplicate injection
- **Compaction survival**: `session.compacting` re-injects tool guidance on conversation summarization

## Dependencies

- `@opencode-ai/plugin` (runtime)
- `@galelmalah/metasearch2-*` (optional — platform-specific binary)

## Configuration

| Variable | Default | Description |
|---|---|---|
| `METASEARCH_BIN` | auto-resolved | Path to metasearch2 binary |
| `METASEARCH_PORT` | `28019` | Port for the local HTTP API |
| `METASEARCH_AUTO_INSTALL` | `true` | Set to `false` to skip auto `cargo install` |
| `XDG_CONFIG_HOME` | `~/.config` | Base directory for the config file |

# opencode-metasearch2

[OpenCode](https://opencode.ai) plugin that adds a `web_search` tool powered by [metasearch2](https://github.com/mat-1/metasearch2) -- a fast meta-search engine that aggregates results from Google, Bing, Brave, and others. No API keys required.

## Quick start

```sh
npm install opencode-metasearch2
```

Add to your `opencode.json`:

```json
{
  "plugins": {
    "metasearch": "opencode-metasearch2"
  }
}
```

The plugin ships with pre-built binaries for macOS, Linux, and Windows via platform-specific npm packages -- no Rust toolchain needed. If the bundled binary isn't available, it falls back to other resolution methods.

## Binary resolution

The plugin checks for the binary in order:

1. `METASEARCH_BIN` environment variable -- point this at any pre-built binary
2. **Bundled platform package** (`@galelmalah/metasearch2-*`) -- installed automatically as an `optionalDependency`
3. `$CARGO_HOME/bin/metasearch` (default: `~/.cargo/bin/metasearch`)
4. `/tmp/metasearch2-build/bin/metasearch`
5. **Auto-install**: runs `cargo install metasearch` if none of the above exist

To use a custom binary path:

```sh
export METASEARCH_BIN=/path/to/metasearch
```

To disable auto-install (e.g. in CI):

```sh
export METASEARCH_AUTO_INSTALL=false
```

## How it works

1. Locates or installs the `metasearch` binary
2. Writes a config to `~/.config/metasearch/config.toml` enabling the JSON API
3. Spawns the binary as a child process
4. Polls until the HTTP API is healthy (up to 10s)
5. Exposes a `web_search` tool to your agent

The metasearch2 process is killed automatically when the session ends.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `METASEARCH_BIN` | *(auto-resolved)* | Path to the metasearch2 binary |
| `METASEARCH_PORT` | `28019` | Port for the local HTTP API |
| `METASEARCH_AUTO_INSTALL` | `true` | Set to `false` to skip auto `cargo install` |
| `XDG_CONFIG_HOME` | `~/.config` | Base directory for the config file |

## Tool

### `web_search`

Search the web using a local metasearch engine.

| Argument | Type | Description |
|---|---|---|
| `query` | `string` | The search query |

Returns formatted text with up to 10 results including titles, URLs, descriptions, source engines, and any featured snippets or direct answers.

## Benchmark

```sh
npx tsx benchmark.ts       # 5 queries
npx tsx benchmark.ts 20    # 20 queries
```

Reports startup timing (binary resolution, config, spawn, health check) and per-query search latencies with min/max/avg/p50/p95.

## Development

```sh
git clone https://github.com/anthropics/opencode-metasearch2.git
cd opencode-metasearch2
npm install
npm run build
```

## Credits

Wrapper around [metasearch2](https://github.com/mat-1/metasearch2) by [mat-1](https://github.com/mat-1).

## License

MIT

# opencode-metasearch2

[OpenCode](https://opencode.ai) plugin that adds a `web_search` tool powered by [metasearch2](https://github.com/mat-1/metasearch2) -- a fast meta-search engine that aggregates results from Google, Bing, Brave, and others. No API keys required.

Want web search for your agent but don't want to pay for an API key? This is the plugin for you. It runs a local meta-search engine that scrapes results from multiple providers -- completely free, no accounts, no rate limits, no tokens to manage.

## Credits

Built on [metasearch2](https://github.com/mat-1/metasearch2) by [mat-1](https://github.com/mat-1) -- an awesome open-source meta-search engine written in Rust. All the heavy lifting (search aggregation, ranking, deduplication) happens there.

## Quick start

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-metasearch2"]
}
```

That's it. OpenCode auto-installs the package at startup. The plugin ships with pre-built binaries for macOS, Linux, and Windows -- no Rust toolchain needed. On first run it spawns metasearch2 locally and exposes a `web_search` tool to your agent.

## Tool

### `web_search`

Search the web using a local metasearch engine that aggregates results from Google, Bing, Brave, and others. Returns raw JSON with search results, featured snippets, direct answers, and infoboxes.

| Argument | Type | Default | Description |
|---|---|---|---|
| `query` | `string` | *(required)* | The search query |
| `type` | `"all" \| "images"` | `"all"` | `"all"` for web results, `"images"` for image search |

#### Web search response

```json
[{
  "search_results": [
    {
      "result": { "url": "https://...", "title": "...", "description": "..." },
      "engines": ["google", "bing", "brave"],
      "score": 1.55
    }
  ],
  "featured_snippet": {
    "url": "https://...", "title": "...", "description": "...", "engine": "google"
  },
  "answer": { "html": "42", "engine": "numbat" },
  "infobox": { "html": "<h2>...</h2>", "engine": "wikipedia" }
}]
```

All fields except `search_results` are optional -- they appear when metasearch2 finds a direct answer, featured snippet, or infobox (Wikipedia, GitHub, StackOverflow, MDN, docs.rs).

#### Image search response

```json
[{
  "image_results": [
    {
      "result": {
        "image_url": "https://...",
        "page_url": "https://...",
        "title": "...",
        "width": 1200,
        "height": 800
      },
      "engines": ["google", "bing"],
      "score": 1.5
    }
  ]
}]
```

## How it works

1. Locates or installs the `metasearch` binary
2. Writes a config to `~/.config/metasearch/config.toml` enabling the JSON API and image search
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

### Advanced: engine configuration

The plugin generates a default `~/.config/metasearch/config.toml` on first run. You can edit it to enable/disable engines, adjust ranking weights, or block domains:

```toml
api = true
bind = "0.0.0.0:28019"

[image_search]
enabled = true

[engines]
google_scholar = true       # enable (off by default)
marginalia = false          # disable

[engines.brave]
weight = 2.0               # boost Brave results

[urls.weight]
".quora.com" = 0            # hide Quora results
".pinterest.com" = 0        # hide Pinterest results
```

Available engines: `google` (default), `bing` (default), `brave` (default), `marginalia` (default), `google_scholar`, `rightdao`, `stract`, `yep`. See the [metasearch2 docs](https://github.com/mat-1/metasearch2) for all options.

## Binary resolution

The plugin checks for the binary in order:

1. `METASEARCH_BIN` environment variable
2. **Bundled platform package** (`@galelmalah/metasearch2-*`) -- installed automatically as an `optionalDependency`
3. `$CARGO_HOME/bin/metasearch` (default: `~/.cargo/bin/metasearch`)
4. `/tmp/metasearch2-build/bin/metasearch`
5. **Auto-install**: runs `cargo install metasearch` if none of the above exist

## Benchmark

```sh
npx tsx benchmark.ts       # 5 queries
npx tsx benchmark.ts 20    # 20 queries
```

Reports startup timing (binary resolution, config, spawn, health check) and per-query search latencies with min/max/avg/p50/p95.

## Development

```sh
git clone https://github.com/galElmalah/opencode-metasearch2.git
cd opencode-metasearch2
npm install
npm run build
npx tsx --test test.ts
```

## License

MIT

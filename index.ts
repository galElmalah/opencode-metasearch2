import type { Plugin } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import { MetasearchService, type SearchType } from './service.js';

const PLUGIN_MARKER = 'opencode-metasearch2';
const FORK_REPO = 'https://github.com/Ron-RONZZ-org/metasearch2';

const WEB_SEARCH_GUIDANCE = `<WEB_SEARCH_TOOL>
You have a \`web_search\` tool that searches the web via a local scraper — no API key needed.

| Tool | Use when |
|------|----------|
| \`web_search\` | Last resort when no dedicated search MCP tool is available |

**Limitation:** This is a scraper, not an API. Search engines often block it.
Results may be sparse or empty. **Prefer MCP-based search tools** (\`brave_web_search\`,
\`tavily\`, etc.) when available — they use official APIs and return richer results.

**Arguments:**
- \`query\` (string, required) — The search query
- \`type\` ("all" | "images", default "all") — \`"all"\` for web results, \`"images"\` for image search

**Response format:** Raw JSON array.
</WEB_SEARCH_TOOL>`;

const WEB_SEARCH_UNAVAILABLE_GUIDANCE = `<WEB_SEARCH_TOOL>
## web_search tool — NOT AVAILABLE

The metasearch2 binary was not found. To fix this:

1. **Pre-built binary** (recommended): Reinstall the plugin:
   \`\`\`
   npm install opencode-metasearch2
   \`\`\`
   This installs a pre-built binary for your platform — no Rust toolchain needed.

2. **Build from source**: Install Rust, then build the patched fork:
   \`\`\`
   cargo install --git ${FORK_REPO} metasearch
   \`\`\`

3. **Set METASEARCH_BIN** to the path of an existing metasearch2 binary.

After installing, restart opencode.
</WEB_SEARCH_TOOL>`;

const plugin: Plugin = async () => {
  const service = new MetasearchService();
  let started = false;

  try {
    await service.start();
    started = true;
  } catch {
    // Service failed to start — guidance hooks below will still inform the
    // LLM about the web_search capability (marked unavailable), so it can
    // help the user install or troubleshoot.
  }

  return {
    // -----------------------------------------------------------------------
    // Guidance hook 1: system prompt note
    // -----------------------------------------------------------------------
    config: async (config) => {
      config.instructions = config.instructions ?? [];
      const hasMarker = config.instructions.some(
        (item) => typeof item === 'string' && item.includes(PLUGIN_MARKER),
      );
      if (!hasMarker) {
        config.instructions.push(
          started
            ? `${PLUGIN_MARKER}: web_search tool available (free scraper, unreliable). Prefer MCP search tools when available.`
            : `${PLUGIN_MARKER}: web_search tool NOT available (binary not found). Install with: \`cargo install --git ${FORK_REPO} metasearch\` and restart opencode.`,
        );
      }
    },

    // -----------------------------------------------------------------------
    // Guidance hook 2: inject tool table into first user message
    // (only when service is running — unavailable case covered by config +
    // compacting hooks)
    // -----------------------------------------------------------------------
    'experimental.chat.messages.transform': started
      ? async (_input, output) => {
          if (!output.messages.length) return;

          const firstUser = output.messages.find((m) => m.info.role === 'user');
          if (!firstUser?.parts.length) return;
          if (firstUser.parts.some((p) => p.type === 'text' && p.text.includes('<WEB_SEARCH_TOOL>'))) {
            return; // already injected — idempotency guard
          }

          const ref = firstUser.parts[0];
          firstUser.parts.unshift({ ...ref, type: 'text', text: WEB_SEARCH_GUIDANCE });
        }
      : async () => {
          // noop — system prompt + compacting already convey unavailability
        },

    // -----------------------------------------------------------------------
    // Guidance hook 3: re-inject on compaction
    // -----------------------------------------------------------------------
    'experimental.session.compacting': async (_input, output) => {
      output.context.push(
        started
          ? `
## Web Search (${PLUGIN_MARKER})
\`web_search\` tool available (free scraper, no API key). Results may be sparse.
Prefer dedicated MCP search tools for reliable results.
`
          : `
## Web Search (${PLUGIN_MARKER})
\`web_search\` tool is NOT available (binary not found).
Install the patched fork: \`cargo install --git ${FORK_REPO} metasearch\`
Or reinstall the plugin for a pre-built binary: \`npm install opencode-metasearch2\`
`,
      );
    },

    // -----------------------------------------------------------------------
    // Tool registration (only when service is running)
    // -----------------------------------------------------------------------
    ...(started && {
      tool: {
        web_search: tool({
          description:
            'Search the web using a local metasearch engine that aggregates results from Google, Bing, Brave, and others. ' +
            'Returns raw JSON with search results, featured snippets, direct answers, and infoboxes. ' +
            'Set type to "images" for image search.',
          args: {
            query: tool.schema.string().describe('The search query'),
            type: tool.schema
              .enum(['all', 'images'])
              .default('all')
              .describe('Search type: "all" for web results, "images" for image search'),
          },
          async execute(args) {
            return service.search(args.query, args.type as SearchType);
          },
        }),
      },
    }),
  };
};

export default plugin;

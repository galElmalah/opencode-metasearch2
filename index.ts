import type { Plugin } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import { MetasearchService } from './service.js';

/**
 * OpenCode plugin that provides a `web_search` tool powered by a local
 * metasearch2 instance.
 *
 * metasearch2 is a meta-search engine by mat-1 that aggregates results from
 * Google, Bing, Brave, and other search engines.
 * https://github.com/mat-1/metasearch2
 *
 * The plugin spawns the metasearch2 binary on init and kills it on exit.
 * If no binary is found, it attempts `cargo install metasearch` automatically.
 */
const plugin: Plugin = async () => {
  const service = new MetasearchService();

  try {
    await service.start();
  } catch (err) {
    console.error(`[metasearch2] ${err instanceof Error ? err.message : String(err)}`);
    console.error('[metasearch2] web_search tool will be unavailable.');
    return {};
  }

  return {
    tool: {
      web_search: tool({
        description:
          'Search the web using a local metasearch engine. Returns results from multiple search engines (Google, Bing, Brave, etc.).',
        args: {
          query: tool.schema.string().describe('The search query'),
        },
        async execute(args) {
          return service.search(args.query);
        },
      }),
    },
  };
};

export default plugin;

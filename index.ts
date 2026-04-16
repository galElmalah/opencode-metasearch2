import type { Plugin } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import { MetasearchService, type SearchType } from './service.js';

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
  };
};

export default plugin;

export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'get_page_structure',
      description: 'Get the title, meta description, headings, forms and third-party hosts of the current page.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_page_links',
      description: 'List up to 150 links from the current page with their IDs, regions and URLs.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['all', 'internal', 'external', 'nav', 'main', 'footer'], description: 'Optional filter.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_page_text',
      description: 'Get the visible text of the current page or a chosen scope.',
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['main', 'page', 'selection'], description: 'Defaults to main.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sitemap',
      description: 'Read the website sitemap (/sitemap.xml) to discover top-level URLs of the site.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_page',
      description: 'Fetch another page of the SAME website using a link_id copied from get_page_links or a tool result.',
      parameters: {
        type: 'object',
        properties: {
          link_id: { type: 'string', description: 'The link ID (e.g. "kq12") returned by get_page_links.' },
          url: { type: 'string', description: 'Optional relative or absolute URL, must have been previously discovered on this site.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_site',
      description: 'Search previously crawled passages of this website using keywords.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keywords to search for.' },
          limit: { type: 'number', description: 'Number of results (1-10, default 5).' },
        },
        required: ['query'],
      },
    },
  },
] as const;

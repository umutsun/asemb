"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SitemapFetch = void 0;
const n8n_workflow_1 = require("n8n-workflow");
function extractLocs(xml) {
    const locs = [];
    const regex = /<loc>([^<]+)<\/loc>/gi;
    let m;
    while ((m = regex.exec(xml)) !== null) {
        const url = m[1].trim();
        if (url)
            locs.push(url);
    }
    return Array.from(new Set(locs));
}
class SitemapFetch {
    constructor() {
        this.description = {
            displayName: 'Sitemap Fetch',
            name: 'sitemapFetch',
            group: ['transform'],
            version: 1,
            description: 'Fetch a sitemap.xml and emit URLs',
            defaults: { name: 'Sitemap Fetch' },
            inputs: ["main" /* NodeConnectionType.Main */],
            outputs: ["main" /* NodeConnectionType.Main */],
            properties: [
                { displayName: 'Sitemap URL', name: 'sitemapUrl', type: 'string', default: '', required: true },
                { displayName: 'Max URLs', name: 'maxUrls', type: 'number', default: 1000 },
            ],
        };
    }
    async execute() {
        const items = this.getInputData();
        const out = [];
        const countItems = Math.max(1, items.length);
        for (let i = 0; i < countItems; i++) {
            const sitemapUrl = this.getNodeParameter('sitemapUrl', i);
            const maxUrls = this.getNodeParameter('maxUrls', i);
            try {
                const res = await fetch(sitemapUrl, { headers: { 'User-Agent': 'n8n-node-sitemap-fetch/1.0' } });
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                const xml = await res.text();
                const locs = extractLocs(xml).slice(0, maxUrls);
                for (const url of locs)
                    out.push({ json: { url } });
            }
            catch (err) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), err.message, { itemIndex: i });
            }
        }
        return [out];
    }
}
exports.SitemapFetch = SitemapFetch;

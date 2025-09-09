"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebScrape = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const cheerio = __importStar(require("cheerio"));
const p_limit_1 = __importDefault(require("p-limit"));
// Simple in-memory cache for robots.txt rules.
// In a multi-worker n8n setup, this cache would be per-worker.
// For a shared cache, Redis would be a better choice.
const robotsCache = new Map();
async function isAllowed(url, respectRobots, node) {
    if (!respectRobots) {
        return true;
    }
    const urlObj = new URL(url);
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
    // Check if we already have a promise for this robots.txt
    if (robotsCache.has(robotsUrl)) {
        return robotsCache.get(robotsUrl);
    }
    // If not, create a new promise to fetch and parse it.
    // This promise is stored in the cache immediately to prevent race conditions
    // where multiple requests for the same domain are made concurrently.
    const promise = (async () => {
        try {
            // Dynamically import the robots parser.
            const { isAllowedByRobots } = await Promise.resolve().then(() => __importStar(require('../shared/robots')));
            return await isAllowedByRobots(url);
        }
        catch (error) {
            node.Logger.warn(`Could not check robots.txt for ${url}: ${error.message}`);
            // Default to not allowed if the robots.txt check fails for any reason.
            return false;
        }
    })();
    robotsCache.set(robotsUrl, promise);
    // Optional: Set a timeout to clear the cache entry after a while (e.g., 1 hour)
    // to avoid stale robots.txt rules.
    setTimeout(() => robotsCache.delete(robotsUrl), 3600 * 1000);
    return promise;
}
class WebScrape {
    constructor() {
        this.description = {
            displayName: 'Web Scrape',
            name: 'webScrape',
            group: ['transform'],
            version: 2.0,
            description: 'Fetch web pages and extract text content in parallel',
            defaults: {
                name: 'Web Scrape',
            },
            inputs: ["main" /* NodeConnectionType.Main */],
            outputs: ["main" /* NodeConnectionType.Main */],
            properties: [
                {
                    displayName: 'URL',
                    name: 'url',
                    type: 'string',
                    default: '',
                    placeholder: 'https://example.com',
                    required: true,
                },
                {
                    displayName: 'CSS Selector',
                    name: 'selector',
                    type: 'string',
                    default: 'body',
                    description: 'Extract text within this selector',
                },
                {
                    displayName: 'Strip HTML',
                    name: 'stripHtml',
                    type: 'boolean',
                    default: true,
                    description: 'Return plain text instead of HTML',
                },
                {
                    displayName: 'Respect robots.txt',
                    name: 'respectRobots',
                    type: 'boolean',
                    default: false,
                    description: 'Check robots.txt for URL and skip if disallowed',
                },
                {
                    displayName: 'Concurrency',
                    name: 'concurrency',
                    type: 'number',
                    default: 10,
                    description: 'Number of URLs to scrape in parallel',
                }
            ],
        };
    }
    async execute() {
        const items = this.getInputData();
        const concurrency = this.getNodeParameter('concurrency', 0, 10);
        const limit = (0, p_limit_1.default)(concurrency);
        const scrapePromises = items.map((item, i) => limit(async () => {
            const url = this.getNodeParameter('url', i);
            const selector = this.getNodeParameter('selector', i) || 'body';
            const stripHtml = this.getNodeParameter('stripHtml', i);
            const respectRobots = this.getNodeParameter('respectRobots', i);
            try {
                const allowed = await isAllowed(url, respectRobots, this.getNode());
                if (!allowed) {
                    return { json: { ...item.json, content: '', skipped: true, reason: 'robots_disallow' } };
                }
                const res = await fetch(url, { headers: { 'User-Agent': 'n8n-node-web-scrape/2.0' } });
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                const html = await res.text();
                const $ = cheerio.load(html);
                const el = $(selector);
                if (!el || el.length === 0)
                    throw new Error('Selector matched no elements');
                const content = stripHtml ? el.text().trim() : el.html() || '';
                return { json: { ...item.json, url, selector, content } };
            }
            catch (err) {
                // Attach the error to the item, but don't fail the whole node.
                // The user can use an If node to filter for items with an error property.
                return { json: { ...item.json, url, selector, error: err.message }, error: new n8n_workflow_1.NodeOperationError(this.getNode(), err.message, { itemIndex: i }) };
            }
        }));
        // Wait for all promises to settle, whether they succeed or fail.
        const results = await Promise.all(scrapePromises);
        return [results];
    }
}
exports.WebScrape = WebScrape;

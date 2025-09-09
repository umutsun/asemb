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
exports.WebScrapeEnhanced = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const readability_1 = require("@mozilla/readability");
const jsdom_1 = require("jsdom");
class WebScrapeEnhanced {
    constructor() {
        this.description = {
            displayName: 'Web Scrape Enhanced',
            name: 'webScrapeEnhanced',
            icon: 'fa:globe',
            group: ['input'],
            version: 1,
            subtitle: '={{$parameter["scrapeMode"]}}',
            description: 'Advanced web scraping with content distillation powered by Readability',
            defaults: {
                name: 'Web Scrape Enhanced',
            },
            inputs: ["main" /* NodeConnectionType.Main */],
            outputs: ["main" /* NodeConnectionType.Main */],
            properties: [
                {
                    displayName: 'URL',
                    name: 'url',
                    type: 'string',
                    default: '',
                    required: true,
                    description: 'URL of the webpage to scrape',
                },
                {
                    displayName: 'Scrape Mode',
                    name: 'scrapeMode',
                    type: 'options',
                    options: [
                        {
                            name: 'Auto (Smart Detection)',
                            value: 'auto',
                            description: 'Automatically detect and extract main content using Readability',
                        },
                        {
                            name: 'Article Mode',
                            value: 'article',
                            description: 'Extract article content (best for blogs, news)',
                        },
                        {
                            name: 'Custom Selector',
                            value: 'custom',
                            description: 'Use CSS selectors to extract specific elements',
                        },
                        {
                            name: 'Full HTML',
                            value: 'full',
                            description: 'Return complete HTML (for debugging)',
                        },
                    ],
                    default: 'auto',
                    description: 'How to extract content from the page',
                },
                {
                    displayName: 'CSS Selector',
                    name: 'selector',
                    type: 'string',
                    displayOptions: {
                        show: {
                            scrapeMode: ['custom'],
                        },
                    },
                    default: '',
                    placeholder: 'e.g., article.main-content, div#content',
                    description: 'CSS selector to extract specific content',
                },
                {
                    displayName: 'Additional Options',
                    name: 'options',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    options: [
                        {
                            displayName: 'Remove Scripts',
                            name: 'removeScripts',
                            type: 'boolean',
                            default: true,
                            description: 'Remove JavaScript code from extracted content',
                        },
                        {
                            displayName: 'Remove Styles',
                            name: 'removeStyles',
                            type: 'boolean',
                            default: true,
                            description: 'Remove CSS styles from extracted content',
                        },
                        {
                            displayName: 'Extract Metadata',
                            name: 'extractMetadata',
                            type: 'boolean',
                            default: true,
                            description: 'Extract page metadata (title, author, date)',
                        },
                        {
                            displayName: 'Extract Links',
                            name: 'extractLinks',
                            type: 'boolean',
                            default: false,
                            description: 'Extract all links from the content',
                        },
                        {
                            displayName: 'Timeout (ms)',
                            name: 'timeout',
                            type: 'number',
                            default: 10000,
                            description: 'Request timeout in milliseconds',
                        },
                        {
                            displayName: 'User Agent',
                            name: 'userAgent',
                            type: 'string',
                            default: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            description: 'User agent string for the request',
                        },
                        {
                            displayName: 'Headers',
                            name: 'headers',
                            type: 'json',
                            default: '{}',
                            description: 'Additional headers for the request',
                        },
                    ],
                },
            ],
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        for (let i = 0; i < items.length; i++) {
            try {
                const url = this.getNodeParameter('url', i);
                const scrapeMode = this.getNodeParameter('scrapeMode', i);
                const options = this.getNodeParameter('options', i, {});
                // Prepare axios config
                const axiosConfig = {
                    timeout: options.timeout || 10000,
                    headers: {
                        'User-Agent': options.userAgent || 'Mozilla/5.0',
                        ...(options.headers ? JSON.parse(options.headers) : {}),
                    },
                };
                // Fetch the page
                const response = await axios_1.default.get(url, axiosConfig);
                const html = response.data;
                let result = {
                    url,
                    scrapeMode,
                    timestamp: new Date().toISOString(),
                };
                if (scrapeMode === 'auto' || scrapeMode === 'article') {
                    // Use Readability for content extraction
                    const dom = new jsdom_1.JSDOM(html, { url });
                    const reader = new readability_1.Readability(dom.window.document);
                    const article = reader.parse();
                    if (article) {
                        result = {
                            ...result,
                            title: article.title,
                            content: article.textContent,
                            excerpt: article.excerpt,
                            length: article.length,
                            byline: article.byline,
                            dir: article.dir,
                            siteName: article.siteName,
                        };
                        // Clean content if HTML is returned
                        if (article.content && article.content.includes('<')) {
                            const $ = cheerio.load(article.content);
                            result.content = $('body').text().trim();
                        }
                    }
                    else {
                        // Fallback to cheerio if Readability fails
                        const $ = cheerio.load(html);
                        result.title = $('title').text() || $('h1').first().text();
                        result.content = $('body').text().trim();
                    }
                }
                else if (scrapeMode === 'custom') {
                    // Use cheerio for custom selector
                    const selector = this.getNodeParameter('selector', i);
                    const $ = cheerio.load(html);
                    result.title = $('title').text();
                    result.content = $(selector).text().trim();
                    result.html = $(selector).html();
                }
                else if (scrapeMode === 'full') {
                    // Return full HTML
                    result.html = html;
                    result.contentLength = html.length;
                }
                // Process options
                if (options.removeScripts && result.content) {
                    result.content = result.content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
                }
                if (options.removeStyles && result.content) {
                    result.content = result.content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
                }
                if (options.extractMetadata) {
                    const $ = cheerio.load(html);
                    result.metadata = {
                        description: $('meta[name="description"]').attr('content') ||
                            $('meta[property="og:description"]').attr('content'),
                        author: $('meta[name="author"]').attr('content'),
                        keywords: $('meta[name="keywords"]').attr('content'),
                        publishedTime: $('meta[property="article:published_time"]').attr('content'),
                        modifiedTime: $('meta[property="article:modified_time"]').attr('content'),
                        ogImage: $('meta[property="og:image"]').attr('content'),
                        ogType: $('meta[property="og:type"]').attr('content'),
                    };
                }
                if (options.extractLinks) {
                    const $ = cheerio.load(html);
                    const links = [];
                    $('a[href]').each((_, elem) => {
                        const href = $(elem).attr('href');
                        if (href && !href.startsWith('#')) {
                            // Convert relative URLs to absolute
                            const absoluteUrl = new URL(href, url).href;
                            links.push(absoluteUrl);
                        }
                    });
                    result.links = [...new Set(links)]; // Remove duplicates
                }
                // Calculate reading time (average 200 words per minute)
                if (result.content) {
                    const wordCount = result.content.split(/\s+/).length;
                    result.wordCount = wordCount;
                    result.readingTime = Math.ceil(wordCount / 200);
                }
                returnData.push({ json: result });
            }
            catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: {
                            error: error.message,
                            url: this.getNodeParameter('url', i),
                        },
                    });
                }
                else {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to scrape ${this.getNodeParameter('url', i)}: ${error.message}`);
                }
            }
        }
        return [returnData];
    }
}
exports.WebScrapeEnhanced = WebScrapeEnhanced;

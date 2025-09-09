"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentProcessor = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const pdf_1 = require("langchain/document_loaders/fs/pdf");
const docx_1 = require("langchain/document_loaders/fs/docx");
const text_1 = require("langchain/document_loaders/fs/text");
const csv_1 = require("langchain/document_loaders/fs/csv");
const text_splitter_1 = require("langchain/text_splitter");
const document_1 = require("langchain/document");
class DocumentProcessor {
    constructor() {
        this.description = {
            displayName: 'Document Processor',
            name: 'documentProcessor',
            icon: 'fa:file-alt',
            group: ['input'],
            version: 1,
            subtitle: '={{$parameter["operation"]}}',
            description: 'Process documents using LangChain for intelligent text extraction and chunking',
            defaults: {
                name: 'Document Processor',
            },
            inputs: ["main" /* NodeConnectionType.Main */],
            outputs: ["main" /* NodeConnectionType.Main */],
            properties: [
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    options: [
                        {
                            name: 'Load Document',
                            value: 'load',
                            description: 'Load and extract text from a document',
                        },
                        {
                            name: 'Split Text',
                            value: 'split',
                            description: 'Split text into semantic chunks',
                        },
                        {
                            name: 'Load and Split',
                            value: 'loadAndSplit',
                            description: 'Load document and split in one operation',
                        },
                    ],
                    default: 'loadAndSplit',
                },
                {
                    displayName: 'Input Type',
                    name: 'inputType',
                    type: 'options',
                    displayOptions: {
                        show: {
                            operation: ['load', 'loadAndSplit'],
                        }
                    },
                    options: [
                        {
                            name: 'File Path',
                            value: 'filePath',
                            description: 'Load from file system path',
                        },
                        {
                            name: 'Binary Data',
                            value: 'binaryData',
                            description: 'Load from n8n binary data',
                        },
                        {
                            name: 'URL',
                            value: 'url',
                            description: 'Load from URL',
                        },
                    ],
                    default: 'filePath',
                },
                {
                    displayName: 'File Path',
                    name: 'filePath',
                    type: 'string',
                    displayOptions: {
                        show: {
                            inputType: ['filePath'],
                            operation: ['load', 'loadAndSplit'],
                        }
                    },
                    default: '',
                    placeholder: '/path/to/document.pdf',
                    description: 'Path to the document file',
                },
                {
                    displayName: 'Binary Property',
                    name: 'binaryProperty',
                    type: 'string',
                    displayOptions: {
                        show: {
                            inputType: ['binaryData'],
                            operation: ['load', 'loadAndSplit'],
                        }
                    },
                    default: 'data',
                    description: 'Name of the binary property containing the file',
                },
                {
                    displayName: 'Document Type',
                    name: 'documentType',
                    type: 'options',
                    displayOptions: {
                        show: {
                            operation: ['load', 'loadAndSplit'],
                        }
                    },
                    options: [
                        {
                            name: 'Auto Detect',
                            value: 'auto',
                            description: 'Automatically detect file type',
                        },
                        {
                            name: 'PDF',
                            value: 'pdf'
                        },
                        {
                            name: 'Word (DOCX)',
                            value: 'docx'
                        },
                        {
                            name: 'Text',
                            value: 'txt'
                        },
                        {
                            name: 'CSV',
                            value: 'csv'
                        },
                    ],
                    default: 'auto',
                },
                {
                    displayName: 'Text',
                    name: 'text',
                    type: 'string',
                    typeOptions: {
                        rows: 5
                    },
                    displayOptions: {
                        show: {
                            operation: ['split'],
                        }
                    },
                    default: '',
                    description: 'Text to split into chunks',
                },
                {
                    displayName: 'Splitter Options',
                    name: 'splitterOptions',
                    type: 'collection',
                    placeholder: 'Add Option',
                    displayOptions: {
                        show: {
                            operation: ['split', 'loadAndSplit'],
                        }
                    },
                    default: {},
                    options: [
                        {
                            displayName: 'Chunk Size',
                            name: 'chunkSize',
                            type: 'number',
                            default: 1000,
                            description: 'Maximum size of each chunk in characters',
                        },
                        {
                            displayName: 'Chunk Overlap',
                            name: 'chunkOverlap',
                            type: 'number',
                            default: 200,
                            description: 'Number of overlapping characters between chunks',
                        },
                        {
                            displayName: 'Separators',
                            name: 'separators',
                            type: 'string',
                            default: '\n\n,\n, ,',
                            description: 'Comma-separated list of separators to use for splitting',
                        },
                        {
                            displayName: 'Keep Separator',
                            name: 'keepSeparator',
                            type: 'boolean',
                            default: false,
                            description: 'Whether to keep separators in chunks',
                        },
                        {
                            displayName: 'Add Metadata',
                            name: 'addMetadata',
                            type: 'boolean',
                            default: true,
                            description: 'Add chunk index and source metadata',
                        },
                    ],
                },
                {
                    displayName: 'Additional Options',
                    name: 'additionalOptions',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    options: [
                        {
                            displayName: 'Source ID',
                            name: 'sourceId',
                            type: 'string',
                            default: '',
                            description: 'Unique identifier for the document source',
                        },
                        {
                            displayName: 'Clean Text',
                            name: 'cleanText',
                            type: 'boolean',
                            default: true,
                            description: 'Remove extra whitespace and clean up text',
                        },
                        {
                            displayName: 'Extract Metadata',
                            name: 'extractMetadata',
                            type: 'boolean',
                            default: true,
                            description: 'Extract document metadata (PDF info, etc.)',
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
                const operation = this.getNodeParameter('operation', i);
                let documents = [];
                if (operation === 'load' || operation === 'loadAndSplit') {
                    documents = await _a.loadDocument(this, i);
                }
                if (operation === 'split') {
                    const text = this.getNodeParameter('text', i);
                    documents = [new document_1.Document({ pageContent: text })];
                }
                if (operation === 'split' || operation === 'loadAndSplit') {
                    documents = await _a.splitDocuments(this, documents, i);
                }
                // Process additional options
                const additionalOptions = this.getNodeParameter('additionalOptions', i, {});
                // Convert documents to n8n format
                for (const doc of documents) {
                    const result = {
                        content: doc.pageContent,
                        metadata: doc.metadata || {},
                    };
                    if (additionalOptions['sourceId']) {
                        result.metadata.sourceId = additionalOptions['sourceId'];
                    }
                    if (additionalOptions.cleanText) {
                        result.content = _a.cleanText(result.content);
                    }
                    // Add reading metrics
                    const wordCount = result.content.split(/\s+/).length;
                    result.wordCount = wordCount;
                    result.readingTime = Math.ceil(wordCount / 200);
                    result.characterCount = result.content.length;
                    returnData.push({ json: result });
                }
            }
            catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: {
                            error: error.message,
                            operation: this.getNodeParameter('operation', i),
                        },
                    });
                }
                else {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Document processing failed: ${error.message}`);
                }
            }
        }
        return [returnData];
    }
}
exports.DocumentProcessor = DocumentProcessor;
_a = DocumentProcessor;
DocumentProcessor.loadDocument = async (context, itemIndex) => {
    const inputType = context.getNodeParameter('inputType', itemIndex);
    const documentType = context.getNodeParameter('documentType', itemIndex, 'auto');
    let loader;
    if (inputType === 'filePath') {
        const filePath = context.getNodeParameter('filePath', itemIndex);
        const fileType = documentType === 'auto' ? _a.detectFileType(filePath) : documentType;
        switch (fileType) {
            case 'pdf':
                loader = new pdf_1.PDFLoader(filePath);
                break;
            case 'docx':
                loader = new docx_1.DocxLoader(filePath);
                break;
            case 'csv':
                loader = new csv_1.CSVLoader(filePath);
                break;
            case 'txt':
            default:
                loader = new text_1.TextLoader(filePath);
                break;
        }
    }
    else if (inputType === 'binaryData') {
        // Handle binary data from n8n
        const binaryProperty = context.getNodeParameter('binaryProperty', itemIndex);
        const items = context.getInputData();
        const item = items[itemIndex];
        if (!item.binary || !item.binary[binaryProperty]) {
            throw new Error(`Binary property '${binaryProperty}' not found`);
        }
        // For binary data, we'd need to save to temp file or use blob
        // This is a simplified version
        const binaryData = item.binary[binaryProperty];
        return [new document_1.Document({
                pageContent: Buffer.from(binaryData.data, 'base64').toString(),
                metadata: { fileName: binaryData.fileName }
            })];
    }
    return await loader.load();
};
DocumentProcessor.splitDocuments = async (context, documents, itemIndex) => {
    const splitterOptions = context.getNodeParameter('splitterOptions', itemIndex, {});
    // Parse separators
    const separators = (splitterOptions.separators || '\n\n,\n, ,')
        .split(',')
        .map(s => s.replace('\n', '\n').replace('\t', '\t'));
    const splitter = new text_splitter_1.RecursiveCharacterTextSplitter({
        chunkSize: splitterOptions.chunkSize || 1000,
        chunkOverlap: splitterOptions.chunkOverlap || 200,
        separators,
        keepSeparator: splitterOptions.keepSeparator || false,
    });
    const splitDocs = await splitter.splitDocuments(documents);
    // Add metadata if requested
    if (splitterOptions.addMetadata) {
        splitDocs.forEach((doc, index) => {
            doc.metadata = {
                ...doc.metadata,
                chunkIndex: index,
                totalChunks: splitDocs.length,
                splitAt: new Date().toISOString(),
            };
        });
    }
    return splitDocs;
};
DocumentProcessor.detectFileType = (filePath) => {
    var _b;
    const extension = (_b = filePath.split('.').pop()) === null || _b === void 0 ? void 0 : _b.toLowerCase();
    switch (extension) {
        case 'pdf':
            return 'pdf';
        case 'docx':
        case 'doc':
            return 'docx';
        case 'csv':
            return 'csv';
        case 'txt':
        case 'md':
        default:
            return 'txt';
    }
};
DocumentProcessor.cleanText = (text) => {
    return text
        // Remove multiple spaces
        .replace(/\s+/g, ' ')
        // Remove multiple newlines
        .replace(/\n{3,}/g, '\n\n')
        // Trim each line
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        // Final trim
        .trim();
};

import { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { Document } from 'langchain/document';
export declare class DocumentProcessor implements INodeType {
    description: INodeTypeDescription;
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
    static loadDocument: (context: IExecuteFunctions, itemIndex: number) => Promise<Document[]>;
    static splitDocuments: (context: IExecuteFunctions, documents: Document[], itemIndex: number) => Promise<Document[]>;
    static detectFileType: (filePath: string) => string;
    static cleanText: (text: string) => string;
}

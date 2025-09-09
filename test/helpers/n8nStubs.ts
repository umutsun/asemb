import type { IExecuteFunctions, IDataObject, IHttpRequestOptions, INode, INodeExecutionData } from 'n8n-workflow';

export function stubNode(
  overrides: Partial<INode> = {},
  methods: Partial<IExecuteFunctions> = {},
): IExecuteFunctions {
  const stub = {
    ...methods,
    getNode: () => ({
      ...overrides,
      // Add default properties for a node to avoid errors
      getCredentials: () => Promise.resolve({} as IDataObject),
    } as INode),
  } as IExecuteFunctions;
  return stub;
}


type Params = Record<string, any>;

export function makeExecuteStub(opts: {
  params: Params;
  items?: Array<{ json: any }>;
  credentials?: Record<string, any>;
}): IExecuteFunctions {
  const { params, items = [{ json: {} }], credentials = {} } = opts;
  const stub: any = {
    getInputData: () => items,
    getNodeParameter: (name: string, _i: number) => params[name],
    getNode: () => ({ name: 'test-node' }),
    getCredentials: async (name: string) => credentials[name],
  };
  return stub as IExecuteFunctions;
}


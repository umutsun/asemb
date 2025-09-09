export class Configuration {
  constructor(_: any) {}
}

export class OpenAIApi {
  // Minimal surface for tests that might call it via mocks
  createEmbedding = async (_: any) => ({ data: { data: [{ embedding: [0, 0, 0] }] } });
}


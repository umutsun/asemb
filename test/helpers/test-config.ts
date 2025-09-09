// Test configuration helper
export const getTestTableName = (): string => {
  return process.env.TEST_TABLE_NAME || 'embeddings';
};

export const getTestDatabaseUrl = (): string => {
  return process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/asemb_test';
};

export const isUsingProductionData = (): boolean => {
  // Always true since we're using production embeddings table
  return true;
};

// Replace table names in SQL queries for tests
export const adaptQueryForTest = (query: string): string => {
  if (isUsingProductionData()) {
    // Replace embeddings with rag_data for tests
    return query.replace(/embeddings/g, 'rag_data');
  }
  return query;
};

// Test data safety check
export const shouldModifyTestData = (): boolean => {
  // Don't modify production data in tests
  return !isUsingProductionData();
};

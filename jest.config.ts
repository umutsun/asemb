import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  setupFilesAfterEnv: ['<rootDir>/test/setupEnv.ts'],
  moduleNameMapper: {
    '^openai$': '<rootDir>/test/mocks/openai.ts',
  },
  clearMocks: true,
  collectCoverageFrom: [
    'nodes/**/*.ts',
    'shared/**/*.ts',
    'src/shared/**/*.ts',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
              reporters: ['default'],
};

export default config;
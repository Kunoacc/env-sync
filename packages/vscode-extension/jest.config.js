module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/test/__mocks__/vscode.ts'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/extension.ts',
    '!src/views/**'
  ],
  coverageDirectory: 'coverage'
};

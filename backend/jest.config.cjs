/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  globalTeardown: '<rootDir>/tests/teardown.cjs',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'Node',
        target: 'ES2022',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true
      }
    }]
  },
  testTimeout: 15000
};

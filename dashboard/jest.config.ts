import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'node',
        jsx: 'react',
        strict: true,
        esModuleInterop: true,
      }
    }]
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']
}

export default config

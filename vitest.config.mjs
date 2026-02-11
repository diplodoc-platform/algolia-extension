import {coverageConfigDefaults, defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        include: ['test/**/*.spec.ts', 'test/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/*.test.ts'],
        exclude: ['**/node_modules/**', 'dist', 'coverage'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            include: ['src/**'],
            exclude: [
                'test/**',
                'src/**/*.spec.ts',
                'src/**/*.test.ts',
                ...coverageConfigDefaults.exclude,
            ],
            reporter: ['text', 'json', 'html', 'lcov'],
        },
    },
});

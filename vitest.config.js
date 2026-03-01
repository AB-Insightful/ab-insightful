import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment:'jsdom',
        globals:true, 
        include: [ // define where to look for tests
            'src/**/*.test.{js,jsx}',
            'app/**/__tests__/**/*.{js,jsx}'
        ],
        exclude: ['node_modules', 'dist'], // define directories to skip
        setupFiles: ['app/setupTests.js'], // define where the setup configuration is located
        css:true, 
        coverage: {
            provider: 'v8',
            reportsDirectory: 'coverage',
            reporter: ['text', 'html', 'lcov'],
            all: true, 
            include: ['src/**/*.{js,jsx}'], // define which files to perform coverage on
            exclude: [ // define which files to not perform coverage on (all tests)
                'src/**/*.test.*',
                'src/**/__tests__/**',
                'src/setupTests.js'
            ]
        }
    }
})
const { build } = require('esbuild');
const { copyFile, mkdir } = require('fs/promises');
const { join } = require('path');

const isDev = process.env.NODE_ENV === 'development';

async function runBuild() {
  try {
    await build({
      entryPoints: ['src/index.ts'],
      outfile: 'dist/index.js',
      bundle: true,
      minify: !isDev,
      platform: 'node',
      target: 'node18',
      sourcemap: isDev,
      format: 'cjs',
      define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      },
      external: [
        '@diplodoc/cli',
        '@diplodoc/search-extension',
        'algoliasearch',
        'cheerio',
        'lodash',
      ],
    });

    try {
      await mkdir('dist/client', { recursive: true });
      await copyFile('src/client/search.js', 'dist/client/search.js');
      console.log('Client search file copied successfully');
    } catch (error) {
      console.error('Error copying client search file:', error);
    }

    try {
      await mkdir('dist/workers', { recursive: true });
      await build({
        entryPoints: ['src/workers/processor.ts'],
        outfile: 'dist/workers/processor.js',
        bundle: true,
        platform: 'node',
        target: 'node18',
        format: 'cjs',
        external: [
          '@diplodoc/cli',
          '@diplodoc/search-extension',
          'algoliasearch',
          'cheerio',
          'lodash',
        ],
      });
      console.log('Worker processor file compiled successfully');
    } catch (error) {
      console.error('Error compiling worker processor file:', error);
    }

    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

runBuild();
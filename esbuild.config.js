const esbuild = require('esbuild');
const { dependencies } = require('./package.json');
const fs = require('fs');

const tsconfig = JSON.parse(fs.readFileSync('./tsconfig.json', 'utf8'));

const tsconfigWithDecorators = {
  ...tsconfig,
  compilerOptions: {
    ...tsconfig.compilerOptions,
    experimentalDecorators: true,
    emitDecoratorMetadata: true
  }
};

const baseConfig = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/index.js',
  sourcemap: true,
  tsconfigRaw: JSON.stringify(tsconfigWithDecorators),
  external: [
    // ...Object.keys(dependencies || {}),
    '@diplodoc/cli',
    // '@diplodoc/cli/lib/*'
  ]
};

async function build() {
  try {
    await esbuild.build(baseConfig);
    console.log('Build completed successfully');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();

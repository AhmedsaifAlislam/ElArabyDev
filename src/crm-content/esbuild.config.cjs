// esbuild.config.js — Build config for CRM Content Script
// Usage: node esbuild.config.js

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const outDir = path.join(__dirname, 'dist');

async function build() {
  // Ensure dist directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const ctx = await esbuild.context({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: path.join(outDir, 'crm-content.js'),
    platform: 'browser',
    target: 'chrome90',
    sourcemap: true,
    sourcesContent: false,
    treeShaking: true,
    minify: !isWatch,
    splitting: false,
    loader: {
      '.ts': 'ts',
      '.css': 'text',
    },
    define: {
      'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
    },
    banner: {
      js: '/* CRM Content Script - El Araby Extensions */',
    },
  });

  if (isWatch) {
    await ctx.watch();
    console.log('👀 Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('✅ Build complete:', outDir);
  }
}

build().catch(() => process.exit(1));
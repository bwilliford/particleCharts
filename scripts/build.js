#!/usr/bin/env node
/**
 * Bundler. Concatenates the ES modules in dependency order and wraps them in a
 * UMD shell, so `dist/particle-charts.js` works from a plain <script> tag —
 * including over file://, which is what the demo page relies on.
 *
 * This is viable because the source obeys two rules, enforced below:
 *   1. every import is a single-line named import from a relative path
 *   2. no two modules declare the same top-level name
 */

import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'dist');

// Dependency order. `class X extends Y` is evaluated eagerly, so bases first.
const MODULES = [
  'core/utils.js',
  'core/color.js',
  'core/scale.js',
  'core/data.js',
  'core/options.js',
  'core/particles.js',
  'core/renderer.js',
  'core/axis.js',
  'core/styles.js',
  'core/legend.js',
  'core/tooltip.js',
  'core/sampling.js',
  'core/chart.js',
  'charts/cartesian.js',
  'charts/line.js',
  'charts/bar.js',
  'charts/pie.js',
  'index.js'
];

const EXPORTS = [
  'ParticleChart',
  'Chart',
  'LineChart',
  'BarChart',
  'PieChart',
  'line',
  'area',
  'bar',
  'pie',
  'donut',
  'defaults',
  'palette',
  'version'
];

const ALIASES = { defaults: 'DEFAULTS', palette: 'DEFAULT_PALETTE' };

const IMPORT_RE = /^\s*import\s+[^;]*?from\s*['"][^'"]+['"];?\s*$/;
const REEXPORT_RE = /^\s*export\s*\{[^}]*\}\s*(from\s*['"][^'"]+['"])?;?\s*$/;
const DECL_RE = /^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;

function strip(source, file) {
  const declared = [];
  const lines = source.split('\n');
  const kept = [];

  for (const line of lines) {
    if (IMPORT_RE.test(line)) continue;
    if (REEXPORT_RE.test(line)) continue;
    if (/^\s*import\s+/.test(line) && !line.includes('from')) {
      throw new Error(`${file}: multi-line or side-effect imports are not supported by this bundler`);
    }
    const decl = DECL_RE.exec(line);
    if (decl) declared.push(decl[1]);
    kept.push(line.replace(/^export\s+/, ''));
  }

  return { code: kept.join('\n'), declared };
}

async function build() {
  const seen = new Map();
  const chunks = [];

  for (const rel of MODULES) {
    const file = path.join(SRC, rel);
    const { code, declared } = strip(fs.readFileSync(file, 'utf8'), rel);
    for (const name of declared) {
      if (seen.has(name)) {
        throw new Error(
          `Duplicate top-level name "${name}" in ${rel} (already declared in ${seen.get(name)}). ` +
            'Names share one scope in the bundle — rename one of them.'
        );
      }
      seen.set(name, rel);
    }
    chunks.push(`// ---- src/${rel} ${'-'.repeat(Math.max(0, 62 - rel.length))}\n${code.trim()}\n`);
  }

  const returned = EXPORTS.map((name) => {
    const local = ALIASES[name] || name;
    return `    ${name}: ${local}`;
  }).join(',\n');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  /* Deliberately no build date. dist/ is committed and CI asserts a fresh
     build matches it byte for byte, so a timestamp in the banner would mark
     dist/ stale at every midnight UTC even with no source change. Keeping the
     build reproducible is also what lets provenance attest the tarball. */
  const banner =
    `/*!\n * Particle Charts v${pkg.version} — data visualisation made of particles.\n` +
    ` * ${pkg.homepage || 'https://github.com/'}\n * MIT Licence.\n */\n`;

  const bundle =
    banner +
    `(function (root, factory) {\n` +
    `  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();\n` +
    `  else if (typeof define === 'function' && define.amd) define([], factory);\n` +
    `  else root.ParticleCharts = factory();\n` +
    `})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {\n` +
    `'use strict';\n\n` +
    chunks.join('\n') +
    `\n  var api = {\n${returned}\n  };\n` +
    `  api.ParticleChart.create = api.ParticleChart;\n` +
    `  return api;\n});\n`;

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const written = [];
  const emit = (name, contents) => {
    fs.writeFileSync(path.join(OUT_DIR, name), contents);
    written.push([name, Buffer.byteLength(contents), gzipSync(contents).length]);
  };

  // The browser build, and the same bytes under .cjs — the UMD wrapper is
  // already CommonJS-aware, but `type: module` means a .js file can never be
  // require()d, whatever its contents.
  emit('particle-charts.js', bundle);
  emit('particle-charts.cjs', bundle);

  // Re-export the ESM entry point under dist/ so both module systems resolve.
  emit(
    'particle-charts.esm.js',
    `export * from '../src/index.js';\nexport { ParticleChart as default } from '../src/index.js';\n`
  );

  const minified = await minify(bundle);
  if (minified) emit('particle-charts.min.js', minified);

  for (const [name, raw, gz] of written) {
    console.log(`  dist/${name.padEnd(24)} ${kb(raw).padStart(8)}  ${kb(gz).padStart(8)} gzipped`);
  }
  console.log(`built ${written.length} files from ${MODULES.length} modules`);
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + ' kB';
}

/**
 * Minification is the one thing not worth hand-rolling, so esbuild does it.
 * It is a devDependency only — nothing ships with a runtime dependency — and a
 * missing install degrades to "no .min.js" rather than a failed build.
 */
async function minify(code) {
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch {
    console.warn('  (esbuild not installed — skipping particle-charts.min.js; run `npm install`)');
    return null;
  }
  const result = await esbuild.transform(code, {
    minify: true,
    target: 'es2019',
    legalComments: 'inline' // keep the /*! banner */
  });
  return result.code;
}

await build();

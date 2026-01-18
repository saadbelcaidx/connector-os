/**
 * BIZGRAPH Build Script — Business Domain Semantic Graph
 *
 * Builds deterministic semantic expansion bundles from:
 * - Manual Core (code-owned business relationships)
 * - O*NET (optional, if available in data/onet/)
 * - ESCO (optional, if available in data/esco/)
 *
 * Usage:
 *   npm run build:bizgraph:mini   # Build mini bundle (manual core only)
 *   npm run build:bizgraph        # Build full bundle (with O*NET/ESCO)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as crypto from 'crypto';

import {
  type BizGraphBundle,
  type BizGraphConcept,
  type BizGraphEdge,
} from '../../src/semantic/bizgraph/schema';

import {
  buildManualCoreConcepts,
  buildLabelIndex,
  buildManualCoreEdges,
} from '../../src/semantic/bizgraph/manualCore';

// =============================================================================
// CONFIGURATION
// =============================================================================

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'semantic');
const DATA_DIR = path.join(process.cwd(), 'data');

const BUNDLE_VERSION = '1.0.0';

// =============================================================================
// BUILD FUNCTIONS
// =============================================================================

/**
 * Build the mini bundle from manual core only.
 * This is the validation-first approach — mini bundle must pass tests before full build.
 */
function buildMiniBundle(): BizGraphBundle {
  console.log('\n📦 Building BIZGRAPH Mini Bundle (Manual Core only)...\n');

  // Build concepts from manual core
  const concepts = buildManualCoreConcepts();
  const conceptCount = Object.keys(concepts).length;
  console.log(`  ✓ Built ${conceptCount} concepts from manual core`);

  // Build label index
  const labelIndex = buildLabelIndex(concepts);
  const labelCount = labelIndex.size;
  console.log(`  ✓ Built label index with ${labelCount} labels`);

  // Build edges from manual core
  const edges = buildManualCoreEdges(labelIndex);
  console.log(`  ✓ Built ${edges.length} edges from manual core`);

  // Build timestamp
  const builtAt = new Date().toISOString();

  // Build hash for determinism verification
  // Hash is computed from sorted concepts + edges (content-addressable)
  const contentForHash = JSON.stringify({
    concepts: sortObjectKeys(concepts),
    edges: edges,
  });
  const buildHash = crypto.createHash('sha256').update(contentForHash).digest('hex').slice(0, 16);

  const bundle: BizGraphBundle = {
    version: BUNDLE_VERSION,
    built_at: builtAt,
    build_hash: buildHash,
    meta: {
      concept_count: conceptCount,
      edge_count: edges.length,
      label_count: labelCount,
      sources: ['manual_core'],
    },
    concepts: sortObjectKeys(concepts),
    edges: edges,
  };

  return bundle;
}

/**
 * Sort object keys for deterministic output.
 */
function sortObjectKeys<T>(obj: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = obj[key];
  }
  return sorted;
}

/**
 * Write bundle to gzipped file and meta file.
 */
function writeBundle(bundle: BizGraphBundle, baseName: string): { gzSize: number; jsonSize: number } {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write JSON (for debugging/inspection)
  const jsonPath = path.join(OUTPUT_DIR, `${baseName}.json`);
  const jsonContent = JSON.stringify(bundle, null, 2);
  fs.writeFileSync(jsonPath, jsonContent);
  const jsonSize = Buffer.byteLength(jsonContent);

  // Write gzipped bundle
  const gzPath = path.join(OUTPUT_DIR, `${baseName}.json.gz`);
  const gzContent = zlib.gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 });
  fs.writeFileSync(gzPath, gzContent);
  const gzSize = gzContent.length;

  // Write meta file
  const metaPath = path.join(OUTPUT_DIR, `${baseName}.meta.json`);
  const meta = {
    version: bundle.version,
    built_at: bundle.built_at,
    build_hash: bundle.build_hash,
    concept_count: bundle.meta.concept_count,
    edge_count: bundle.meta.edge_count,
    label_count: bundle.meta.label_count,
    sources: bundle.meta.sources,
    json_size_bytes: jsonSize,
    gz_size_bytes: gzSize,
    json_size_kb: (jsonSize / 1024).toFixed(2),
    gz_size_kb: (gzSize / 1024).toFixed(2),
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  return { gzSize, jsonSize };
}

/**
 * Verify bundle is deterministic by rebuilding and comparing hash.
 */
function verifyDeterminism(bundle: BizGraphBundle): boolean {
  console.log('\n🔍 Verifying determinism...');

  const bundle2 = buildMiniBundle();

  if (bundle.build_hash === bundle2.build_hash) {
    console.log(`  ✓ Build hash stable: ${bundle.build_hash}`);
    return true;
  } else {
    console.log(`  ✗ Build hash mismatch!`);
    console.log(`    First:  ${bundle.build_hash}`);
    console.log(`    Second: ${bundle2.build_hash}`);
    return false;
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const buildFull = args.includes('--full');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  BIZGRAPH Build Script v1.0');
  console.log('  Business Domain Semantic Graph');
  console.log('═══════════════════════════════════════════════════════════════════');

  if (buildFull) {
    // Check for O*NET and ESCO data
    const onetDir = path.join(DATA_DIR, 'onet');
    const escoDir = path.join(DATA_DIR, 'esco');

    if (!fs.existsSync(onetDir) || !fs.existsSync(escoDir)) {
      console.log('\n⚠️  Full build requires O*NET and ESCO data.');
      console.log('   Place files in:');
      console.log(`   - ${onetDir}`);
      console.log(`   - ${escoDir}`);
      console.log('\n   Running mini build instead...');
    } else {
      console.log('\n⚠️  Full build not yet implemented. Running mini build...');
    }
  }

  // Build mini bundle
  const bundle = buildMiniBundle();

  // Write bundle
  const baseName = 'bizgraph-mini-v1';
  const { gzSize, jsonSize } = writeBundle(bundle, baseName);

  console.log('\n📝 Bundle written:');
  console.log(`  - ${OUTPUT_DIR}/${baseName}.json.gz (${(gzSize / 1024).toFixed(2)} KB)`);
  console.log(`  - ${OUTPUT_DIR}/${baseName}.json (${(jsonSize / 1024).toFixed(2)} KB)`);
  console.log(`  - ${OUTPUT_DIR}/${baseName}.meta.json`);

  // Verify determinism
  const isDeterministic = verifyDeterminism(bundle);

  // Size check
  const maxGzSize = 200 * 1024; // 200KB target for mini bundle
  if (gzSize > maxGzSize) {
    console.log(`\n⚠️  WARNING: gz size ${(gzSize / 1024).toFixed(2)} KB exceeds 200KB target`);
  } else {
    console.log(`\n✓ Size check passed: ${(gzSize / 1024).toFixed(2)} KB < 200KB`);
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  BUILD SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Version:     ${bundle.version}`);
  console.log(`  Build Hash:  ${bundle.build_hash}`);
  console.log(`  Concepts:    ${bundle.meta.concept_count}`);
  console.log(`  Edges:       ${bundle.meta.edge_count}`);
  console.log(`  Labels:      ${bundle.meta.label_count}`);
  console.log(`  Sources:     ${bundle.meta.sources.join(', ')}`);
  console.log(`  GZ Size:     ${(gzSize / 1024).toFixed(2)} KB`);
  console.log(`  Deterministic: ${isDeterministic ? '✓' : '✗'}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (!isDeterministic) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});

/**
 * BIZGRAPH Full Bundle Build Script (BIZ-2C + BIZ-2D)
 *
 * Merges Manual Core + O*NET + ESCO into comprehensive business domain graph.
 * Target: 1,000-5,000 concepts, <5MB, <50MB RAM, <2s load.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as crypto from 'crypto';

import {
  type BizGraphBundle,
  type BizGraphConcept,
  type BizGraphEdge,
  type TagType,
  type Domain,
  type EdgeRelation,
  canonicalizeLabel,
  generateConceptId,
} from '../../src/semantic/bizgraph/schema';

import {
  buildManualCoreConcepts,
  buildLabelIndex,
  buildManualCoreEdges,
} from '../../src/semantic/bizgraph/manualCore';

import { extractOnet } from './extract-onet';
import { extractEsco } from './extract-esco';

// =============================================================================
// CONFIGURATION
// =============================================================================

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'semantic');
const DATA_DIR = path.join(process.cwd(), 'data');

const BUNDLE_VERSION = '2.0.0';

// Domain classification based on O*NET SOC codes
const SOC_DOMAIN_MAP: Record<string, Domain> = {
  '11': 'general',      // Management Occupations
  '13': 'finance',      // Business and Financial Operations
  '15': 'tech',         // Computer and Mathematical
  '17': 'tech',         // Architecture and Engineering
  '19': 'tech',         // Life, Physical, and Social Science
  '21': 'general',      // Community and Social Service
  '23': 'general',      // Legal
  '25': 'general',      // Educational Instruction
  '27': 'creative',     // Arts, Design, Entertainment
  '29': 'healthcare',   // Healthcare Practitioners
  '31': 'healthcare',   // Healthcare Support
  '33': 'general',      // Protective Service
  '35': 'general',      // Food Preparation
  '37': 'general',      // Building and Grounds
  '39': 'general',      // Personal Care
  '41': 'sales',        // Sales
  '43': 'general',      // Office and Administrative
  '45': 'general',      // Farming, Fishing
  '47': 'general',      // Construction
  '49': 'general',      // Installation, Maintenance
  '51': 'general',      // Production
  '53': 'general',      // Transportation
};

// ISCO code to domain mapping
const ISCO_DOMAIN_MAP: Record<string, Domain> = {
  '1': 'general',       // Managers
  '2': 'tech',          // Professionals
  '3': 'tech',          // Technicians
  '4': 'general',       // Clerical Support
  '5': 'sales',         // Service and Sales
  '6': 'general',       // Skilled Agricultural
  '7': 'general',       // Craft Workers
  '8': 'general',       // Plant Operators
  '9': 'general',       // Elementary Occupations
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getDomainFromSocCode(socCode: string): Domain {
  const prefix = socCode.split('-')[0];
  return SOC_DOMAIN_MAP[prefix] || 'general';
}

function getDomainFromIscoCode(iscoCode: string): Domain {
  const prefix = iscoCode.charAt(0);
  return ISCO_DOMAIN_MAP[prefix] || 'general';
}

function cleanLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special chars except dash
    .replace(/\s+/g, ' ')     // Collapse whitespace
    .trim();
}

function sortObjectKeys<T>(obj: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = obj[key];
  }
  return sorted;
}

// =============================================================================
// BUILD FUNCTIONS
// =============================================================================

interface BuildContext {
  concepts: Record<string, BizGraphConcept>;
  labelIndex: Map<string, string>; // label -> conceptId
  edges: BizGraphEdge[];
  stats: {
    manualCoreConcepts: number;
    onetConcepts: number;
    escoConcepts: number;
    manualCoreEdges: number;
    onetEdges: number;
    escoEdges: number;
    duplicatesSkipped: number;
  };
}

function initContext(): BuildContext {
  return {
    concepts: {},
    labelIndex: new Map(),
    edges: [],
    stats: {
      manualCoreConcepts: 0,
      onetConcepts: 0,
      escoConcepts: 0,
      manualCoreEdges: 0,
      onetEdges: 0,
      escoEdges: 0,
      duplicatesSkipped: 0,
    },
  };
}

function addConcept(
  ctx: BuildContext,
  tag: TagType,
  domain: Domain,
  labels: string[],
  aliases: string[],
  source: 'manual' | 'onet' | 'esco'
): string | null {
  // Clean and validate labels
  const cleanLabels = labels.map(cleanLabel).filter(l => l.length > 0);
  const cleanAliases = aliases.map(cleanLabel).filter(l => l.length > 0);

  if (cleanLabels.length === 0) return null;

  const primaryLabel = cleanLabels[0];

  // Check if concept already exists (by any label)
  for (const label of [...cleanLabels, ...cleanAliases]) {
    const existingId = ctx.labelIndex.get(label);
    if (existingId) {
      // Concept exists - merge labels/aliases
      const existing = ctx.concepts[existingId];
      if (existing) {
        // Add new labels that don't exist
        for (const newLabel of cleanLabels) {
          if (!existing.l.includes(newLabel) && !existing.a.includes(newLabel)) {
            existing.a.push(newLabel);
            ctx.labelIndex.set(newLabel, existingId);
          }
        }
        for (const newAlias of cleanAliases) {
          if (!existing.l.includes(newAlias) && !existing.a.includes(newAlias)) {
            existing.a.push(newAlias);
            ctx.labelIndex.set(newAlias, existingId);
          }
        }
        ctx.stats.duplicatesSkipped++;
        return existingId;
      }
    }
  }

  // Create new concept
  const id = generateConceptId(tag, domain, primaryLabel);

  const concept: BizGraphConcept = {
    t: tag,
    d: domain,
    l: cleanLabels,
    a: cleanAliases.filter(a => !cleanLabels.includes(a)), // Exclude labels from aliases
  };

  ctx.concepts[id] = concept;

  // Index all labels
  for (const label of cleanLabels) {
    ctx.labelIndex.set(label, id);
  }
  for (const alias of cleanAliases) {
    if (!ctx.labelIndex.has(alias)) {
      ctx.labelIndex.set(alias, id);
    }
  }

  // Update stats
  if (source === 'manual') ctx.stats.manualCoreConcepts++;
  else if (source === 'onet') ctx.stats.onetConcepts++;
  else if (source === 'esco') ctx.stats.escoConcepts++;

  return id;
}

function addEdge(
  ctx: BuildContext,
  fromLabel: string,
  toLabel: string,
  relation: EdgeRelation,
  weight: number,
  source: 'manual' | 'onet' | 'esco'
): boolean {
  const cleanFrom = cleanLabel(fromLabel);
  const cleanTo = cleanLabel(toLabel);

  const fromId = ctx.labelIndex.get(cleanFrom);
  const toId = ctx.labelIndex.get(cleanTo);

  if (!fromId || !toId || fromId === toId) return false;

  // Check for duplicate edge
  const existingEdge = ctx.edges.find(
    e => e[0] === fromId && e[2] === toId && e[1] === relation
  );
  if (existingEdge) {
    // Update weight if new weight is higher
    if (weight > existingEdge[3]) {
      existingEdge[3] = weight;
    }
    return false;
  }

  const edge: BizGraphEdge = [fromId, relation, toId, weight];
  ctx.edges.push(edge);

  // Update stats
  if (source === 'manual') ctx.stats.manualCoreEdges++;
  else if (source === 'onet') ctx.stats.onetEdges++;
  else if (source === 'esco') ctx.stats.escoEdges++;

  return true;
}

// =============================================================================
// PHASE 1: Manual Core (Priority)
// =============================================================================

function addManualCore(ctx: BuildContext): void {
  console.log('\n📦 Phase 1: Adding Manual Core (Priority)...\n');

  // Build manual core concepts
  const manualConcepts = buildManualCoreConcepts();

  for (const [id, concept] of Object.entries(manualConcepts)) {
    // Add concept
    const newId = addConcept(
      ctx,
      concept.t,
      concept.d,
      concept.l,
      concept.a,
      'manual'
    );

    // If ID changed due to merge, we need to update our tracking
    if (newId && newId !== id) {
      console.log(`  ⚠ Merged ${id} into ${newId}`);
    }
  }

  // Build manual core edges
  const manualEdges = buildManualCoreEdges(ctx.labelIndex);

  for (const edge of manualEdges) {
    // Find the labels for the IDs
    let fromLabel = '';
    let toLabel = '';

    for (const [label, conceptId] of ctx.labelIndex) {
      if (conceptId === edge[0]) fromLabel = label;
      if (conceptId === edge[2]) toLabel = label;
    }

    if (fromLabel && toLabel) {
      addEdge(ctx, fromLabel, toLabel, edge[1], edge[3], 'manual');
    }
  }

  console.log(`  ✓ Manual core: ${ctx.stats.manualCoreConcepts} concepts, ${ctx.stats.manualCoreEdges} edges`);
}

// =============================================================================
// PHASE 2: O*NET Integration
// =============================================================================

function addOnetData(ctx: BuildContext): void {
  console.log('\n📊 Phase 2: Adding O*NET 30.1 Data...\n');

  const onetDir = path.join(DATA_DIR, 'onet', 'db_30_1_text');
  if (!fs.existsSync(onetDir)) {
    console.log('  ⚠ O*NET data not found, skipping...');
    return;
  }

  const onet = extractOnet(onetDir);

  // Add occupations as concepts
  for (const occupation of onet.occupations) {
    const domain = getDomainFromSocCode(occupation.socCode);

    // Primary label is the title, aliases are alternate titles
    addConcept(
      ctx,
      'role',
      domain,
      [occupation.title],
      occupation.alternateTitles.slice(0, 10), // Limit to 10 most relevant
      'onet'
    );
  }

  // Add skills as concepts
  for (const skillName of onet.uniqueSkills) {
    addConcept(ctx, 'skill', 'general', [skillName], [], 'onet');
  }

  // Add knowledge areas as concepts
  for (const knowledgeName of onet.uniqueKnowledge) {
    addConcept(ctx, 'knowledge', 'general', [knowledgeName], [], 'onet');
  }

  // Add occupation-skill edges (related)
  for (const occupation of onet.occupations) {
    for (const skill of occupation.skills.slice(0, 5)) { // Top 5 skills per occupation
      addEdge(ctx, occupation.title, skill.name, 'related', 0.8, 'onet');
    }
  }

  // Add occupation-knowledge edges (related)
  for (const occupation of onet.occupations) {
    for (const knowledge of occupation.knowledge.slice(0, 5)) { // Top 5 knowledge per occupation
      addEdge(ctx, occupation.title, knowledge.name, 'related', 0.8, 'onet');
    }
  }

  // Add alternate title edges (equivalent)
  for (const occupation of onet.occupations) {
    for (const altTitle of occupation.alternateTitles.slice(0, 10)) {
      addEdge(ctx, occupation.title, altTitle, 'equivalent', 1.0, 'onet');
    }
  }

  console.log(`  ✓ O*NET: ${ctx.stats.onetConcepts} concepts, ${ctx.stats.onetEdges} edges`);
}

// =============================================================================
// PHASE 3: ESCO Integration
// =============================================================================

function addEscoData(ctx: BuildContext): void {
  console.log('\n🌍 Phase 3: Adding ESCO v1.1.1 Data...\n');

  const escoDir = path.join(
    DATA_DIR,
    'esco',
    'tabiya-open-dataset-main',
    'tabiya-esco-v1.1.1',
    'csv'
  );

  if (!fs.existsSync(escoDir)) {
    console.log('  ⚠ ESCO data not found, skipping...');
    return;
  }

  const esco = extractEsco(escoDir);

  // Add occupations as concepts
  for (const occupation of esco.occupations) {
    const domain = getDomainFromIscoCode(occupation.iscoCode);

    addConcept(
      ctx,
      'role',
      domain,
      [occupation.preferredLabel],
      occupation.altLabels.slice(0, 10), // Limit to 10 most relevant
      'esco'
    );
  }

  // Add skills as concepts
  for (const skill of esco.skills) {
    addConcept(
      ctx,
      'skill',
      'general',
      [skill.preferredLabel],
      skill.altLabels.slice(0, 5),
      'esco'
    );
  }

  // Add occupation-skill edges (related)
  for (const occupation of esco.occupations) {
    for (const skillLabel of occupation.skills.slice(0, 5)) { // Top 5 skills per occupation
      addEdge(ctx, occupation.preferredLabel, skillLabel, 'related', 0.8, 'esco');
    }
  }

  // Add alt label edges (equivalent)
  for (const occupation of esco.occupations) {
    for (const altLabel of occupation.altLabels.slice(0, 10)) {
      addEdge(ctx, occupation.preferredLabel, altLabel, 'equivalent', 1.0, 'esco');
    }
  }

  for (const skill of esco.skills) {
    for (const altLabel of skill.altLabels.slice(0, 5)) {
      addEdge(ctx, skill.preferredLabel, altLabel, 'equivalent', 1.0, 'esco');
    }
  }

  console.log(`  ✓ ESCO: ${ctx.stats.escoConcepts} concepts, ${ctx.stats.escoEdges} edges`);
}

// =============================================================================
// BUNDLE OUTPUT
// =============================================================================

function buildBundle(ctx: BuildContext): BizGraphBundle {
  const conceptCount = Object.keys(ctx.concepts).length;
  const edgeCount = ctx.edges.length;
  const labelCount = ctx.labelIndex.size;

  const builtAt = new Date().toISOString();

  // Build hash
  const contentForHash = JSON.stringify({
    concepts: sortObjectKeys(ctx.concepts),
    edges: ctx.edges,
  });
  const buildHash = crypto.createHash('sha256').update(contentForHash).digest('hex').slice(0, 16);

  return {
    version: BUNDLE_VERSION,
    built_at: builtAt,
    build_hash: buildHash,
    meta: {
      concept_count: conceptCount,
      edge_count: edgeCount,
      label_count: labelCount,
      sources: ['manual_core', 'onet_30.1', 'esco_1.1.1'],
    },
    concepts: sortObjectKeys(ctx.concepts),
    edges: ctx.edges,
  };
}

function writeBundle(bundle: BizGraphBundle, baseName: string): { gzSize: number; jsonSize: number } {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write JSON (for debugging)
  const jsonPath = path.join(OUTPUT_DIR, `${baseName}.json`);
  const jsonContent = JSON.stringify(bundle, null, 2);
  fs.writeFileSync(jsonPath, jsonContent);
  const jsonSize = Buffer.byteLength(jsonContent);

  // Write gzipped bundle
  const gzPath = path.join(OUTPUT_DIR, `${baseName}.json.gz`);
  const gzContent = zlib.gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 });
  fs.writeFileSync(gzPath, gzContent);
  const gzSize = gzContent.length;

  // Write meta
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
    gz_size_mb: (gzSize / 1024 / 1024).toFixed(2),
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  return { gzSize, jsonSize };
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  BIZGRAPH Full Bundle Build Script v2.0');
  console.log('  BIZ-2: Manual Core + O*NET + ESCO Integration');
  console.log('═══════════════════════════════════════════════════════════════════');

  const ctx = initContext();

  // Phase 1: Manual Core (Priority - never overwritten)
  addManualCore(ctx);

  // Phase 2: O*NET Integration
  addOnetData(ctx);

  // Phase 3: ESCO Integration
  addEscoData(ctx);

  // Build bundle
  console.log('\n📦 Building Full Bundle...\n');
  const bundle = buildBundle(ctx);

  // Write bundle
  const baseName = 'bizgraph-full-v1';
  const { gzSize, jsonSize } = writeBundle(bundle, baseName);

  // Summary
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  BIZ-2 BUILD SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Version:        ${bundle.version}`);
  console.log(`  Build Hash:     ${bundle.build_hash}`);
  console.log('');
  console.log('  CONCEPTS:');
  console.log(`    Manual Core:  ${ctx.stats.manualCoreConcepts}`);
  console.log(`    O*NET:        ${ctx.stats.onetConcepts}`);
  console.log(`    ESCO:         ${ctx.stats.escoConcepts}`);
  console.log(`    Total:        ${bundle.meta.concept_count}`);
  console.log('');
  console.log('  EDGES:');
  console.log(`    Manual Core:  ${ctx.stats.manualCoreEdges}`);
  console.log(`    O*NET:        ${ctx.stats.onetEdges}`);
  console.log(`    ESCO:         ${ctx.stats.escoEdges}`);
  console.log(`    Total:        ${bundle.meta.edge_count}`);
  console.log('');
  console.log('  DEDUPLICATION:');
  console.log(`    Duplicates Merged: ${ctx.stats.duplicatesSkipped}`);
  console.log(`    Unique Labels:     ${bundle.meta.label_count}`);
  console.log('');
  console.log('  SIZE:');
  console.log(`    JSON:         ${(jsonSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`    Gzipped:      ${(gzSize / 1024 / 1024).toFixed(2)} MB`);
  console.log('');
  console.log('  FILES:');
  console.log(`    ${OUTPUT_DIR}/${baseName}.json.gz`);
  console.log(`    ${OUTPUT_DIR}/${baseName}.json`);
  console.log(`    ${OUTPUT_DIR}/${baseName}.meta.json`);
  console.log('');

  // Validation checks
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (gzSize > maxSize) {
    console.log(`  ⚠ WARNING: Bundle size ${(gzSize / 1024 / 1024).toFixed(2)} MB exceeds 5MB target`);
  } else {
    console.log(`  ✓ Size check PASSED: ${(gzSize / 1024 / 1024).toFixed(2)} MB < 5MB`);
  }

  console.log('═══════════════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});

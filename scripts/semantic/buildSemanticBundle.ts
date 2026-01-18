/**
 * MATCH-2A1: ConceptNet Semantic Bundle Builder
 *
 * Downloads ConceptNet 5.7 and builds a compressed semantic graph bundle
 * for offline use in the matching engine.
 *
 * Usage: npm run build:semantic
 * Output: public/semantic/semantic-v{date}.json.gz
 *
 * ARCHITECTURE:
 * - Downloads ConceptNet CSV (~2GB compressed, ~8GB uncompressed)
 * - Streams through file to avoid memory explosion
 * - Filters English concepts + relevant relations
 * - Applies type tag taxonomy for guardrails
 * - Outputs <10MB compressed bundle
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as zlib from 'zlib';
import * as readline from 'readline';
import { createHash } from 'crypto';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // ConceptNet 5.7 assertions file
  CONCEPTNET_URL: 'https://s3.amazonaws.com/conceptnet/downloads/2019/edges/conceptnet-assertions-5.7.0.csv.gz',

  // Local cache path (reuse if already downloaded)
  CACHE_DIR: path.join(process.cwd(), '.cache', 'conceptnet'),
  CACHE_FILE: 'conceptnet-assertions-5.7.0.csv.gz',

  // Output path
  OUTPUT_DIR: path.join(process.cwd(), 'public', 'semantic'),

  // Relations to keep (most semantically useful for matching)
  KEEP_RELATIONS: new Set([
    '/r/Synonym',      // Direct synonyms (highest value)
    '/r/RelatedTo',    // General semantic relatedness
    '/r/SimilarTo',    // Similar but not identical
  ]),

  // Minimum edge weight to include (filters noise)
  MIN_WEIGHT: 1.0,

  // Maximum expansions per concept (prevents explosion)
  MAX_EXPANSIONS_PER_CONCEPT: 6,

  // Target bundle size (will sample if exceeded)
  TARGET_SIZE_MB: 8,
};

// =============================================================================
// TYPE TAG TAXONOMY (MATCH-2C: Guardrails)
// =============================================================================

/**
 * Type tags categorize concepts to prevent false positives.
 * A recruiting firm (function:hiring) won't match a recruiting office (domain:military).
 */
const TYPE_TAGS: Record<string, { patterns: RegExp[]; priority: number }> = {
  // Business domains
  'domain:tech': {
    patterns: [/software/, /engineer/, /developer/, /programming/, /code/, /tech/, /digital/, /app/, /saas/, /cloud/],
    priority: 10,
  },
  'domain:finance': {
    patterns: [/financ/, /bank/, /invest/, /capital/, /fund/, /money/, /wealth/, /asset/],
    priority: 10,
  },
  'domain:healthcare': {
    patterns: [/health/, /medic/, /pharma/, /clinic/, /hospital/, /patient/, /doctor/, /nurse/],
    priority: 10,
  },
  'domain:legal': {
    patterns: [/legal/, /law/, /attorney/, /lawyer/, /litigation/, /court/, /contract/],
    priority: 10,
  },
  'domain:realestate': {
    patterns: [/real estate/, /property/, /housing/, /building/, /construction/, /architect/],
    priority: 10,
  },

  // Business functions
  'function:hiring': {
    patterns: [/recruit/, /hiring/, /talent/, /staffing/, /headhunt/, /placement/, /hr/, /human resource/],
    priority: 20,
  },
  'function:sales': {
    patterns: [/sales/, /selling/, /revenue/, /deal/, /customer/, /client/, /account/],
    priority: 20,
  },
  'function:marketing': {
    patterns: [/marketing/, /brand/, /advertis/, /promotion/, /campaign/, /seo/, /content/],
    priority: 20,
  },
  'function:operations': {
    patterns: [/operation/, /logistics/, /supply chain/, /warehouse/, /distribution/],
    priority: 20,
  },

  // Intent signals
  'intent:need': {
    patterns: [/need/, /want/, /require/, /seek/, /looking for/, /searching/],
    priority: 30,
  },
  'intent:provide': {
    patterns: [/provide/, /offer/, /deliver/, /supply/, /give/, /service/],
    priority: 30,
  },

  // Activity types
  'activity:growing': {
    patterns: [/grow/, /expand/, /scale/, /increase/, /build/, /launch/],
    priority: 15,
  },
  'activity:hiring': {
    patterns: [/hire/, /hiring/, /recruit/, /onboard/, /staff/],
    priority: 25,
  },
};

// =============================================================================
// SEMANTIC GRAPH STRUCTURE
// =============================================================================

interface SemanticEdge {
  target: string;
  weight: number;
  relation: string;
}

interface ConceptNode {
  concept: string;
  edges: SemanticEdge[];
  tags: string[];
}

interface SemanticBundle {
  version: string;
  buildDate: string;
  stats: {
    totalConcepts: number;
    totalEdges: number;
    avgEdgesPerConcept: number;
  };
  concepts: Record<string, {
    e: Array<[string, number, string]>;  // [target, weight, relation] - compressed
    t: string[];                          // tags - compressed
  }>;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function log(message: string, ...args: any[]) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${message}`, ...args);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Extract the concept word from a ConceptNet URI.
 * /c/en/software_engineer -> software engineer
 */
function extractConcept(uri: string): string | null {
  // Only process English concepts
  if (!uri.startsWith('/c/en/')) return null;

  // Extract the concept part
  const parts = uri.split('/');
  if (parts.length < 4) return null;

  // Convert underscores to spaces, remove sense disambiguation
  let concept = parts[3].replace(/_/g, ' ').toLowerCase();

  // Remove word sense numbers (e.g., "bank/n/wn" -> "bank")
  if (parts.length > 4) {
    // Keep multi-word concepts but strip sense info
  }

  // Skip very short or very long concepts
  if (concept.length < 2 || concept.length > 50) return null;

  // Skip concepts that are just numbers
  if (/^\d+$/.test(concept)) return null;

  return concept;
}

/**
 * Assign type tags to a concept based on pattern matching.
 */
function assignTypeTags(concept: string): string[] {
  const tags: string[] = [];
  const lowerConcept = concept.toLowerCase();

  for (const [tag, config] of Object.entries(TYPE_TAGS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(lowerConcept)) {
        tags.push(tag);
        break;
      }
    }
  }

  return tags;
}

/**
 * Extract relation type from ConceptNet relation URI.
 * /r/RelatedTo -> RelatedTo
 */
function extractRelation(uri: string): string {
  const parts = uri.split('/');
  return parts[parts.length - 1];
}

// =============================================================================
// DOWNLOAD HANDLER
// =============================================================================

async function downloadConceptNet(): Promise<string> {
  const cacheDir = CONFIG.CACHE_DIR;
  const cachePath = path.join(cacheDir, CONFIG.CACHE_FILE);

  // Check if already cached
  if (fs.existsSync(cachePath)) {
    const stats = fs.statSync(cachePath);
    log(`Using cached ConceptNet file (${formatBytes(stats.size)})`);
    return cachePath;
  }

  // Create cache directory
  fs.mkdirSync(cacheDir, { recursive: true });

  log('Downloading ConceptNet 5.7 (this will take a while)...');
  log(`URL: ${CONFIG.CONCEPTNET_URL}`);

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(cachePath);
    let downloadedBytes = 0;
    let lastLogTime = Date.now();

    const request = https.get(CONFIG.CONCEPTNET_URL, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          log(`Redirecting to: ${redirectUrl}`);
          file.close();
          fs.unlinkSync(cachePath);

          const protocol = redirectUrl.startsWith('https') ? https : http;
          protocol.get(redirectUrl, handleResponse).on('error', reject);
          return;
        }
      }

      handleResponse(response);
    });

    function handleResponse(response: http.IncomingMessage) {
      const totalBytes = parseInt(response.headers['content-length'] || '0', 10);

      response.pipe(file);

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;

        // Log progress every 10 seconds
        const now = Date.now();
        if (now - lastLogTime > 10000) {
          const percent = totalBytes > 0 ? ((downloadedBytes / totalBytes) * 100).toFixed(1) : '?';
          log(`Downloaded ${formatBytes(downloadedBytes)} (${percent}%)`);
          lastLogTime = now;
        }
      });

      response.on('end', () => {
        file.close();
        log(`Download complete: ${formatBytes(downloadedBytes)}`);
        resolve(cachePath);
      });
    }

    request.on('error', (err) => {
      fs.unlink(cachePath, () => {});
      reject(err);
    });
  });
}

// =============================================================================
// CONCEPTNET PROCESSOR
// =============================================================================

async function processConceptNet(inputPath: string): Promise<Map<string, ConceptNode>> {
  log('Processing ConceptNet assertions...');

  const conceptGraph = new Map<string, ConceptNode>();
  let processedLines = 0;
  let keptEdges = 0;
  let skippedLines = 0;
  let lastLogTime = Date.now();

  return new Promise((resolve, reject) => {
    // Create read stream with gzip decompression
    const fileStream = fs.createReadStream(inputPath);
    const gunzip = zlib.createGunzip();
    const rl = readline.createInterface({
      input: fileStream.pipe(gunzip),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      processedLines++;

      // Log progress every 30 seconds
      const now = Date.now();
      if (now - lastLogTime > 30000) {
        log(`Processed ${formatNumber(processedLines)} lines, kept ${formatNumber(keptEdges)} edges, ${formatNumber(conceptGraph.size)} concepts`);
        lastLogTime = now;
      }

      try {
        // Parse TSV line: URI, relation, start, end, metadata
        const parts = line.split('\t');
        if (parts.length < 5) {
          skippedLines++;
          return;
        }

        const [, relationUri, startUri, endUri, metadataJson] = parts;

        // Filter by relation type
        if (!CONFIG.KEEP_RELATIONS.has(relationUri)) {
          skippedLines++;
          return;
        }

        // Extract concepts (English only)
        const startConcept = extractConcept(startUri);
        const endConcept = extractConcept(endUri);

        if (!startConcept || !endConcept) {
          skippedLines++;
          return;
        }

        // Skip self-loops
        if (startConcept === endConcept) {
          skippedLines++;
          return;
        }

        // Parse weight from metadata
        let weight = 1.0;
        try {
          const metadata = JSON.parse(metadataJson);
          weight = metadata.weight || 1.0;
        } catch {
          // Use default weight
        }

        // Skip low-weight edges
        if (weight < CONFIG.MIN_WEIGHT) {
          skippedLines++;
          return;
        }

        // Get or create concept node
        if (!conceptGraph.has(startConcept)) {
          conceptGraph.set(startConcept, {
            concept: startConcept,
            edges: [],
            tags: assignTypeTags(startConcept),
          });
        }

        const node = conceptGraph.get(startConcept)!;

        // Add edge (if not at max)
        if (node.edges.length < CONFIG.MAX_EXPANSIONS_PER_CONCEPT) {
          const relation = extractRelation(relationUri);
          node.edges.push({
            target: endConcept,
            weight,
            relation,
          });
          keptEdges++;
        }

        // Also add reverse edge for bidirectional relations
        if (relationUri === '/r/Synonym' || relationUri === '/r/SimilarTo' || relationUri === '/r/RelatedTo') {
          if (!conceptGraph.has(endConcept)) {
            conceptGraph.set(endConcept, {
              concept: endConcept,
              edges: [],
              tags: assignTypeTags(endConcept),
            });
          }

          const reverseNode = conceptGraph.get(endConcept)!;
          if (reverseNode.edges.length < CONFIG.MAX_EXPANSIONS_PER_CONCEPT) {
            const relation = extractRelation(relationUri);
            reverseNode.edges.push({
              target: startConcept,
              weight: weight * 0.8, // Slightly lower weight for reverse
              relation,
            });
            keptEdges++;
          }
        }

      } catch (err) {
        skippedLines++;
      }
    });

    rl.on('close', () => {
      log(`Processing complete:`);
      log(`  - Total lines: ${formatNumber(processedLines)}`);
      log(`  - Kept edges: ${formatNumber(keptEdges)}`);
      log(`  - Skipped lines: ${formatNumber(skippedLines)}`);
      log(`  - Unique concepts: ${formatNumber(conceptGraph.size)}`);
      resolve(conceptGraph);
    });

    rl.on('error', reject);
    gunzip.on('error', reject);
    fileStream.on('error', reject);
  });
}

// =============================================================================
// BUNDLE BUILDER
// =============================================================================

function buildBundle(conceptGraph: Map<string, ConceptNode>): SemanticBundle {
  log('Building semantic bundle...');

  let totalEdges = 0;
  const concepts: SemanticBundle['concepts'] = {};

  for (const [concept, node] of conceptGraph) {
    // Sort edges by weight (highest first)
    const sortedEdges = node.edges.sort((a, b) => b.weight - a.weight);

    // Compress edge format: [target, weight, relation]
    const compressedEdges: Array<[string, number, string]> = sortedEdges.map(e => [
      e.target,
      Math.round(e.weight * 100) / 100, // Round to 2 decimal places
      e.relation.charAt(0), // Compress relation to first letter (S=Synonym, R=RelatedTo, I=IsA, etc.)
    ]);

    concepts[concept] = {
      e: compressedEdges,
      t: node.tags,
    };

    totalEdges += compressedEdges.length;
  }

  const bundle: SemanticBundle = {
    version: '2.0.0',
    buildDate: new Date().toISOString().split('T')[0],
    stats: {
      totalConcepts: conceptGraph.size,
      totalEdges,
      avgEdgesPerConcept: Math.round((totalEdges / conceptGraph.size) * 10) / 10,
    },
    concepts,
  };

  log(`Bundle stats:`);
  log(`  - Concepts: ${formatNumber(bundle.stats.totalConcepts)}`);
  log(`  - Edges: ${formatNumber(bundle.stats.totalEdges)}`);
  log(`  - Avg edges/concept: ${bundle.stats.avgEdgesPerConcept}`);

  return bundle;
}

// =============================================================================
// OUTPUT WRITER
// =============================================================================

async function writeBundle(bundle: SemanticBundle): Promise<string> {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '-');
  const outputPath = path.join(CONFIG.OUTPUT_DIR, `semantic-v${date}.json.gz`);

  // Ensure output directory exists
  fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });

  log('Compressing and writing bundle...');

  // Convert to JSON and compress
  const jsonString = JSON.stringify(bundle);
  const uncompressedSize = Buffer.byteLength(jsonString, 'utf8');

  return new Promise((resolve, reject) => {
    const gzip = zlib.createGzip({ level: 9 }); // Maximum compression
    const output = fs.createWriteStream(outputPath);

    gzip.pipe(output);
    gzip.write(jsonString);
    gzip.end();

    output.on('finish', () => {
      const stats = fs.statSync(outputPath);
      const compressedSize = stats.size;
      const compressionRatio = ((1 - compressedSize / uncompressedSize) * 100).toFixed(1);

      log(`Bundle written to: ${outputPath}`);
      log(`  - Uncompressed: ${formatBytes(uncompressedSize)}`);
      log(`  - Compressed: ${formatBytes(compressedSize)}`);
      log(`  - Compression ratio: ${compressionRatio}%`);

      // Check if within target size
      const targetBytes = CONFIG.TARGET_SIZE_MB * 1024 * 1024;
      if (compressedSize > targetBytes) {
        log(`  - WARNING: Bundle exceeds target size of ${CONFIG.TARGET_SIZE_MB}MB`);
      } else {
        log(`  - SUCCESS: Bundle is within ${CONFIG.TARGET_SIZE_MB}MB target`);
      }

      resolve(outputPath);
    });

    output.on('error', reject);
    gzip.on('error', reject);
  });
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const startTime = Date.now();

  console.log('');
  console.log('========================================');
  console.log('  MATCH-2A1: ConceptNet Bundle Builder');
  console.log('========================================');
  console.log('');

  try {
    // Step 1: Download ConceptNet
    const inputPath = await downloadConceptNet();

    // Step 2: Process and build graph
    const conceptGraph = await processConceptNet(inputPath);

    // Step 3: Build compressed bundle
    const bundle = buildBundle(conceptGraph);

    // Step 4: Write to output
    const outputPath = await writeBundle(bundle);

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log('');
    console.log('========================================');
    console.log('  BUILD COMPLETE');
    console.log('========================================');
    console.log(`  Output: ${outputPath}`);
    console.log(`  Time: ${elapsed} minutes`);
    console.log('');
    console.log('  Next steps:');
    console.log('  1. Verify bundle: ls -la public/semantic/');
    console.log('  2. Commit bundle to repo');
    console.log('  3. Continue with MATCH-2A2 (loader)');
    console.log('');

  } catch (err) {
    console.error('');
    console.error('BUILD FAILED:', err);
    console.error('');
    process.exit(1);
  }
}

// Run
main();

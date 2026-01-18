/**
 * ESCO Extraction Script (BIZ-2B)
 *
 * Extracts occupations, skills, and hierarchies from ESCO v1.1.1
 * Outputs intermediate format for merging.
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

interface EscoOccupation {
  id: string;
  uri: string;
  preferredLabel: string;
  altLabels: string[];
  description: string;
  iscoCode: string;
  skills: string[];
  broaderOccupations: string[]; // Parent occupation IDs
  narrowerOccupations: string[]; // Child occupation IDs
}

interface EscoSkill {
  id: string;
  uri: string;
  preferredLabel: string;
  altLabels: string[];
  description: string;
  skillType: string;
}

interface EscoExtraction {
  version: string;
  occupations: EscoOccupation[];
  skills: EscoSkill[];
  stats: {
    totalOccupations: number;
    totalSkills: number;
    totalOccupationSkillRelations: number;
    totalHierarchyRelations: number;
    totalAltLabels: number;
  };
}

// =============================================================================
// PARSING FUNCTIONS
// =============================================================================

function parseCsv(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) return [];

  // Parse header line
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }

    rows.push(row);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseAltLabels(altLabelsStr: string): string[] {
  if (!altLabelsStr || altLabelsStr === 'n/a') return [];

  // Alt labels are separated by newlines in the CSV
  return altLabelsStr
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

function extractOccupations(csvDir: string): Map<string, EscoOccupation> {
  console.log('  📂 Parsing occupations.csv...');
  const rows = parseCsv(path.join(csvDir, 'occupations.csv'));

  const occupations = new Map<string, EscoOccupation>();

  for (const row of rows) {
    const id = row['ID'];
    const uri = row['ORIGINURI'];
    const preferredLabel = row['PREFERREDLABEL'];
    const altLabelsStr = row['ALTLABELS'];
    const description = row['DESCRIPTION'] || '';
    const iscoCode = row['ISCOGROUPCODE'] || '';

    if (id && preferredLabel) {
      occupations.set(id, {
        id,
        uri,
        preferredLabel,
        altLabels: parseAltLabels(altLabelsStr),
        description,
        iscoCode,
        skills: [],
        broaderOccupations: [],
        narrowerOccupations: [],
      });
    }
  }

  console.log(`    ✓ Found ${occupations.size} occupations`);
  return occupations;
}

function extractSkills(csvDir: string): Map<string, EscoSkill> {
  console.log('  📂 Parsing skills.csv...');
  const rows = parseCsv(path.join(csvDir, 'skills.csv'));

  const skills = new Map<string, EscoSkill>();

  for (const row of rows) {
    const id = row['ID'];
    const uri = row['ORIGINURI'];
    const preferredLabel = row['PREFERREDLABEL'];
    const altLabelsStr = row['ALTLABELS'];
    const description = row['DESCRIPTION'] || '';
    const skillType = row['SKILLTYPE'] || '';

    if (id && preferredLabel) {
      skills.set(id, {
        id,
        uri,
        preferredLabel,
        altLabels: parseAltLabels(altLabelsStr),
        description,
        skillType,
      });
    }
  }

  console.log(`    ✓ Found ${skills.size} skills`);
  return skills;
}

function addOccupationSkillRelations(
  csvDir: string,
  occupations: Map<string, EscoOccupation>,
  skills: Map<string, EscoSkill>
): number {
  console.log('  📂 Parsing occupation_skill_relations.csv...');
  const rows = parseCsv(path.join(csvDir, 'occupation_skill_relations.csv'));

  let count = 0;
  for (const row of rows) {
    const occupationId = row['OCCUPATIONID'];
    const skillId = row['SKILLID'];

    const occupation = occupations.get(occupationId);
    const skill = skills.get(skillId);

    if (occupation && skill) {
      if (!occupation.skills.includes(skill.preferredLabel)) {
        occupation.skills.push(skill.preferredLabel);
        count++;
      }
    }
  }

  console.log(`    ✓ Added ${count} occupation-skill relations`);
  return count;
}

function addOccupationHierarchy(
  csvDir: string,
  occupations: Map<string, EscoOccupation>
): number {
  console.log('  📂 Parsing occupations_hierarchy.csv...');
  const rows = parseCsv(path.join(csvDir, 'occupations_hierarchy.csv'));

  let count = 0;
  for (const row of rows) {
    const parentId = row['PARENTID'];
    const childId = row['CHILDID'];
    const childType = row['CHILDOBJECTTYPE'];

    // Only process occupation-to-occupation relationships
    if (childType !== 'occupation') continue;

    const parent = occupations.get(parentId);
    const child = occupations.get(childId);

    if (parent && child) {
      if (!child.broaderOccupations.includes(parentId)) {
        child.broaderOccupations.push(parentId);
      }
      if (!parent.narrowerOccupations.includes(childId)) {
        parent.narrowerOccupations.push(childId);
      }
      count++;
    }
  }

  console.log(`    ✓ Added ${count} hierarchy relations`);
  return count;
}

// =============================================================================
// MAIN EXTRACTION
// =============================================================================

export function extractEsco(csvDir: string): EscoExtraction {
  console.log('\n🌍 BIZ-2B: Extracting ESCO v1.1.1 Database...\n');

  // Extract occupations
  const occupations = extractOccupations(csvDir);

  // Extract skills
  const skills = extractSkills(csvDir);

  // Add occupation-skill relations
  const skillRelationCount = addOccupationSkillRelations(csvDir, occupations, skills);

  // Add occupation hierarchy
  const hierarchyCount = addOccupationHierarchy(csvDir, occupations);

  // Convert to arrays
  const occupationArray = Array.from(occupations.values());
  const skillArray = Array.from(skills.values());

  // Count alt labels
  let altLabelCount = 0;
  for (const occ of occupationArray) {
    altLabelCount += occ.altLabels.length;
  }
  for (const skill of skillArray) {
    altLabelCount += skill.altLabels.length;
  }

  const extraction: EscoExtraction = {
    version: '1.1.1',
    occupations: occupationArray,
    skills: skillArray,
    stats: {
      totalOccupations: occupationArray.length,
      totalSkills: skillArray.length,
      totalOccupationSkillRelations: skillRelationCount,
      totalHierarchyRelations: hierarchyCount,
      totalAltLabels: altLabelCount,
    },
  };

  console.log('\n  ═══════════════════════════════════════');
  console.log('  ESCO EXTRACTION SUMMARY');
  console.log('  ═══════════════════════════════════════');
  console.log(`  Occupations:             ${extraction.stats.totalOccupations}`);
  console.log(`  Skills:                  ${extraction.stats.totalSkills}`);
  console.log(`  Occupation-Skill Rels:   ${extraction.stats.totalOccupationSkillRelations}`);
  console.log(`  Hierarchy Relations:     ${extraction.stats.totalHierarchyRelations}`);
  console.log(`  Alternate Labels:        ${extraction.stats.totalAltLabels}`);
  console.log('  ═══════════════════════════════════════\n');

  return extraction;
}

// Run if executed directly
// Note: Uses import.meta.url for ES module compatibility
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;

if (isMainModule) {
  const csvDir = path.join(
    process.cwd(),
    'data',
    'esco',
    'tabiya-open-dataset-main',
    'tabiya-esco-v1.1.1',
    'csv'
  );

  if (!fs.existsSync(csvDir)) {
    console.error(`❌ ESCO data not found at ${csvDir}`);
    console.error('   Download from: https://esco.ec.europa.eu/en/use-esco/download');
    process.exit(1);
  }

  const extraction = extractEsco(csvDir);

  // Write intermediate output
  const outputPath = path.join(process.cwd(), 'data', 'esco', 'extraction.json');
  fs.writeFileSync(outputPath, JSON.stringify(extraction, null, 2));
  console.log(`✓ Wrote extraction to ${outputPath}`);
}

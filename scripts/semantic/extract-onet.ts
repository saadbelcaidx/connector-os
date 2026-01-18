/**
 * O*NET Extraction Script (BIZ-2A)
 *
 * Extracts occupations, alternate titles, skills, and knowledge from O*NET 30.1
 * Outputs intermediate format for merging.
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

interface OnetOccupation {
  socCode: string;
  title: string;
  description: string;
  alternateTitles: string[];
  skills: { name: string; importance: number }[];
  knowledge: { name: string; importance: number }[];
}

interface OnetExtraction {
  version: string;
  occupations: OnetOccupation[];
  uniqueSkills: string[];
  uniqueKnowledge: string[];
  stats: {
    totalOccupations: number;
    totalAlternateTitles: number;
    totalSkillMappings: number;
    totalKnowledgeMappings: number;
  };
}

// =============================================================================
// PARSING FUNCTIONS
// =============================================================================

function parseTabDelimited(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) return [];

  const headers = lines[0].split('\t').map(h => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const row: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] || '').trim();
    }

    rows.push(row);
  }

  return rows;
}

function extractOccupations(dataDir: string): Map<string, OnetOccupation> {
  console.log('  📂 Parsing Occupation Data.txt...');
  const occupationRows = parseTabDelimited(path.join(dataDir, 'Occupation Data.txt'));

  const occupations = new Map<string, OnetOccupation>();

  for (const row of occupationRows) {
    const socCode = row['O*NET-SOC Code'];
    const title = row['Title'];
    const description = row['Description'];

    if (socCode && title) {
      occupations.set(socCode, {
        socCode,
        title,
        description: description || '',
        alternateTitles: [],
        skills: [],
        knowledge: [],
      });
    }
  }

  console.log(`    ✓ Found ${occupations.size} occupations`);
  return occupations;
}

function addAlternateTitles(dataDir: string, occupations: Map<string, OnetOccupation>): number {
  console.log('  📂 Parsing Alternate Titles.txt...');
  const titleRows = parseTabDelimited(path.join(dataDir, 'Alternate Titles.txt'));

  let count = 0;
  for (const row of titleRows) {
    const socCode = row['O*NET-SOC Code'];
    const altTitle = row['Alternate Title'];

    const occupation = occupations.get(socCode);
    if (occupation && altTitle) {
      // Avoid duplicates
      if (!occupation.alternateTitles.includes(altTitle) &&
          altTitle.toLowerCase() !== occupation.title.toLowerCase()) {
        occupation.alternateTitles.push(altTitle);
        count++;
      }
    }
  }

  console.log(`    ✓ Added ${count} alternate titles`);
  return count;
}

function addSkills(dataDir: string, occupations: Map<string, OnetOccupation>): { count: number; unique: Set<string> } {
  console.log('  📂 Parsing Skills.txt...');
  const skillRows = parseTabDelimited(path.join(dataDir, 'Skills.txt'));

  const uniqueSkills = new Set<string>();
  let count = 0;

  for (const row of skillRows) {
    const socCode = row['O*NET-SOC Code'];
    const skillName = row['Element Name'];
    const scaleId = row['Scale ID'];
    const dataValue = parseFloat(row['Data Value'] || '0');

    // Only use 'IM' (Importance) scale with value >= 3.0
    if (scaleId !== 'IM' || dataValue < 3.0) continue;

    const occupation = occupations.get(socCode);
    if (occupation && skillName) {
      // Avoid duplicates
      const existing = occupation.skills.find(s => s.name === skillName);
      if (!existing) {
        occupation.skills.push({ name: skillName, importance: dataValue });
        uniqueSkills.add(skillName);
        count++;
      }
    }
  }

  console.log(`    ✓ Added ${count} skill mappings (${uniqueSkills.size} unique skills)`);
  return { count, unique: uniqueSkills };
}

function addKnowledge(dataDir: string, occupations: Map<string, OnetOccupation>): { count: number; unique: Set<string> } {
  console.log('  📂 Parsing Knowledge.txt...');
  const knowledgeRows = parseTabDelimited(path.join(dataDir, 'Knowledge.txt'));

  const uniqueKnowledge = new Set<string>();
  let count = 0;

  for (const row of knowledgeRows) {
    const socCode = row['O*NET-SOC Code'];
    const knowledgeName = row['Element Name'];
    const scaleId = row['Scale ID'];
    const dataValue = parseFloat(row['Data Value'] || '0');

    // Only use 'IM' (Importance) scale with value >= 3.0
    if (scaleId !== 'IM' || dataValue < 3.0) continue;

    const occupation = occupations.get(socCode);
    if (occupation && knowledgeName) {
      // Avoid duplicates
      const existing = occupation.knowledge.find(k => k.name === knowledgeName);
      if (!existing) {
        occupation.knowledge.push({ name: knowledgeName, importance: dataValue });
        uniqueKnowledge.add(knowledgeName);
        count++;
      }
    }
  }

  console.log(`    ✓ Added ${count} knowledge mappings (${uniqueKnowledge.size} unique areas)`);
  return { count, unique: uniqueKnowledge };
}

// =============================================================================
// MAIN EXTRACTION
// =============================================================================

export function extractOnet(dataDir: string): OnetExtraction {
  console.log('\n📊 BIZ-2A: Extracting O*NET 30.1 Database...\n');

  // Extract occupations
  const occupations = extractOccupations(dataDir);

  // Add alternate titles
  const altTitleCount = addAlternateTitles(dataDir, occupations);

  // Add skills
  const skills = addSkills(dataDir, occupations);

  // Add knowledge
  const knowledge = addKnowledge(dataDir, occupations);

  // Convert to array
  const occupationArray = Array.from(occupations.values());

  const extraction: OnetExtraction = {
    version: '30.1',
    occupations: occupationArray,
    uniqueSkills: Array.from(skills.unique).sort(),
    uniqueKnowledge: Array.from(knowledge.unique).sort(),
    stats: {
      totalOccupations: occupationArray.length,
      totalAlternateTitles: altTitleCount,
      totalSkillMappings: skills.count,
      totalKnowledgeMappings: knowledge.count,
    },
  };

  console.log('\n  ═══════════════════════════════════════');
  console.log('  O*NET EXTRACTION SUMMARY');
  console.log('  ═══════════════════════════════════════');
  console.log(`  Occupations:        ${extraction.stats.totalOccupations}`);
  console.log(`  Alternate Titles:   ${extraction.stats.totalAlternateTitles}`);
  console.log(`  Skill Mappings:     ${extraction.stats.totalSkillMappings}`);
  console.log(`  Knowledge Mappings: ${extraction.stats.totalKnowledgeMappings}`);
  console.log(`  Unique Skills:      ${extraction.uniqueSkills.length}`);
  console.log(`  Unique Knowledge:   ${extraction.uniqueKnowledge.length}`);
  console.log('  ═══════════════════════════════════════\n');

  return extraction;
}

// Run if executed directly
// Note: Uses import.meta.url for ES module compatibility
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;

if (isMainModule) {
  const dataDir = path.join(process.cwd(), 'data', 'onet', 'db_30_1_text');

  if (!fs.existsSync(dataDir)) {
    console.error(`❌ O*NET data not found at ${dataDir}`);
    console.error('   Download from: https://www.onetcenter.org/database.html');
    process.exit(1);
  }

  const extraction = extractOnet(dataDir);

  // Write intermediate output
  const outputPath = path.join(process.cwd(), 'data', 'onet', 'extraction.json');
  fs.writeFileSync(outputPath, JSON.stringify(extraction, null, 2));
  console.log(`✓ Wrote extraction to ${outputPath}`);
}

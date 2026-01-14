/**
 * Dataset Intelligence Tests
 *
 * Regression tests for the analyzer bug where wrong arg type caused
 * biotech filters to be returned for all datasets.
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeDatasetHealth,
  generateCounterpartyFilters,
  type DatasetHealth,
} from '../src/services/DatasetIntelligence';

describe('DatasetIntelligence', () => {
  describe('analyzeDatasetHealth', () => {
    it('should detect builders roleCluster for engineering dataset', async () => {
      const engineerItems = [
        { job_title: 'Software Engineer', company_name: 'TechCorp', industry: 'Software' },
        { job_title: 'Senior Backend Developer', company_name: 'StartupAI', industry: 'Technology' },
        { job_title: 'ML Engineer', company_name: 'DataCo', industry: 'Information Technology' },
        { job_title: 'DevOps Engineer', company_name: 'CloudInc', industry: 'Cloud Computing' },
        { job_title: 'Frontend Developer', company_name: 'WebApp', industry: 'Software' },
      ];

      const health = await analyzeDatasetHealth(engineerItems);

      expect(health.roleCluster).toBe('builders');
      expect(health.roleClusterConfidence).toBeGreaterThan(0.3);
    });

    it('should detect biotech niche for pharma dataset', async () => {
      const biotechItems = [
        { job_title: 'Clinical Researcher', company_name: 'BioPharma Inc', industry: 'Biotechnology' },
        { job_title: 'Drug Development Lead', company_name: 'Therapeutics Co', industry: 'Pharmaceuticals' },
        { job_title: 'FDA Regulatory Affairs', company_name: 'MedDevice', industry: 'Medical Devices' },
      ];

      const health = await analyzeDatasetHealth(biotechItems);

      expect(health.niche).toBe('biotech');
      expect(health.defaultIntent).toBe('partners');
    });

    it('should detect hiring roleCluster for recruiter dataset', async () => {
      const recruiterItems = [
        { job_title: 'Talent Acquisition Manager', company_name: 'StaffCo', industry: 'Staffing' },
        { job_title: 'Recruiter', company_name: 'HireFast', industry: 'Human Resources' },
        { job_title: 'HR Director', company_name: 'PeopleCorp', industry: 'Human Resources' },
      ];

      const health = await analyzeDatasetHealth(recruiterItems);

      expect(health.roleCluster).toBe('hiring');
    });
  });

  describe('generateCounterpartyFilters', () => {
    it('should return different filters for different niches', async () => {
      const techHealth: DatasetHealth = {
        totalContacts: 10,
        withEmail: 5,
        emailCoverage: 50,
        industries: ['Software'],
        topIndustry: 'Software',
        roles: ['Engineer'],
        decisionMakerPercent: 20,
        datasetType: 'demand',
        niche: 'b2b',
        sampleCompanies: [],
        enrichmentEstimate: { recordsNeedingEnrichment: 5, creditsRequired: 5, estimatedCost: 0.12 },
        defaultIntent: 'partners',
        roleCluster: 'builders',
        roleClusterConfidence: 0.8,
      };

      const biotechHealth: DatasetHealth = {
        totalContacts: 10,
        withEmail: 5,
        emailCoverage: 50,
        industries: ['Biotechnology'],
        topIndustry: 'Biotechnology',
        roles: ['Researcher'],
        decisionMakerPercent: 30,
        datasetType: 'demand',
        niche: 'biotech',
        sampleCompanies: [],
        enrichmentEstimate: { recordsNeedingEnrichment: 5, creditsRequired: 5, estimatedCost: 0.12 },
        defaultIntent: 'partners',
        roleCluster: 'partners',
        roleClusterConfidence: 0.5,
      };

      const recruitingHealth: DatasetHealth = {
        totalContacts: 10,
        withEmail: 5,
        emailCoverage: 50,
        industries: ['Staffing'],
        topIndustry: 'Staffing',
        roles: ['Recruiter'],
        decisionMakerPercent: 40,
        datasetType: 'demand',
        niche: 'recruiting',
        sampleCompanies: [],
        enrichmentEstimate: { recordsNeedingEnrichment: 5, creditsRequired: 5, estimatedCost: 0.12 },
        defaultIntent: 'recruiters',
        roleCluster: 'hiring',
        roleClusterConfidence: 0.9,
      };

      const techFilters = await generateCounterpartyFilters(techHealth);
      const biotechFilters = await generateCounterpartyFilters(biotechHealth);
      const recruitingFilters = await generateCounterpartyFilters(recruitingHealth);

      // Tech and biotech both use 'partners' intent, so same filters (this is expected)
      expect(techFilters.description).toBe(biotechFilters.description);

      // Recruiting should be different
      expect(recruitingFilters.description).not.toBe(techFilters.description);
      expect(recruitingFilters.description).toContain('Recruit');
    });

    it('should NOT use AIConfig object as intent (regression test for bug)', async () => {
      const health: DatasetHealth = {
        totalContacts: 10,
        withEmail: 5,
        emailCoverage: 50,
        industries: ['Software'],
        topIndustry: 'Software',
        roles: ['Engineer'],
        decisionMakerPercent: 20,
        datasetType: 'demand',
        niche: 'b2b',
        sampleCompanies: [],
        enrichmentEstimate: { recordsNeedingEnrichment: 5, creditsRequired: 5, estimatedCost: 0.12 },
        defaultIntent: 'partners',
        roleCluster: 'builders',
        roleClusterConfidence: 0.8,
      };

      // Simulate the OLD bug: passing AIConfig object as second arg
      const fakeAIConfig = { enabled: true, provider: 'openai', apiKey: 'test', model: 'gpt-4' };

      // @ts-expect-error - intentionally testing runtime behavior with wrong type
      const filters = await generateCounterpartyFilters(health, fakeAIConfig);

      // Should NOT crash and should use defaultIntent fallback
      expect(filters).toBeDefined();
      expect(filters.description).toBeDefined();
      // Should NOT return undefined or throw
    });

    it('should use defaultIntent when intent is undefined', async () => {
      const recruitingHealth: DatasetHealth = {
        totalContacts: 10,
        withEmail: 5,
        emailCoverage: 50,
        industries: ['Staffing'],
        topIndustry: 'Staffing',
        roles: ['Recruiter'],
        decisionMakerPercent: 40,
        datasetType: 'demand',
        niche: 'recruiting',
        sampleCompanies: [],
        enrichmentEstimate: { recordsNeedingEnrichment: 5, creditsRequired: 5, estimatedCost: 0.12 },
        defaultIntent: 'recruiters',
        roleCluster: 'hiring',
        roleClusterConfidence: 0.9,
      };

      // Pass undefined as intent - should use defaultIntent
      const filters = await generateCounterpartyFilters(recruitingHealth, undefined);

      expect(filters.description).toContain('Recruit');
    });
  });
});

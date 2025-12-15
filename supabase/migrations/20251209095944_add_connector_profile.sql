/*
  # Add Connector Profile to Operator Settings

  1. Changes
    - Add `connector_profile` JSONB column to `operator_settings` table
    - Stores connector profile configuration including services, industries, roles, pain points, company size, and geography
    
  2. Schema
    - `connector_profile` (JSONB, default empty object)
      - services_offered: array of strings
      - industries_served: array of strings
      - solves_for_roles: array of strings
      - pain_points_solved: array of strings
      - ideal_company_size: string (e.g., "50-200")
      - geography: array of strings
      
  3. Purpose
    - Enable match scoring between companies and connector capabilities
    - Filter and rank companies by fit score
    - Surface best-fit opportunities first
*/

ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS connector_profile JSONB DEFAULT '{}'::jsonb;
-- Market-level campaign routing: per-market demand/supply campaign IDs
-- Shape: { "biotech": { "demandCampaignId": "abc", "supplyCampaignId": "def" }, ... }
ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS market_campaigns JSONB DEFAULT '{}';

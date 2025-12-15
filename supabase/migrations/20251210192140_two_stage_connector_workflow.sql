/*
  # Two-Stage Connector Workflow

  1. Changes
    - Add `demand_status` to track demand contact status
    - Add `supply_status` to track supply contact status
    - Add `demand_sent_at` timestamp
    - Add `supply_sent_at` timestamp

  2. Purpose
    - Implement two-stage brokering workflow
    - Contact demand first, supply only after interest confirmed
    - Track status progression through workflow stages
    - Protect supply relationships with quality gate

  3. Status Values
    - demand_status: not_sent | sent | replied | interested | not_interested
    - supply_status: not_sent | sent | accepted | passed
*/

ALTER TABLE signal_history
ADD COLUMN IF NOT EXISTS demand_status TEXT DEFAULT 'not_sent';

ALTER TABLE signal_history
ADD COLUMN IF NOT EXISTS supply_status TEXT DEFAULT 'not_sent';

ALTER TABLE signal_history
ADD COLUMN IF NOT EXISTS demand_sent_at TIMESTAMPTZ;

ALTER TABLE signal_history
ADD COLUMN IF NOT EXISTS supply_sent_at TIMESTAMPTZ;

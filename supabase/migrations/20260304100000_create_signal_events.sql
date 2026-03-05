-- signal_events — Persistent event metadata for demand records.
-- One row per record_key. Monotonic upsert: pack > classified > unknown.
-- Separate from dmcb_canonicals (intent). Signals describe the event, not the canonical.

CREATE TABLE signal_events (
  record_key    TEXT PRIMARY KEY,
  signal_type   TEXT NOT NULL,          -- 'hires', 'receives_financing', etc.
  signal_group  TEXT NOT NULL,          -- 'growth', 'capital', 'product', 'deals', 'risk', 'other'
  signal_label  TEXT NOT NULL,          -- 'Hiring', 'Funding raised', etc.
  source        TEXT NOT NULL           -- 'pack' | 'classified'
                 CHECK (source IN ('pack', 'classified')),
  source_system TEXT NOT NULL           -- provenance: where the record came from
                 DEFAULT 'unknown'
                 CHECK (source_system IN ('instantly_pack', 'apify', 'manual', 'unknown')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_signal_events_group ON signal_events (signal_group);
CREATE INDEX idx_signal_events_source_system ON signal_events (source_system);

-- Monotonic upsert RPC: pack > classified > unknown.
-- Pack is never overwritten.
-- Classified CAN overwrite classified if signal_type differs (correction).
-- Same signal_type from classified = no-op (idempotent).
CREATE OR REPLACE FUNCTION upsert_signal_event(
  p_record_key TEXT,
  p_signal_type TEXT,
  p_signal_group TEXT,
  p_signal_label TEXT,
  p_source TEXT,
  p_source_system TEXT DEFAULT 'unknown'
) RETURNS void AS $$
BEGIN
  INSERT INTO signal_events (record_key, signal_type, signal_group, signal_label, source, source_system)
  VALUES (p_record_key, p_signal_type, p_signal_group, p_signal_label, p_source, p_source_system)
  ON CONFLICT (record_key) DO UPDATE SET
    signal_type = CASE
      WHEN signal_events.source = 'pack' THEN signal_events.signal_type
      WHEN p_source = 'pack' THEN p_signal_type
      WHEN signal_events.source = 'classified' AND p_source = 'classified'
        THEN CASE WHEN signal_events.signal_type = p_signal_type
                  THEN signal_events.signal_type
                  ELSE p_signal_type END
      ELSE p_signal_type
    END,
    signal_group = CASE
      WHEN signal_events.source = 'pack' THEN signal_events.signal_group
      WHEN p_source = 'pack' THEN p_signal_group
      WHEN signal_events.source = 'classified' AND p_source = 'classified'
        THEN CASE WHEN signal_events.signal_type = p_signal_type
                  THEN signal_events.signal_group
                  ELSE p_signal_group END
      ELSE p_signal_group
    END,
    signal_label = CASE
      WHEN signal_events.source = 'pack' THEN signal_events.signal_label
      WHEN p_source = 'pack' THEN p_signal_label
      WHEN signal_events.source = 'classified' AND p_source = 'classified'
        THEN CASE WHEN signal_events.signal_type = p_signal_type
                  THEN signal_events.signal_label
                  ELSE p_signal_label END
      ELSE p_signal_label
    END,
    source = CASE
      WHEN signal_events.source = 'pack' THEN signal_events.source
      WHEN p_source = 'pack' THEN p_source
      WHEN signal_events.source = 'classified' AND p_source = 'classified' THEN 'classified'
      ELSE p_source
    END,
    source_system = CASE
      WHEN signal_events.source = 'pack' THEN signal_events.source_system
      WHEN p_source = 'pack' THEN p_source_system
      ELSE signal_events.source_system
    END,
    updated_at = CASE
      WHEN signal_events.source = 'pack' THEN signal_events.updated_at
      WHEN p_source = 'pack' THEN now()
      WHEN signal_events.source = 'classified' AND p_source = 'classified'
        THEN CASE WHEN signal_events.signal_type = p_signal_type
                  THEN signal_events.updated_at
                  ELSE now() END
      ELSE now()
    END;
END;
$$ LANGUAGE plpgsql;

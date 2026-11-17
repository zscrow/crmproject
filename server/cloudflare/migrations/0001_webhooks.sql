CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL,
  part_count INTEGER NOT NULL
);

CREATE TABLE delivery_parts (
  delivery_id TEXT NOT NULL REFERENCES deliveries(id),
  part_index INTEGER NOT NULL,
  payload BLOB NOT NULL,
  PRIMARY KEY (delivery_id, part_index)
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL REFERENCES deliveries(id),
  account_id TEXT NOT NULL,
  field TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_path TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX events_received_at ON events(received_at);
CREATE INDEX events_account_field ON events(account_id, field, received_at);

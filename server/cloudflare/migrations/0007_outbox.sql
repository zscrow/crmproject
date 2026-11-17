CREATE TABLE klivo_outbox (
  workspace_id TEXT NOT NULL REFERENCES klivo_workspaces(id),
  operation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  message_json TEXT NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL,
  error_code INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, operation_id)
);
CREATE INDEX klivo_outbox_message ON klivo_outbox(message_id);
CREATE TABLE klivo_outbox_events (
  workspace_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  PRIMARY KEY(workspace_id,event_id)
);

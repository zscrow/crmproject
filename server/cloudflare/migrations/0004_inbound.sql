CREATE TABLE klivo_whatsapp_connections (
 phone_number_id TEXT PRIMARY KEY, account_id TEXT NOT NULL,
 workspace_id TEXT NOT NULL REFERENCES klivo_workspaces(id),
 sector TEXT NOT NULL DEFAULT 'Triagem', created_at INTEGER NOT NULL
);
CREATE INDEX klivo_whatsapp_workspace ON klivo_whatsapp_connections(workspace_id);
CREATE TABLE klivo_inbox_receipts (
 workspace_id TEXT NOT NULL REFERENCES klivo_workspaces(id),
 event_id TEXT NOT NULL REFERENCES events(id), contact_id INTEGER,
 projected_at TEXT NOT NULL, message_at TEXT, ignored_reason TEXT,
 PRIMARY KEY(workspace_id,event_id)
);

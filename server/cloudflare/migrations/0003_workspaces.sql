ALTER TABLE klivo_users ADD COLUMN active_workspace_id TEXT;
CREATE TABLE klivo_workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, state_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE klivo_memberships (workspace_id TEXT NOT NULL REFERENCES klivo_workspaces(id), user_id TEXT NOT NULL REFERENCES klivo_users(id), role TEXT NOT NULL CHECK(role IN ('admin','agent')), sectors_json TEXT NOT NULL DEFAULT '[]', capabilities_json TEXT NOT NULL DEFAULT '{}', joined_at INTEGER NOT NULL, PRIMARY KEY(workspace_id,user_id));
CREATE INDEX klivo_memberships_user ON klivo_memberships(user_id);
CREATE TABLE klivo_operations (workspace_id TEXT NOT NULL, operation_id TEXT NOT NULL, user_id TEXT NOT NULL, result_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(workspace_id,operation_id));
CREATE TABLE klivo_invitations (token_hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES klivo_workspaces(id), email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','agent')), sectors_json TEXT NOT NULL, created_by TEXT NOT NULL, expires_at INTEGER NOT NULL, accepted_by TEXT);

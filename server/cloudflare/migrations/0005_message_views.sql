CREATE TABLE klivo_message_views (
 workspace_id TEXT NOT NULL REFERENCES klivo_workspaces(id),
 user_id TEXT NOT NULL REFERENCES klivo_users(id),
 contact_id TEXT NOT NULL, message_id TEXT NOT NULL, viewed_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,user_id,contact_id,message_id)
);

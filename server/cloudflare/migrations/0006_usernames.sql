ALTER TABLE klivo_users ADD COLUMN username TEXT COLLATE NOCASE;
CREATE UNIQUE INDEX klivo_users_username ON klivo_users(username) WHERE username IS NOT NULL;

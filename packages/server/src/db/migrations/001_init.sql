-- Accounts ------------------------------------------------------------------
CREATE TABLE accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'moderator', 'admin')),
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
  muted_until   timestamptz,
  banned_until  timestamptz,
  ban_reason    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX accounts_username_lower ON accounts (lower(username));

-- Characters ----------------------------------------------------------------
-- Appearance and game state are JSON so new fields never require destructive
-- migrations; the server normalises them on load (see @catgen/shared).
CREATE TABLE characters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  clan        text,
  rank        text NOT NULL,
  appearance  jsonb NOT NULL,
  state       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  last_played_at timestamptz,
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX characters_name_lower ON characters (lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX characters_account ON characters (account_id) WHERE deleted_at IS NULL;
CREATE INDEX characters_clan ON characters (clan) WHERE deleted_at IS NULL;

-- Clans -----------------------------------------------------------------------
CREATE TABLE clans (
  id          text PRIMARY KEY,
  fresh_kill  jsonb NOT NULL DEFAULT '{}'::jsonb,
  herb_store  jsonb NOT NULL DEFAULT '{}'::jsonb,
  relations   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO clans (id, fresh_kill, herb_store) VALUES
  ('thunderclan', '{"mouse": 3}', '{"cobweb": 4, "marigold": 2}'),
  ('riverclan',   '{"fish": 3}',  '{"cobweb": 4, "horsetail": 2}'),
  ('windclan',    '{"rabbit": 2}','{"cobweb": 4, "dock": 2}'),
  ('shadowclan',  '{"frog": 3}',  '{"cobweb": 4, "juniper": 2}'),
  ('skyclan',     '{"thrush": 2}','{"cobweb": 4, "thyme": 2}');

CREATE TABLE clan_announcements (
  id          bigserial PRIMARY KEY,
  clan_id     text NOT NULL REFERENCES clans(id),
  author_name text NOT NULL,
  text        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clan_announcements_clan ON clan_announcements (clan_id, created_at DESC);

-- Social -----------------------------------------------------------------------
CREATE TABLE friendships (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  friend_id    uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, friend_id)
);

CREATE TABLE blocks (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  blocked_id   uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, blocked_id)
);

CREATE TABLE reports (
  id           bigserial PRIMARY KEY,
  reporter_id  uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  target_id    uuid REFERENCES characters(id) ON DELETE SET NULL,
  target_name  text NOT NULL,
  reason       text NOT NULL,
  context      jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE moderation_log (
  id            bigserial PRIMARY KEY,
  moderator_id  uuid NOT NULL REFERENCES accounts(id),
  target_id     uuid REFERENCES accounts(id),
  action        text NOT NULL,
  minutes       integer,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- World ------------------------------------------------------------------------
CREATE TABLE world_state (
  id          text PRIMARY KEY,
  world_time  bigint NOT NULL DEFAULT 0,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

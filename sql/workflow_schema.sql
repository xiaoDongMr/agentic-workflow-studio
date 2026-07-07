CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS workflow_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  current_draft_version_id UUID NULL,
  latest_published_version_id UUID NULL,
  created_by UUID NULL,
  updated_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  revision BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_workflow_projects_workspace_status
  ON workflow_projects (workspace_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_projects_name
  ON workflow_projects (workspace_id, name)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_projects(id),
  version VARCHAR(32) NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'draft',
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  graph_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  node_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ NULL,
  published_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1,
  UNIQUE (workflow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_state
  ON workflow_versions (workflow_id, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_versions_published
  ON workflow_versions (workflow_id, published_at DESC)
  WHERE state = 'published';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_workflow_projects_current_draft'
  ) THEN
    ALTER TABLE workflow_projects
      ADD CONSTRAINT fk_workflow_projects_current_draft
      FOREIGN KEY (current_draft_version_id) REFERENCES workflow_versions(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_workflow_projects_latest_published'
  ) THEN
    ALTER TABLE workflow_projects
      ADD CONSTRAINT fk_workflow_projects_latest_published
      FOREIGN KEY (latest_published_version_id) REFERENCES workflow_versions(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS workflow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  node_key VARCHAR(128) NOT NULL,
  parent_node_key VARCHAR(128) NULL,
  type VARCHAR(32) NOT NULL,
  title VARCHAR(128) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'idle',
  inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  outputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_version_id, node_key)
);

CREATE INDEX IF NOT EXISTS idx_workflow_nodes_version_type
  ON workflow_nodes (workflow_version_id, type);

CREATE INDEX IF NOT EXISTS idx_workflow_nodes_parent
  ON workflow_nodes (workflow_version_id, parent_node_key);

CREATE INDEX IF NOT EXISTS idx_workflow_nodes_config_gin
  ON workflow_nodes USING GIN (config);

CREATE TABLE IF NOT EXISTS workflow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  edge_key VARCHAR(128) NOT NULL,
  parent_node_key VARCHAR(128) NULL,
  source_node_key VARCHAR(128) NOT NULL,
  target_node_key VARCHAR(128) NOT NULL,
  source_port_id VARCHAR(128) NULL,
  target_port_id VARCHAR(128) NULL,
  condition_key VARCHAR(128) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_version_id, edge_key)
);

CREATE INDEX IF NOT EXISTS idx_workflow_edges_version_source
  ON workflow_edges (workflow_version_id, source_node_key);

CREATE INDEX IF NOT EXISTS idx_workflow_edges_version_target
  ON workflow_edges (workflow_version_id, target_node_key);

CREATE INDEX IF NOT EXISTS idx_workflow_edges_parent
  ON workflow_edges (workflow_version_id, parent_node_key);

CREATE TABLE IF NOT EXISTS workflow_sandbox_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_projects(id),
  sandbox_id VARCHAR(128) NOT NULL DEFAULT '',
  sandbox_url VARCHAR(512) NOT NULL DEFAULT '',
  image_id VARCHAR(64) NOT NULL DEFAULT '',
  code_status VARCHAR(32) NOT NULL DEFAULT 'saved',
  last_saved_code_signature VARCHAR(128) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_sandbox_sessions_workflow
  ON workflow_sandbox_sessions (workflow_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_sandbox_sessions_sandbox
  ON workflow_sandbox_sessions (sandbox_id);

CREATE TABLE IF NOT EXISTS workflow_node_code_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_projects(id),
  node_id VARCHAR(128) NOT NULL,
  code_capability VARCHAR(32) NOT NULL DEFAULT 'python',
  entry_file VARCHAR(128) NOT NULL DEFAULT 'main.py',
  latest_package_id UUID NULL,
  latest_workspace_hash VARCHAR(128) NOT NULL DEFAULT '',
  latest_saved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_node_code_workspaces_workflow
  ON workflow_node_code_workspaces (workflow_id, updated_at DESC);

ALTER TABLE workflow_node_code_workspaces
  ALTER COLUMN latest_package_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS workflow_node_code_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_projects(id),
  node_id VARCHAR(128) NOT NULL,
  workflow_version_id UUID NULL REFERENCES workflow_versions(id),
  code_capability VARCHAR(32) NOT NULL DEFAULT 'python',
  entry_file VARCHAR(128) NOT NULL DEFAULT 'main.py',
  package_uri VARCHAR(512) NOT NULL DEFAULT '',
  package_name VARCHAR(256) NOT NULL DEFAULT '',
  package_hash VARCHAR(128) NOT NULL DEFAULT '',
  workspace_hash VARCHAR(128) NOT NULL DEFAULT '',
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_count INTEGER NOT NULL DEFAULT 0,
  total_size INTEGER NOT NULL DEFAULT 0,
  source_sandbox_id VARCHAR(128) NOT NULL DEFAULT '',
  save_reason VARCHAR(32) NOT NULL DEFAULT 'workflow_save',
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_node_code_packages_node
  ON workflow_node_code_packages (workflow_id, node_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_node_code_packages_hash
  ON workflow_node_code_packages (workflow_id, node_id, workspace_hash);

CREATE INDEX IF NOT EXISTS idx_workflow_node_code_packages_version
  ON workflow_node_code_packages (workflow_version_id);

ALTER TABLE workflow_node_code_packages
  ALTER COLUMN workflow_version_id DROP NOT NULL;

ALTER TABLE workflow_node_code_packages
  DROP COLUMN IF EXISTS retained;

CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_projects(id),
  workflow_version_id UUID NULL REFERENCES workflow_versions(id),
  run_no BIGSERIAL NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  trigger_type VARCHAR(32) NOT NULL DEFAULT 'manual',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  duration_ms INTEGER NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_created
  ON workflow_runs (workflow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_version_created
  ON workflow_runs (workflow_version_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
  ON workflow_runs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  parent_step_id UUID NULL REFERENCES workflow_run_steps(id) ON DELETE CASCADE,
  node_key VARCHAR(128) NOT NULL,
  node_title VARCHAR(128) NOT NULL,
  node_type VARCHAR(32) NOT NULL,
  loop_node_key VARCHAR(128) NULL,
  iteration_index INTEGER NULL,
  step_index INTEGER NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  log TEXT NOT NULL DEFAULT '',
  error_message TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  duration_ms INTEGER NULL,
  token_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run_node
  ON workflow_run_steps (run_id, node_key);

CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_loop
  ON workflow_run_steps (run_id, loop_node_key, iteration_index);

CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_status
  ON workflow_run_steps (status, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_run_loop_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  loop_node_key VARCHAR(128) NOT NULL,
  iteration_index INTEGER NOT NULL,
  item_input JSONB NOT NULL DEFAULT '{}'::jsonb,
  item_output JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  duration_ms INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, loop_node_key, iteration_index)
);

CREATE TABLE IF NOT EXISTS workflow_run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  event_index BIGINT NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  level VARCHAR(16) NOT NULL DEFAULT 'info',
  node_key VARCHAR(128) NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace_id VARCHAR(128) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, event_index)
);

CREATE INDEX IF NOT EXISTS idx_workflow_run_events_run_created
  ON workflow_run_events (run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_workflow_run_events_type
  ON workflow_run_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(64) NOT NULL DEFAULT 'general',
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  cover JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL,
  updated_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_category
  ON workflow_templates (category, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS workflow_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  version VARCHAR(32) NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'draft',
  graph_snapshot JSONB NOT NULL,
  node_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE TABLE IF NOT EXISTS workflow_favorites (
  workflow_id UUID NOT NULL REFERENCES workflow_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workflow_id, user_id)
);

CREATE TABLE IF NOT EXISTS workflow_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_projects(id),
  workflow_version_id UUID NULL REFERENCES workflow_versions(id),
  action VARCHAR(64) NOT NULL,
  actor_id UUID NULL,
  before_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_audit_logs_workflow_created
  ON workflow_audit_logs (workflow_id, created_at DESC);

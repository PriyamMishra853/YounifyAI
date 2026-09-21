-- Tenant isolation enforced by the database, not only by the API.
--
-- Every request that touches workspace data runs inside a transaction that does
--   set local role app_user;
--   select set_config('app.workspace_id', <id>, true), set_config('app.user_id', <id>, true);
-- (see src/db/index.js → withWorkspace). As app_user, row-level security limits
-- every read and write to that one workspace. A bug in a WHERE clause cannot
-- leak another workspace's documents.
--
-- Sign-up, login and sessions run as the connection's own role; app_user cannot
-- read password hashes or session tokens at all.

create or replace function app.current_workspace_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.workspace_id', true), '')::uuid $$;

create or replace function app.current_user_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin noinherit;
  end if;
end
$$;
-- lets the API's login role (postgres locally, the pooler user on Supabase) SET ROLE app_user
grant app_user to current_user;

grant usage on schema app to app_user;
grant select, insert, update, delete on all tables in schema app to app_user;
grant usage, select on all sequences in schema app to app_user;
grant execute on function app.current_workspace_id(), app.current_user_id() to app_user;

-- identity tables: names and emails are visible to teammates, secrets are not
revoke all on app.users, app.sessions from app_user;
grant select (id, email, name, created_at) on app.users to app_user;

-- ------------------------------------------------------------------- policies

alter table app.workspaces enable row level security;
create policy workspace_self on app.workspaces to app_user
  using (id = (select app.current_workspace_id()))
  with check (id = (select app.current_workspace_id()));

alter table app.templates enable row level security;
create policy templates_read on app.templates for select to app_user
  using (workspace_id is null or workspace_id = (select app.current_workspace_id()));
create policy templates_write on app.templates for insert to app_user
  with check (workspace_id = (select app.current_workspace_id()));
create policy templates_update on app.templates for update to app_user
  using (workspace_id = (select app.current_workspace_id()))
  with check (workspace_id = (select app.current_workspace_id()));
create policy templates_delete on app.templates for delete to app_user
  using (workspace_id = (select app.current_workspace_id()));

-- the remaining tables all carry workspace_id and share one rule
do $$
declare t text;
begin
  foreach t in array array[
    'memberships', 'sources', 'source_chunks', 'jobs', 'job_inputs', 'job_stages',
    'documents', 'document_versions', 'audit_events'
  ] loop
    execute format('alter table app.%I enable row level security', t);
    execute format(
      'create policy %I on app.%I to app_user
         using (workspace_id = (select app.current_workspace_id()))
         with check (workspace_id = (select app.current_workspace_id()))',
      t || '_workspace_isolation', t);
  end loop;
end
$$;

-- the audit trail is append-only, even for the application
revoke update, delete on app.audit_events from app_user;

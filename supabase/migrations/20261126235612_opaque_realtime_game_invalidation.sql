create table public.game_sync_signal (
  id smallint primary key check (id=1),
  revision uuid not null default gen_random_uuid(),
  content_revision uuid not null default gen_random_uuid()
);
alter table public.game_sync_signal enable row level security;
revoke all on public.game_sync_signal from public, anon, authenticated;
grant select on public.game_sync_signal to anon, authenticated;
grant select, update on public.game_sync_signal to service_role;
create policy "Read opaque invalidation signal" on public.game_sync_signal for select to anon, authenticated using (id=1);
insert into public.game_sync_signal (id) values (1);
create schema if not exists game_sync_private;
revoke all on schema game_sync_private from public, anon, authenticated;
grant usage on schema game_sync_private to service_role;
create function game_sync_private.invalidate_game() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update public.game_sync_signal set revision=gen_random_uuid(),
    content_revision=case when TG_TABLE_NAME='game_content' then gen_random_uuid() else content_revision end
    where id=1;
  return null;
end;
$$;
revoke all on function game_sync_private.invalidate_game() from public, anon, authenticated;
grant execute on function game_sync_private.invalidate_game() to service_role;
create trigger game_sync_invalidate after insert or update or delete or truncate on public.game_state for each statement execute function game_sync_private.invalidate_game();
create trigger game_sync_invalidate after insert or update or delete or truncate on public.round_scores for each statement execute function game_sync_private.invalidate_game();
create trigger game_sync_invalidate after insert or update or delete or truncate on public.submissions for each statement execute function game_sync_private.invalidate_game();
create trigger game_sync_invalidate after insert or update or delete or truncate on public.round_timers for each statement execute function game_sync_private.invalidate_game();
create trigger game_sync_invalidate after insert or update or delete or truncate on public.game_content for each statement execute function game_sync_private.invalidate_game();
alter publication supabase_realtime add table public.game_sync_signal;

-- =============================================================================
-- Usernames — a unique, lowercase handle so people can be found and DM'd without
-- already sharing a space. display_name stays the free-form label; username is
-- the stable identifier.
-- =============================================================================

alter table public.profiles add column if not exists username text;

-- Case-insensitive uniqueness. Usernames are stored lowercase, but index on
-- lower() so it holds regardless.
create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

-- 3–20 chars, lowercase letters / digits / underscore. NULL allowed (checks pass
-- on NULL) so the column can exist before everyone has one.
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

-- Backfill existing users with a stable default handle (unique via the id).
update public.profiles
  set username = 'u' || substr(replace(id::text, '-', ''), 1, 10)
  where username is null;

-- New users get a default handle at signup (they can change it in settings).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_space_id uuid;
begin
  insert into public.profiles (id, username)
    values (new.id, 'u' || substr(replace(new.id::text, '-', ''), 1, 10));
  insert into public.spaces (type, name, created_by)
    values ('private', 'Private', new.id) returning id into v_space_id;
  insert into public.space_members (space_id, user_id, role)
    values (v_space_id, new.id, 'owner');
  return new;
end;
$$;

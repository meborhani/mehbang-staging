-- مهبانگ گیم: ثبت بازیکنان و هدیهٔ سکهٔ ادمین
-- این فایل با اتصال گیت‌هاب خودکار اجرا می‌شود (یا در SQL Editor دستی).
-- ایمیل ادمین در مخزن عمومی نیست: بعد از اجرا، یک بار این خط را در SQL Editor بزن:
--   insert into public.admins(email) values ('ایمیل-ادمین@example.com');
-- و همان ایمیل را در Authentication ← Users بساز.

create table if not exists public.players(
  uid text primary key,
  name text not null default '',
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create table if not exists public.grants(
  id bigserial primary key,
  uid text not null,
  amount int not null check (amount between 1 and 100000),
  note text not null default '',
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists grants_uid_idx on public.grants(uid) where claimed_at is null;

create table if not exists public.admins(email text primary key);
alter table public.admins enable row level security; -- هر کاربر فقط ردیف خودش را می‌بیند
alter table public.players enable row level security;
alter table public.grants enable row level security;

drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select to authenticated using (email = (auth.jwt()->>'email'));
drop policy if exists admin_players_sel on public.players;
drop policy if exists admin_grants_sel on public.grants;
drop policy if exists admin_grants_ins on public.grants;
create policy admin_players_sel on public.players for select to authenticated using (exists (select 1 from public.admins a where a.email = (auth.jwt()->>'email')));
create policy admin_grants_sel on public.grants for select to authenticated using (exists (select 1 from public.admins a where a.email = (auth.jwt()->>'email')));
create policy admin_grants_ins on public.grants for insert to authenticated with check (exists (select 1 from public.admins a where a.email = (auth.jwt()->>'email')));

revoke all on public.players, public.grants, public.admins from anon;
revoke insert, update, delete on public.admins from authenticated;
revoke update, delete on public.players, public.grants from authenticated;

-- بازیکن‌ها فقط از این دو تابع می‌توانند استفاده کنند؛ به جدول‌ها دسترسی مستقیم ندارند
create or replace function public.mb_register(p_uid text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_uid is null or p_uid !~ '^[A-Z0-9]{8}$' then return; end if;
  insert into players(uid,name,last_seen) values (p_uid, left(coalesce(p_name,''),12), now())
  on conflict (uid) do update set name = excluded.name, last_seen = now();
end $$;

create or replace function public.mb_claim(p_uid text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_uid is null or p_uid !~ '^[A-Z0-9]{8}$' then return 0; end if;
  with u as (update grants set claimed_at = now() where uid = p_uid and claimed_at is null returning amount)
  select coalesce(sum(amount),0) into n from u;
  return n;
end $$;

revoke all on function public.mb_register(text,text) from public;
revoke all on function public.mb_claim(text) from public;
grant execute on function public.mb_register(text,text) to anon, authenticated;
grant execute on function public.mb_claim(text) to anon, authenticated;

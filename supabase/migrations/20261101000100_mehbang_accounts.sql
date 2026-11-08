-- مهبانگ گیم: حساب کاربری (نام کاربری + رمز) با موجودی سکه روی سرور
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.accounts(
  id bigserial primary key,
  username text not null unique,
  pass_hash text not null,
  balance int not null default 50 check (balance >= 0),
  last_daily date,
  fails int not null default 0,
  lock_until timestamptz,
  earn_amt int not null default 0,
  earn_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create table if not exists public.sessions(
  token_hash text primary key,
  account_id bigint not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists sessions_acc_idx on public.sessions(account_id);
create table if not exists public.game_log(
  id bigserial primary key,
  account_id bigint not null references public.accounts(id) on delete cascade,
  game text not null,
  delta int not null,
  at timestamptz not null default now()
);
create index if not exists game_log_acc_idx on public.game_log(account_id, game);
alter table public.game_log enable row level security;
revoke all on public.game_log from anon, authenticated;
revoke all on sequence public.game_log_id_seq from anon, authenticated;
alter table public.accounts enable row level security;
alter table public.sessions enable row level security;
revoke all on public.accounts, public.sessions from anon, authenticated;
revoke all on sequence public.accounts_id_seq from anon, authenticated;

create or replace function public.mb_today() returns date language sql stable as $$ select (now() at time zone 'Asia/Tehran')::date $$;

create or replace function public.mb__session(p_token text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare a bigint;
begin
  if p_token is null or length(p_token) <> 48 then return null; end if;
  select account_id into a from sessions where token_hash = encode(digest(p_token,'sha256'),'hex');
  return a;
end $$;

create or replace function public.mb__out(p_id bigint, p_token text, p_daily boolean) returns json
language sql security definer set search_path = public as $$
  select json_build_object('token',p_token,'name',username,'bal',balance,'daily',p_daily) from accounts where id = p_id
$$;

create or replace function public.mb__daily(p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare d date; got boolean := false;
begin
  select last_daily into d from accounts where id = p_id for update;
  if d is not null and d < mb_today() then
    update accounts set balance = balance + 50, last_daily = mb_today() where id = p_id; got := true;
  elsif d is null then
    update accounts set last_daily = mb_today() where id = p_id;
  end if;
  update accounts set last_seen = now() where id = p_id;
  return got;
end $$;

create or replace function public.mb_signup(p_user text, p_pass text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare u text := lower(btrim(coalesce(p_user,''))); a bigint; t text;
begin
  if u !~ '^[a-z0-9_؀-ۿ]{3,16}$' then raise exception 'نام کاربری باید ۳ تا ۱۶ حرف (فارسی/انگلیسی/عدد/_) باشد'; end if;
  if p_pass is null or length(p_pass) < 6 or length(p_pass) > 72 then raise exception 'رمز باید حداقل ۶ نویسه باشد'; end if;
  if exists(select 1 from accounts where username = u) then raise exception 'این نام کاربری قبلاً گرفته شده'; end if;
  insert into accounts(username,pass_hash,last_daily) values (u, crypt(p_pass, gen_salt('bf')), mb_today()) returning id into a;
  t := encode(gen_random_bytes(24),'hex');
  insert into sessions(token_hash,account_id) values (encode(digest(t,'sha256'),'hex'), a);
  return mb__out(a,t,false);
end $$;

create or replace function public.mb_login(p_user text, p_pass text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare u text := lower(btrim(coalesce(p_user,''))); r accounts; t text; d boolean;
begin
  select * into r from accounts where username = u for update;
  if not found then raise exception 'نام کاربری یا رمز اشتباه است'; end if;
  if r.lock_until is not null and r.lock_until > now() then raise exception 'تلاش‌های زیاد؛ چند دقیقه بعد دوباره امتحان کن'; end if;
  if r.pass_hash <> crypt(coalesce(p_pass,''), r.pass_hash) then
    update accounts set fails = fails + 1, lock_until = case when fails + 1 >= 8 then now() + interval '5 minutes' else lock_until end,
      fails = case when fails + 1 >= 8 then 0 else fails + 1 end where id = r.id;
    raise exception 'نام کاربری یا رمز اشتباه است';
  end if;
  update accounts set fails = 0, lock_until = null where id = r.id;
  d := mb__daily(r.id);
  t := encode(gen_random_bytes(24),'hex');
  insert into sessions(token_hash,account_id) values (encode(digest(t,'sha256'),'hex'), r.id);
  return mb__out(r.id,t,d);
end $$;

create or replace function public.mb_me(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare a bigint := mb__session(p_token); d boolean;
begin
  if a is null then return null; end if;
  d := mb__daily(a);
  return mb__out(a,p_token,d);
end $$;

-- تغییر موجودی ناشی از بازی (ورودی، شرط، برد). افزایش در هر بار و در ساعت محدود است.
create or replace function public.mb_sync(p_token text, p_delta int, p_game text default null) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare a bigint := mb__session(p_token); r accounts; dl int := coalesce(p_delta,0); g text := lower(left(coalesce(p_game,''),12));
begin
  if a is null then return null; end if;
  select * into r from accounts where id = a for update;
  if r.earn_at < now() - interval '1 hour' then r.earn_amt := 0; r.earn_at := now(); end if;
  if dl > 0 then
    dl := least(dl, 3000, greatest(0, 6000 - r.earn_amt));
    r.earn_amt := r.earn_amt + dl;
  else dl := greatest(dl, -1000000);
  end if;
  dl := greatest(dl, -r.balance);
  update accounts set balance = balance + dl, earn_amt = r.earn_amt, earn_at = r.earn_at, last_seen = now() where id = a;
  if dl <> 0 and g ~ '^[a-z0-9]{2,12}$' then insert into game_log(account_id,game,delta) values (a,g,dl); end if;
  return mb__out(a,p_token,false);
end $$;

create or replace function public.mb_logout(p_token text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from sessions where token_hash = encode(digest(coalesce(p_token,''),'sha256'),'hex')
$$;

create or replace function public.mb__is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from admins a where a.email = (auth.jwt()->>'email'))
$$;

create or replace function public.mb_admin_accounts() returns table(id bigint, username text, balance int, last_seen timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not mb__is_admin() then raise exception 'forbidden'; end if;
  return query select a.id,a.username,a.balance,a.last_seen,a.created_at from accounts a order by a.last_seen desc limit 1000;
end $$;

create or replace function public.mb_admin_grant(p_account bigint, p_amount int) returns int
language plpgsql security definer set search_path = public as $$
declare nb int;
begin
  if not mb__is_admin() then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'مقدار نامعتبر'; end if;
  update accounts set balance = balance + p_amount where id = p_account returning balance into nb;
  if nb is null then raise exception 'حساب پیدا نشد'; end if;
  return nb;
end $$;

create or replace function public.mb_admin_stats() returns table(account_id bigint, game text, plays bigint, won bigint, lost bigint, net bigint, last_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not mb__is_admin() then raise exception 'forbidden'; end if;
  return query select l.account_id, l.game, count(*), coalesce(sum(l.delta) filter (where l.delta>0),0)::bigint,
    coalesce(-sum(l.delta) filter (where l.delta<0),0)::bigint, sum(l.delta)::bigint, max(l.at)
    from game_log l group by l.account_id, l.game;
end $$;

revoke all on function public.mb_today(), public.mb__session(text), public.mb__out(bigint,text,boolean), public.mb__daily(bigint), public.mb__is_admin() from public, anon, authenticated;
revoke all on function public.mb_signup(text,text), public.mb_login(text,text), public.mb_me(text), public.mb_sync(text,int,text), public.mb_logout(text), public.mb_admin_accounts(), public.mb_admin_stats(), public.mb_admin_grant(bigint,int) from public;
grant execute on function public.mb_signup(text,text), public.mb_login(text,text), public.mb_me(text), public.mb_sync(text,int,text), public.mb_logout(text) to anon, authenticated;
grant execute on function public.mb_admin_accounts(), public.mb_admin_stats(), public.mb_admin_grant(bigint,int) to authenticated;

create or replace function public.mb_admin_setpass(p_account bigint, p_pass text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not mb__is_admin() then raise exception 'forbidden'; end if;
  if p_pass is null or length(p_pass) < 6 or length(p_pass) > 72 then raise exception 'رمز باید حداقل ۶ نویسه باشد'; end if;
  update accounts set pass_hash = crypt(p_pass, gen_salt('bf')), fails = 0, lock_until = null where id = p_account;
  if not found then raise exception 'حساب پیدا نشد'; end if;
  delete from sessions where account_id = p_account;
end $$;
revoke all on function public.mb_admin_setpass(bigint,text) from public;
grant execute on function public.mb_admin_setpass(bigint,text) to authenticated;

-- پروفایل: آواتار و تغییر رمز توسط خود کاربر
alter table public.accounts add column if not exists avatar smallint not null default -1 check (avatar between -1 and 9);

create or replace function public.mb__out(p_id bigint, p_token text, p_daily boolean) returns json
language sql security definer set search_path = public as $$
  select json_build_object('token',p_token,'name',username,'bal',balance,'daily',p_daily,'av',avatar) from accounts where id = p_id
$$;

create or replace function public.mb_set_avatar(p_token text, p_av int) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare a bigint := mb__session(p_token);
begin
  if a is null then raise exception 'نشست تمام شده؛ دوباره وارد شو'; end if;
  if p_av is null or p_av < -1 or p_av > 9 then raise exception 'آواتار نامعتبر'; end if;
  update accounts set avatar = p_av where id = a;
end $$;

create or replace function public.mb_change_pass(p_token text, p_old text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare a bigint := mb__session(p_token); r accounts;
begin
  if a is null then raise exception 'نشست تمام شده؛ دوباره وارد شو'; end if;
  if p_new is null or length(p_new) < 6 or length(p_new) > 72 then raise exception 'رمز جدید باید حداقل ۶ نویسه باشد'; end if;
  select * into r from accounts where id = a for update;
  if r.lock_until is not null and r.lock_until > now() then raise exception 'تلاش‌های زیاد؛ چند دقیقه بعد دوباره امتحان کن'; end if;
  if r.pass_hash <> crypt(coalesce(p_old,''), r.pass_hash) then
    update accounts set fails = case when fails + 1 >= 8 then 0 else fails + 1 end,
      lock_until = case when fails + 1 >= 8 then now() + interval '5 minutes' else lock_until end where id = a;
    raise exception 'رمز فعلی اشتباه است';
  end if;
  update accounts set pass_hash = crypt(p_new, gen_salt('bf')), fails = 0, lock_until = null where id = a;
  delete from sessions where account_id = a and token_hash <> encode(digest(p_token,'sha256'),'hex');
end $$;

revoke all on function public.mb_set_avatar(text,int), public.mb_change_pass(text,text,text) from public;
grant execute on function public.mb_set_avatar(text,int), public.mb_change_pass(text,text,text) to anon, authenticated;

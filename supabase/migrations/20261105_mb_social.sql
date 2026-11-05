-- Mahbang: server-side profile (level/gems), game results, ranking, friends, lobby chat, notifications.
-- All access goes through SECURITY DEFINER RPCs that take the account session token (same pattern as mb_hist_*),
-- so the same SQL runs unchanged on a self-hosted Postgres + PostgREST (VPS). RLS is on, with no direct policies.
create table if not exists mb_prof(
  account bigint primary key references accounts(id) on delete cascade,
  gems int not null default 0 check (gems>=0),
  lvpaid int not null default 0
);
create table if not exists mb_games(
  id bigserial primary key,
  account bigint not null references accounts(id) on delete cascade,
  at timestamptz not null default now(),
  game text not null,
  win boolean not null,
  pts int not null,
  online boolean not null default false
);
create index if not exists mb_games_acc on mb_games(account,at desc);
create index if not exists mb_games_at on mb_games(at);
create table if not exists mb_friends(
  a bigint not null references accounts(id) on delete cascade,
  b bigint not null references accounts(id) on delete cascade,
  st text not null check (st in ('p','f')),
  at timestamptz not null default now(),
  primary key(a,b)
);
create index if not exists mb_friends_b on mb_friends(b);
create table if not exists mb_chat(
  id bigserial primary key,
  account bigint not null references accounts(id) on delete cascade,
  name text not null,
  msg text not null,
  at timestamptz not null default now()
);
create table if not exists mb_ntf(
  id bigserial primary key,
  account bigint not null references accounts(id) on delete cascade,
  msg text not null,
  at timestamptz not null default now(),
  seen boolean not null default false
);
create index if not exists mb_ntf_acc on mb_ntf(account,id desc);
alter table mb_prof enable row level security;
alter table mb_games enable row level security;
alter table mb_friends enable row level security;
alter table mb_chat enable row level security;
alter table mb_ntf enable row level security;

create or replace function mb__lv(p_xp bigint, out lv int, out into_ bigint, out need bigint)
language plpgsql immutable set search_path='public' as $$
declare acc bigint:=0; n bigint:=100; l int:=1;
begin
  while p_xp>=acc+n and l<40 loop acc:=acc+n; n:=n*2; l:=l+1; end loop;
  lv:=l; into_:=p_xp-acc; need:=n;
end $$;

create or replace function mb__friend(p_a bigint,p_b bigint) returns boolean
language sql stable set search_path='public' as $$
  select exists(select 1 from mb_friends where st='f' and ((a=p_a and b=p_b) or (a=p_b and b=p_a)))
$$;

create or replace function mb__fids(p_a bigint) returns setof bigint
language sql stable set search_path='public' as $$
  select case when a=p_a then b else a end from mb_friends where st='f' and (a=p_a or b=p_a)
$$;

create or replace function mb_hub(p_token text) returns json
language plpgsql security definer set search_path='public','extensions' as $$
declare me bigint:=mb__session(p_token); xp bigint; l record; pr mb_prof; tot int; un int; bal int;
begin
  if me is null then return null; end if;
  insert into mb_prof(account) values(me) on conflict do nothing;
  update accounts set last_seen=now() where id=me;
  select coalesce(count(*),0)*10+coalesce(count(*) filter(where win),0)*20 into xp from mb_games where account=me;
  select * into l from mb__lv(xp);
  select * into pr from mb_prof where account=me for update;
  if pr.lvpaid<l.lv-1 then
    tot:=((l.lv-1)*l.lv)/2-(pr.lvpaid*(pr.lvpaid+1))/2;
    update mb_prof set gems=gems+tot, lvpaid=l.lv-1 where account=me;
    insert into mb_ntf(account,msg) values(me,'به مرحلهٔ '||l.lv||' رسیدی و '||tot||' گوهر گرفتی 💎');
    pr.gems:=pr.gems+tot;
  end if;
  select count(*) into un from mb_ntf where account=me and not seen;
  select count(*) into tot from mb_friends fq where fq.b=me and fq.st='p';
  select balance into bal from accounts where id=me;
  return json_build_object('lv',l.lv,'xp',xp,'into',l.into_,'need',l.need,'gems',pr.gems,'unread',un,'req',tot,'bal',bal);
end $$;

create or replace function mb_game_report(p_token text,p_game text,p_win boolean,p_pts int,p_online boolean) returns boolean
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); g text:=lower(left(coalesce(p_game,''),12)); nm text; f bigint;
begin
  if a is null or g !~ '^[a-z0-9]{2,12}$' then return false; end if;
  if exists(select 1 from mb_games where account=a and at>now()-interval '15 seconds') then return false; end if;
  if (select count(*) from mb_games where account=a and at>now()-interval '1 hour')>=40 then return false; end if;
  insert into mb_games(account,game,win,pts,online) values(a,g,coalesce(p_win,false),greatest(0,least(coalesce(p_pts,0),30)),coalesce(p_online,false));
  if coalesce(p_online,false) then
    select username into nm from accounts where id=a;
    for f in select mb__fids(a) loop
      insert into mb_ntf(account,msg) values(f,nm||' در '||g||(case when p_win then ' برد 🏆' else ' بازی کرد' end));
    end loop;
  end if;
  return true;
end $$;

create or replace function mb_gem_sell(p_token text,p_n int) returns json
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); pr mb_prof; n int:=coalesce(p_n,0); bal int;
begin
  if a is null then return null; end if;
  insert into mb_prof(account) values(a) on conflict do nothing;
  select * into pr from mb_prof where account=a for update;
  if n<1 or n>1000 or pr.gems<n then return json_build_object('ok',false,'gems',pr.gems); end if;
  update mb_prof set gems=gems-n where account=a;
  update accounts set balance=balance+n*1000 where id=a returning balance into bal;
  insert into mb_ntf(account,msg) values(a,n||' گوهر به '||(n*1000)||' سکه تبدیل شد');
  return json_build_object('ok',true,'gems',pr.gems-n,'bal',bal);
end $$;

create or replace function mb_rank(p_token text,p_scope text) returns json
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); r json; sc text:=coalesce(p_scope,'all');
begin
  if a is null then return null; end if;
  with s as (
    select m.account id, ac.username n, count(*)::int g, (count(*) filter(where m.win))::int w, (sum(m.pts)+count(*) filter(where m.win)*10)::int p
    from mb_games m join accounts ac on ac.id=m.account
    where m.online
      and (sc='all' or (sc='wk' and m.at>now()-interval '7 days') or (sc='mo' and m.at>now()-interval '30 days') or (sc='fr' and m.at>now()-interval '3650 days'))
      and (sc<>'fr' or m.account=a or m.account in (select mb__fids(a)))
    group by m.account,ac.username),
  k as (select s.*, row_number() over(order by p desc,w desc,g asc,n) rk from s)
  select json_build_object('rows',coalesce((select json_agg(json_build_object('rk',rk,'n',n,'g',g,'w',w,'p',p,'me',id=a) order by rk) from (select * from k order by rk limit 50) t),'[]'::json),
                           'mine',(select json_build_object('rk',rk,'g',g,'w',w,'p',p) from k where id=a)) into r;
  return r;
end $$;

create or replace function mb_stats(p_token text) returns json
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token);
begin
  if a is null then return null; end if;
  return json_build_object(
    'me',(select json_build_object('g',count(*),'w',count(*) filter(where win),'og',count(*) filter(where online),'ow',count(*) filter(where online and win)) from mb_games where account=a),
    'by',coalesce((select json_agg(x) from (select game,count(*) g,count(*) filter(where win) w from mb_games where account=a group by game order by count(*) desc) x),'[]'::json),
    'fr',coalesce((select json_agg(x) from (select ac.username n,(ac.last_seen>now()-interval '90 seconds') o,
        (select count(*) from mb_games m where m.account=ac.id) g,(select count(*) from mb_games m where m.account=ac.id and m.win) w
        from accounts ac where ac.id in (select mb__fids(a)) order by ac.username) x),'[]'::json));
end $$;

create or replace function mb_fr_list(p_token text) returns json
language plpgsql security definer set search_path='public','extensions' as $$
declare ua bigint:=mb__session(p_token);
begin
  if ua is null then return null; end if;
  return json_build_object(
    'fr',coalesce((select json_agg(json_build_object('n',ac.username,'o',ac.last_seen>now()-interval '90 seconds') order by ac.username) from accounts ac where ac.id in (select mb__fids(ua))),'[]'::json),
    'inc',coalesce((select json_agg(ac.username) from mb_friends f join accounts ac on ac.id=f.a where f.b=ua and f.st='p'),'[]'::json),
    'out',coalesce((select json_agg(ac.username) from mb_friends f join accounts ac on ac.id=f.b where f.a=ua and f.st='p'),'[]'::json));
end $$;

create or replace function mb_fr_add(p_token text,p_user text) returns text
language plpgsql security definer set search_path='public','extensions' as $$
declare ua bigint:=mb__session(p_token); ub bigint; me text;
begin
  if ua is null then return 'auth'; end if;
  select id into ub from accounts where username=lower(btrim(coalesce(p_user,'')));
  if ub is null then return 'none'; end if;
  if ub=ua then return 'self'; end if;
  if mb__friend(ua,ub) then return 'already'; end if;
  select username into me from accounts where id=ua;
  if exists(select 1 from mb_friends f where f.a=ub and f.b=ua and f.st='p') then
    update mb_friends f set st='f' where f.a=ub and f.b=ua;
    insert into mb_ntf(account,msg) values(ub,me||' درخواست دوستی‌ات را پذیرفت');
    return 'accepted';
  end if;
  if exists(select 1 from mb_friends f where f.a=ua and f.b=ub) then return 'sent'; end if;
  if (select count(*) from mb_friends f where f.a=ua)>=200 then return 'full'; end if;
  insert into mb_friends(a,b,st) values(ua,ub,'p');
  insert into mb_ntf(account,msg) values(ub,me||' برایت درخواست دوستی فرستاد');
  return 'sent';
end $$;

create or replace function mb_fr_accept(p_token text,p_user text) returns boolean
language plpgsql security definer set search_path='public','extensions' as $$
declare ua bigint:=mb__session(p_token); ub bigint; me text; n int;
begin
  if ua is null then return false; end if;
  select id into ub from accounts where username=lower(btrim(coalesce(p_user,'')));
  if ub is null then return false; end if;
  update mb_friends f set st='f' where f.a=ub and f.b=ua and f.st='p';
  get diagnostics n=row_count;
  if n>0 then select username into me from accounts where id=ua; insert into mb_ntf(account,msg) values(ub,me||' درخواست دوستی‌ات را پذیرفت'); end if;
  return n>0;
end $$;

create or replace function mb_fr_del(p_token text,p_user text) returns boolean
language plpgsql security definer set search_path='public','extensions' as $$
declare ua bigint:=mb__session(p_token); ub bigint;
begin
  if ua is null then return false; end if;
  select id into ub from accounts where username=lower(btrim(coalesce(p_user,'')));
  if ub is null then return false; end if;
  delete from mb_friends f where (f.a=ua and f.b=ub) or (f.a=ub and f.b=ua);
  return true;
end $$;

create or replace function mb_chat_get(p_token text,p_after bigint) returns json
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token);
begin
  if a is null then return null; end if;
  update accounts set last_seen=now() where id=a and last_seen<now()-interval '20 seconds';
  return json_build_object(
    'msgs',coalesce((select json_agg(x order by x.id) from (select id,name n,msg m,(extract(epoch from at)*1000)::bigint t from mb_chat where id>coalesce(p_after,0) order by id desc limit 60) x),'[]'::json),
    'on',coalesce((select json_agg(json_build_object('n',username,'f',mb__friend(a,id))) from (select id,username from accounts where last_seen>now()-interval '90 seconds' order by last_seen desc limit 60) o),'[]'::json));
end $$;

create or replace function mb_chat_say(p_token text,p_msg text) returns boolean
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); m text:=btrim(coalesce(p_msg,'')); nm text;
begin
  if a is null or length(m)<1 then return false; end if;
  m:=left(m,200);
  if exists(select 1 from mb_chat where account=a and at>now()-interval '2 seconds') then return false; end if;
  select username into nm from accounts where id=a;
  insert into mb_chat(account,name,msg) values(a,nm,m);
  delete from mb_chat where id<(select coalesce(max(id),0)-300 from mb_chat);
  return true;
end $$;

create or replace function mb_ntf_get(p_token text,p_mark boolean) returns json
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); r json;
begin
  if a is null then return null; end if;
  select coalesce(json_agg(x),'[]'::json) into r from (select msg m,(extract(epoch from at)*1000)::bigint t,seen s from mb_ntf where account=a order by id desc limit 40) x;
  if coalesce(p_mark,false) then update mb_ntf set seen=true where account=a and not seen; end if;
  delete from mb_ntf where account=a and id<(select coalesce(max(id),0)-80 from mb_ntf where account=a);
  return r;
end $$;

revoke all on function mb__lv(bigint),mb__friend(bigint,bigint),mb__fids(bigint) from public,anon,authenticated;
grant execute on function mb_hub(text),mb_game_report(text,text,boolean,int,boolean),mb_gem_sell(text,int),mb_rank(text,text),mb_stats(text),mb_fr_list(text),mb_fr_add(text,text),mb_fr_accept(text,text),mb_fr_del(text,text),mb_chat_get(text,bigint),mb_chat_say(text,text),mb_ntf_get(text,boolean) to anon,authenticated;

-- fix: friends' win notification uses the Persian game name
create or replace function mb_game_report(p_token text,p_game text,p_win boolean,p_pts int,p_online boolean) returns boolean
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); g text:=lower(left(coalesce(p_game,''),12)); nm text; f bigint; gn text;
begin
  if a is null or g !~ '^[a-z0-9]{2,12}$' then return false; end if;
  if exists(select 1 from mb_games where account=a and at>now()-interval '15 seconds') then return false; end if;
  if (select count(*) from mb_games where account=a and at>now()-interval '1 hour')>=40 then return false; end if;
  insert into mb_games(account,game,win,pts,online) values(a,g,coalesce(p_win,false),greatest(0,least(coalesce(p_pts,0),30)),coalesce(p_online,false));
  if coalesce(p_online,false) then
    select username into nm from accounts where id=a;
    gn:=case g when 'catan' then 'سیطره کتان' when 'poker' then 'پوکر' when 'kahroba' then 'کهربا' when 'jaliz' then 'جالیز' when 'manch' then 'منچ' when 'tavla' then 'تخته نرد' when 'ttt' then 'دوز' when 'c4' then 'چهار در ردیف' when 'chess' then 'شطرنج' else g end;
    for f in select mb__fids(a) loop
      insert into mb_ntf(account,msg) values(f,nm||' در '||gn||(case when p_win then ' برد 🏆' else ' بازی کرد' end));
    end loop;
  end if;
  return true;
end $$;
grant execute on function mb_game_report(text,text,boolean,int,boolean) to anon,authenticated;

-- friends' game history (self or friends only)
create or replace function mb_games_of(p_token text,p_user text) returns json
language plpgsql security definer set search_path='public','extensions' as $$
declare me bigint:=mb__session(p_token); ub bigint; nm text; av smallint; avi text;
begin
  if me is null then return null; end if;
  select id,username,avatar,avatar_img into ub,nm,av,avi from accounts where username=lower(btrim(coalesce(p_user,'')));
  if ub is null then return json_build_object('ok',false); end if;
  if ub<>me and not mb__friend(me,ub) then return json_build_object('ok',false); end if;
  return json_build_object('ok',true,'n',nm,'av',av,'avi',avi,
    'rows',coalesce((select json_agg(x) from (select (extract(epoch from at)*1000)::bigint t,game g,win w,pts p,online o from mb_games where account=ub order by id desc limit 40) x),'[]'::json));
end $$;
grant execute on function mb_games_of(text,text) to anon,authenticated;

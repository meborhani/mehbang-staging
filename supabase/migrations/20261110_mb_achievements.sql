-- Mahbang: separate offline/online leveling + 100 offline + 100 online achievements + avatar
-- level-frames + player profile page. Built on top of the existing mb_games log (account,game,win,
-- pts,online) -- no changes to how games report results (mb_game_report), we just read the log.

alter table mb_prof add column if not exists frame_seen int not null default 0;

create table if not exists mb_achv_def(
  code text primary key,
  mode text not null check (mode in ('offline','online')),
  metric text not null,
  game text,
  threshold int not null,
  title text not null,
  descr text not null
);
create table if not exists mb_achv_earned(
  account bigint not null references accounts(id) on delete cascade,
  code text not null references mb_achv_def(code) on delete cascade,
  at timestamptz not null default now(),
  primary key(account,code)
);
create index if not exists mb_achv_earned_acc on mb_achv_earned(account);

-- xp -> level curve (shared shape for both tracks, each track's xp is counted separately)
create or replace function mb__lvl(p_xp int) returns int
language sql immutable as $$ select greatest(1, floor(sqrt(greatest(p_xp,0)/50.0))::int + 1) $$;

create or replace function mb__xp(p_account bigint, p_online boolean) returns int
language sql stable set search_path='public' as $$
  select coalesce(sum((case when win then 20 else 5 end)+pts),0)::int from mb_games where account=p_account and online=p_online
$$;

-- one jsonb bag of every metric value an achievement definition might reference, for one account+mode
create or replace function mb__metrics(p_account bigint, p_online boolean) returns jsonb
language plpgsql stable set search_path='public' as $$
declare m jsonb:='{}'::jsonb; r record; xp int; lvl int; streak int; days int; best int; tot_p int; tot_w int; ag int; age_days int;
begin
  for r in select game, count(*) played, count(*) filter(where win) won from mb_games where account=p_account and online=p_online group by game loop
    m:=m||jsonb_build_object('played|'||r.game, r.played)||jsonb_build_object('won|'||r.game, r.won);
  end loop;
  select count(*),count(*) filter(where win) into tot_p,tot_w from mb_games where account=p_account and online=p_online;
  xp:=mb__xp(p_account,p_online); lvl:=mb__lvl(xp);
  select coalesce(max(cnt),0) into streak from (
    select count(*) cnt from (
      select win, row_number() over(order by at) - row_number() over(partition by win order by at) grp
      from mb_games where account=p_account and online=p_online
    ) g where win group by grp
  ) s;
  select count(distinct date(at)) into days from mb_games where account=p_account and online=p_online;
  select coalesce(max(pts),0) into best from mb_games where account=p_account and online=p_online;
  select count(distinct game) into ag from mb_games where account=p_account and online=p_online;
  select coalesce(extract(day from now()-min(at))::int,0) into age_days from mb_games where account=p_account and online=p_online;
  m:=m||jsonb_build_object('total_played|',coalesce(tot_p,0),'total_won|',coalesce(tot_w,0),'level|',lvl,'win_streak|',streak,
       'all_games|',coalesce(ag,0),'days_active|',coalesce(days,0),'best_score|',coalesce(best,0),'account_age_days|',age_days);
  return m;
end $$;

-- checks every not-yet-earned definition against current stats, grants newly met ones, notifies the
-- player and their friends, and bumps the avatar level-frame when a new ten-level tier is crossed.
create or replace function mb_achv_sync(p_account bigint) returns void
language plpgsql security definer set search_path='public','extensions' as $$
declare d record; metrics_off jsonb; metrics_on jsonb; val numeric; nm text; fr bigint; tier int; seen int;
begin
  metrics_off:=mb__metrics(p_account,false);
  metrics_on:=mb__metrics(p_account,true);
  for d in select * from mb_achv_def loop
    if exists(select 1 from mb_achv_earned where account=p_account and code=d.code) then continue; end if;
    val := (case when d.mode='offline' then metrics_off else metrics_on end) ->> (d.metric||'|'||coalesce(d.game,''));
    if val is null or val < d.threshold then continue; end if;
    insert into mb_achv_earned(account,code) values(p_account,d.code) on conflict do nothing;
    select username into nm from accounts where id=p_account;
    insert into mb_ntf(account,msg) values(p_account,'اچیومنت گرفتی: '||d.title||' 🏅');
    for fr in select mb__fids(p_account) loop
      insert into mb_ntf(account,msg) values(fr,nm||' اچیومنت «'||d.title||'» را گرفت 🏅');
    end loop;
  end loop;
  tier := (floor(greatest(mb__lvl(mb__xp(p_account,false)),mb__lvl(mb__xp(p_account,true)))/10.0)*10)::int;
  insert into mb_prof(account) values(p_account) on conflict do nothing;
  select frame_seen into seen from mb_prof where account=p_account;
  if tier>coalesce(seen,0) and tier>0 then
    update mb_prof set frame_seen=tier where account=p_account;
    insert into mb_ntf(account,msg) values(p_account,'قاب آواتار لول '||tier||' باز شد! 🎖');
  end if;
end $$;
revoke all on function mb_achv_sync(bigint) from public,anon,authenticated;

-- hook achievement sync into the existing game-report RPC (no client/game changes needed)
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
  perform mb_achv_sync(a);
  return true;
end $$;
grant execute on function mb_game_report(text,text,boolean,int,boolean) to anon,authenticated;

-- full profile page: identity, first game, per-mode level/xp/games, achievement counts, recent achievements
create or replace function mb_profile_get(p_token text, p_user text) returns json
language plpgsql security definer set search_path='public','extensions' as $$
declare me bigint:=mb__session(p_token); u bigint; r json;
begin
  if me is null then return null; end if;
  select id into u from accounts where username=lower(btrim(coalesce(p_user,'')));
  if u is null then return null; end if;
  perform mb_achv_sync(u);
  select json_build_object(
    'n', ac.username, 'av', ac.avatar, 'avi', ac.avatar_img,
    'friend', mb__friend(me,u), 'self', me=u,
    'first_at', (extract(epoch from (select min(at) from mb_games where account=u))*1000)::bigint,
    'frame', coalesce((select frame_seen from mb_prof where account=u),0),
    'off', json_build_object('xp', mb__xp(u,false), 'lvl', mb__lvl(mb__xp(u,false)),
       'played', (select count(*) from mb_games where account=u and online=false),
       'won', (select count(*) from mb_games where account=u and online=false and win),
       'achv', (select count(*) from mb_achv_earned e join mb_achv_def d on d.code=e.code where e.account=u and d.mode='offline'),
       'achv_tot', (select count(*) from mb_achv_def where mode='offline'),
       'by_game', coalesce((select json_agg(json_build_object('g',game,'p',played,'w',won) order by played desc) from (select game,count(*) played,count(*) filter(where win) won from mb_games where account=u and online=false group by game) x),'[]'::json)),
    'on', json_build_object('xp', mb__xp(u,true), 'lvl', mb__lvl(mb__xp(u,true)),
       'played', (select count(*) from mb_games where account=u and online=true),
       'won', (select count(*) from mb_games where account=u and online=true and win),
       'achv', (select count(*) from mb_achv_earned e join mb_achv_def d on d.code=e.code where e.account=u and d.mode='online'),
       'achv_tot', (select count(*) from mb_achv_def where mode='online'),
       'by_game', coalesce((select json_agg(json_build_object('g',game,'p',played,'w',won) order by played desc) from (select game,count(*) played,count(*) filter(where win) won from mb_games where account=u and online=true group by game) x),'[]'::json)),
    'recent_achv', coalesce((select json_agg(json_build_object('t',d.title,'m',d.mode,'at',(extract(epoch from e.at)*1000)::bigint) order by e.at desc) from (select * from mb_achv_earned where account=u order by at desc limit 12) e join mb_achv_def d on d.code=e.code),'[]'::json)
  ) into r
  from accounts ac where ac.id=u;
  return r;
end $$;
revoke all on function mb_profile_get(text,text) from public,anon,authenticated;
grant execute on function mb_profile_get(text,text) to anon,authenticated;

-- overall ranking by offline/online level (in addition to the existing online-points scopes)
create or replace function mb_rank(p_token text,p_scope text) returns json
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); r json; sc text:=coalesce(p_scope,'all');
begin
  if a is null then return null; end if;
  if sc in ('lvloff','lvlon') then
    declare onl boolean:=(sc='lvlon');
    begin
      with s as (
        select distinct m.account id, ac.username n, mb__xp(m.account,onl) xp, mb__lvl(mb__xp(m.account,onl)) lvl,
          (select count(*) from mb_games where account=m.account and online=onl) g,
          (select count(*) from mb_games where account=m.account and online=onl and win) w
        from mb_games m join accounts ac on ac.id=m.account where m.online=onl),
      k as (select s.*, row_number() over(order by xp desc,w desc,g asc,n) rk from s)
      select json_build_object('rows',coalesce((select json_agg(json_build_object('rk',rk,'n',n,'g',g,'w',w,'p',xp,'lvl',lvl,'me',id=a) order by rk) from (select * from k order by rk limit 50) t),'[]'::json),
                               'mine',(select json_build_object('rk',rk,'g',g,'w',w,'p',xp,'lvl',lvl) from k where id=a)) into r;
      return r;
    end;
  end if;
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
grant execute on function mb_rank(text,text) to anon,authenticated;

-- 100 offline + 100 online achievement definitions
insert into mb_achv_def(code,mode,metric,game,threshold,title,descr)
select mode||'_'||game||'_played_'||t, mode,'played',game,t,
       gname||': '||t||' بازی',
       gname||' را '||(case when mode='online' then 'آنلاین' else 'با رایانه' end)||' '||t||' بار بازی کن.'
from (values
  ('catan','سیطره کتان'),('hell','فرار از جهنم'),('ttt','دوز'),('c4','چهار در ردیف'),
  ('chess','شطرنج'),('tavla','تخته نرد'),('poker','پوکر'),('jaliz','جالیز'),
  ('kahroba','کهربا'),('azul','آزول'),('manch','منچ')
) as gm(game,gname)
cross join (values('offline'),('online')) as md(mode)
cross join (values (5),(20),(50)) as tt(t)
on conflict (code) do nothing;

insert into mb_achv_def(code,mode,metric,game,threshold,title,descr)
select mode||'_'||game||'_won_'||t, mode,'won',game,t,
       gname||': '||t||' برد',
       gname||' را '||(case when mode='online' then 'آنلاین' else 'با رایانه' end)||' '||t||' بار ببر.'
from (values
  ('catan','سیطره کتان'),('hell','فرار از جهنم'),('ttt','دوز'),('c4','چهار در ردیف'),
  ('chess','شطرنج'),('tavla','تخته نرد'),('poker','پوکر'),('jaliz','جالیز'),
  ('kahroba','کهربا'),('azul','آزول'),('manch','منچ')
) as gm(game,gname)
cross join (values('offline'),('online')) as md(mode)
cross join (values (5),(20)) as tt(t)
on conflict (code) do nothing;

insert into mb_achv_def(code,mode,metric,game,threshold,title,descr)
select mode||'_total_played_'||t, mode,'total_played',null,t,
  t||' بازی '||tag, 'در مجموع '||t||' بازی '||tag||' انجام بده (در هر بازی).'
from (values('offline','آفلاین'),('online','آنلاین')) as md(mode,tag)
cross join (values(10),(25),(50),(100),(250),(500),(1000)) as tt(t)
on conflict (code) do nothing;

insert into mb_achv_def(code,mode,metric,game,threshold,title,descr)
select mode||'_total_won_'||t, mode,'total_won',null,t,
  t||' برد '||tag, 'در مجموع '||t||' بازی '||tag||' را ببر.'
from (values('offline','آفلاین'),('online','آنلاین')) as md(mode,tag)
cross join (values(10),(25),(50),(100),(250),(500)) as tt(t)
on conflict (code) do nothing;

insert into mb_achv_def(code,mode,metric,game,threshold,title,descr)
select mode||'_level_'||t, mode,'level',null,t,
  'لول '||t||' ('||tag||')', 'به لول '||t||' در حالت '||tag||' برس.'
from (values('offline','آفلاین'),('online','آنلاین')) as md(mode,tag)
cross join (values(5),(10),(15),(20),(25),(30),(40),(50),(60)) as tt(t)
on conflict (code) do nothing;

insert into mb_achv_def(code,mode,metric,game,threshold,title,descr)
select mode||'_streak_'||t, mode,'win_streak',null,t,
  t||' برد پیاپی ('||tag||')', t||' بازی '||tag||' را پشت‌سرهم ببر.'
from (values('offline','آفلاین'),('online','آنلاین')) as md(mode,tag)
cross join (values(3),(5),(10),(15),(20)) as tt(t)
on conflict (code) do nothing;

insert into mb_achv_def(code,mode,metric,game,threshold,title,descr) values
('offline_all_games','offline','all_games',null,11,'همهٔ بازی‌ها (آفلاین)','همهٔ 11 بازی را دست‌کم یک‌بار آفلاین انجام بده.'),
('online_all_games','online','all_games',null,11,'همهٔ بازی‌ها (آنلاین)','همهٔ 11 بازی را دست‌کم یک‌بار آنلاین انجام بده.')
on conflict (code) do nothing;

insert into mb_achv_def(code,mode,metric,game,threshold,title,descr)
select mode||'_days_active_'||t, mode,'days_active',null,t,
  t||' روز فعالیت ('||tag||')', 'در '||t||' روز متفاوت دست‌کم یک بازی '||tag||' انجام بده.'
from (values('offline','آفلاین'),('online','آنلاین')) as md(mode,tag)
cross join (values(3),(7),(14),(30),(60),(90)) as tt(t)
on conflict (code) do nothing;

insert into mb_achv_def(code,mode,metric,game,threshold,title,descr)
select mode||'_best_score_'||t, mode,'best_score',null,t,
  'امتیاز '||t||' در یک بازی ('||tag||')', 'در یک بازی '||tag||' دست‌کم '||t||' امتیاز بگیر.'
from (values('offline','آفلاین'),('online','آنلاین')) as md(mode,tag)
cross join (values(100),(300),(500),(1000),(1500),(2000)) as tt(t)
on conflict (code) do nothing;

insert into mb_achv_def(code,mode,metric,game,threshold,title,descr)
select mode||'_vet_'||t, mode,'account_age_days',null,t,
  t||' روز قدمت ('||tag||')', t||' روز از اولین بازی '||tag||'‌ات گذشته باشد.'
from (values('offline','آفلاین'),('online','آنلاین')) as md(mode,tag)
cross join (values(7),(30),(90),(180),(365)) as tt(t)
on conflict (code) do nothing;

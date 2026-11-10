-- Server-authoritative Azul rooms.
-- Azul server rooms: state lives here; the Edge Function runs the canonical engine (az_core.mjs/
-- az_engine.mjs), replacing the previous PeerJS/browser-host authority. Same table/RPC shape as
-- mb_hell/hell_* (itself adapted from the kb/pk/cat convention): upsert (not delete+insert) in
-- az_create/az_join, a soft 'gone' flag (not a row delete) in az_leave's wait-phase branch, and
-- the existing shared jz__hist helper instead of a duplicate az__hist -- all to avoid destructive
-- SQL entirely.
create table if not exists mb_az(
  code text primary key, status text not null default 'wait', ver int not null default 0, n int not null default 4,
  host bigint not null, st jsonb, views jsonb, created timestamptz not null default now(), upd timestamptz not null default now(),
  closed timestamptz, why text);
create table if not exists mb_az_seat(
  code text not null references mb_az(code) on delete cascade, seat int not null, account bigint not null,
  name text not null default '', av int not null default -1, seen timestamptz not null default now(), gone boolean not null default false,
  primary key(code,seat), unique(code,account));
create index if not exists mb_az_status on mb_az(status);
create index if not exists mb_az_seat_acc on mb_az_seat(account);
alter table mb_az enable row level security;
alter table mb_az_seat enable row level security;

create or replace function az_abort(p_code text, p_why text) returns void language plpgsql security definer set search_path to 'public','extensions' as $$
declare r mb_az; s record; ops jsonb;
begin
  select * into r from mb_az where code=p_code for update;
  if not found or r.status<>'play' then return; end if;
  update mb_az set status='closed',closed=now(),why=p_why,upd=now(),ver=ver+1 where code=p_code;
  for s in select * from mb_az_seat where code=p_code loop
    select coalesce(jsonb_agg(name order by seat),'[]'::jsonb) into ops from mb_az_seat where code=p_code and seat<>s.seat;
    perform jz__hist(s.account, jsonb_build_object('s',s.seat,'g','آزول','r','u','n',r.n,'o',1,'ops',ops,'u','ناتمام — '||p_why));
  end loop;
end $$;

create or replace function az_expire(p_code text) returns void language plpgsql security definer set search_path to 'public','extensions' as $$
declare r mb_az;
begin
  select * into r from mb_az where code=p_code;
  if not found then return; end if;
  if r.status='play' and not exists(select 1 from mb_az_seat where code=p_code and seen>now()-interval '10 seconds') then
    perform az_abort(p_code,'خروج بازیکنان');
  elsif r.status='wait' and not exists(select 1 from mb_az_seat where code=p_code and seen>now()-interval '3 minutes') then
    update mb_az set status='closed',closed=now(),why='expired',upd=now(),ver=ver+1 where code=p_code and status='wait';
  end if;
end $$;

-- real server stop: every running game is closed as unfinished, no rewards
create or replace function az_server_reset() returns int language plpgsql security definer set search_path to 'public','extensions' as $$
declare c text; k int:=0;
begin
  for c in select code from mb_az where status='play' loop perform az_abort(c,'قطع سرور'); k:=k+1; end loop;
  update mb_az set status='closed',closed=now(),why='server',upd=now() where status='wait';
  return k;
end $$;

create or replace function az_create(p_token text, p_name text, p_av int, p_n int) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare a bigint:=mb__session(p_token); c text; i int:=0; ex text;
begin
  if a is null then return jsonb_build_object('ok',false,'why','login'); end if;
  for ex in select s.code from mb_az_seat s join mb_az r on r.code=s.code where s.account=a and r.status in ('wait','play') loop perform az_expire(ex); end loop;
  select s.code into ex from mb_az_seat s join mb_az r on r.code=s.code where s.account=a and r.status in ('wait','play') and not s.gone limit 1;
  if ex is not null then return jsonb_build_object('ok',true,'code',ex,'rejoin',true); end if;
  loop
    c:=lpad((floor(random()*100000))::int::text,5,'0'); i:=i+1;
    exit when not exists(select 1 from mb_az where code=c and status in ('wait','play')) or i>50;
  end loop;
  insert into mb_az(code,n,host) values(c,greatest(2,least(coalesce(p_n,4),4)),a)
    on conflict (code) do update set status='wait',ver=0,n=excluded.n,host=excluded.host,st=null,views=null,created=now(),upd=now(),closed=null,why=null;
  insert into mb_az_seat(code,seat,account,name,av) values(c,0,a,left(coalesce(nullif(p_name,''),'میزبان'),20),coalesce(p_av,-1))
    on conflict (code,seat) do update set account=excluded.account,name=excluded.name,av=excluded.av,seen=now(),gone=false;
  return jsonb_build_object('ok',true,'code',c,'seat',0);
end $$;

create or replace function az_join(p_token text, p_code text, p_name text, p_av int) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare a bigint:=mb__session(p_token); r mb_az; sx int; nm text:=left(coalesce(nullif(p_name,''),'مهمان'),20);
begin
  if a is null then return jsonb_build_object('ok',false,'why','login'); end if;
  if p_code is null or p_code !~ '^[0-9]{5}$' then return jsonb_build_object('ok',false,'why','کد اتاق درست نیست'); end if;
  perform az_expire(p_code);
  select * into r from mb_az where code=p_code for update;
  if not found or r.status in ('closed','done') then return jsonb_build_object('ok',false,'why','این اتاق بسته شده یا وجود ندارد'); end if;
  select seat into sx from mb_az_seat where code=p_code and account=a;
  if sx is not null then
    update mb_az_seat set seen=now(),gone=false,name=case when r.status='wait' then nm else name end,av=coalesce(p_av,av) where code=p_code and seat=sx;
    return jsonb_build_object('ok',true,'seat',sx,'rejoin',true);
  end if;
  if r.status<>'wait' then return jsonb_build_object('ok',false,'why','بازی شروع شده است'); end if;
  select min(g) into sx from generate_series(0,r.n-1) g where not exists(select 1 from mb_az_seat where code=p_code and seat=g and not gone);
  if sx is null then return jsonb_build_object('ok',false,'why','اتاق پر است'); end if;
  insert into mb_az_seat(code,seat,account,name,av) values(p_code,sx,a,nm,coalesce(p_av,-1))
    on conflict (code,seat) do update set account=excluded.account,name=excluded.name,av=excluded.av,seen=now(),gone=false;
  update mb_az set upd=now(),ver=ver+1 where code=p_code;
  return jsonb_build_object('ok',true,'seat',sx,'rejoin',false);
end $$;

create or replace function az_setn(p_token text, p_code text, p_n int) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare a bigint:=mb__session(p_token); r mb_az;
begin
  select * into r from mb_az where code=p_code for update;
  if a is null or not found or r.host<>a or r.status<>'wait' then return jsonb_build_object('ok',false); end if;
  if p_n<2 or p_n>4 or p_n<(select count(*) from mb_az_seat where code=p_code and not gone) or exists(select 1 from mb_az_seat where code=p_code and seat>=p_n and not gone) then return jsonb_build_object('ok',false); end if;
  update mb_az set n=p_n,upd=now(),ver=ver+1 where code=p_code;
  return jsonb_build_object('ok',true);
end $$;

create or replace function az_leave(p_token text, p_code text) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare a bigint:=mb__session(p_token); r mb_az;
begin
  select * into r from mb_az where code=p_code for update;
  if a is null or not found then return jsonb_build_object('ok',false); end if;
  if r.status='wait' then
    update mb_az_seat set gone=true,seen=now() where code=p_code and account=a;
    if r.host=a then update mb_az set status='closed',closed=now(),why='host',upd=now(),ver=ver+1 where code=p_code;
    else update mb_az set upd=now(),ver=ver+1 where code=p_code; end if;
  elsif r.status='play' then
    update mb_az_seat set gone=true where code=p_code and account=a;
    update mb_az set upd=now() where code=p_code;
  end if;
  return jsonb_build_object('ok',true);
end $$;

create or replace function az_poll(p_token text, p_code text, p_ver int) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare a bigint:=mb__session(p_token); r mb_az; me int; seats jsonb;
begin
  if a is null then return jsonb_build_object('ok',false,'why','login'); end if;
  perform az_expire(p_code);
  select * into r from mb_az where code=p_code;
  if not found then return jsonb_build_object('ok',false,'why','closed'); end if;
  select seat into me from mb_az_seat where code=p_code and account=a;
  if me is null then return jsonb_build_object('ok',false,'why','not seated'); end if;
  if r.status in ('wait','play') then update mb_az_seat set seen=now() where code=p_code and seat=me; end if;
  select coalesce(jsonb_agg(jsonb_build_object('seat',seat,'name',name,'av',av,'on',seen>now()-interval '6 seconds','gone',gone) order by seat),'[]'::jsonb) into seats from mb_az_seat where code=p_code;
  return jsonb_build_object('ok',true,'status',r.status,'ver',r.ver,'n',r.n,'you',me,'host',r.host=a,'seats',seats,'why',r.why,'now',(extract(epoch from clock_timestamp())*1000)::bigint,
    'view',case when r.status in ('play','done') and (p_ver is null or p_ver<>r.ver) then r.views->(me::text) else null end);
end $$;

-- ---- service only (called by the Edge Function with the service key) ----
create or replace function az_ctx(p_token text, p_code text) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare a bigint:=mb__session(p_token); r mb_az; me int; seats jsonb;
begin
  if a is null then return jsonb_build_object('ok',false,'why','login'); end if;
  perform az_expire(p_code);
  select * into r from mb_az where code=p_code;
  if not found then return jsonb_build_object('ok',false,'why','closed'); end if;
  select seat into me from mb_az_seat where code=p_code and account=a;
  if me is null then return jsonb_build_object('ok',false,'why','not seated'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('seat',seat,'account',account,'name',name,'av',av,'age',(extract(epoch from (now()-seen))*1000)::bigint,'gone',gone) order by seat),'[]'::jsonb) into seats from mb_az_seat where code=p_code;
  return jsonb_build_object('ok',true,'a',a,'seat',me,'status',r.status,'ver',r.ver,'n',r.n,'host',r.host=a,'st',r.st,'seats',seats);
end $$;

create or replace function az_save(p_code text, p_ver int, p_st jsonb, p_views jsonb, p_status text) returns boolean language plpgsql security definer set search_path to 'public','extensions' as $$
declare k int;
begin
  update mb_az set st=p_st,views=p_views,status=p_status,ver=ver+1,upd=now() where code=p_code and ver=p_ver and status in ('wait','play');
  get diagnostics k = row_count;
  return k=1;
end $$;

-- p_res: [{seat,r:'w'|'l'|'d',pts,reward:bool,rp:{..}|null}]
create or replace function az_done(p_code text, p_res jsonb) returns void language plpgsql security definer set search_path to 'public','extensions' as $$
declare r mb_az; e jsonb; s record; ops jsonb; nm text; f bigint; won boolean;
begin
  select * into r from mb_az where code=p_code for update;
  if not found or r.status not in ('play','done') then return; end if;
  if r.closed is not null then return; end if;
  update mb_az set closed=now(),why='done' where code=p_code;
  for e in select * from jsonb_array_elements(p_res) loop
    select * into s from mb_az_seat where code=p_code and seat=(e->>'seat')::int;
    if not found then continue; end if;
    select coalesce(jsonb_agg(name order by seat),'[]'::jsonb) into ops from mb_az_seat where code=p_code and seat<>s.seat;
    perform jz__hist(s.account, jsonb_build_object('s',s.seat,'g','آزول','r',e->>'r','n',r.n,'o',1,'ops',ops,'rp',e->'rp'));
    if coalesce((e->>'reward')::boolean,false) then
      won:=(e->>'r')='w';
      insert into mb_games(account,game,win,pts,online) values(s.account,'az',won,greatest(0,least(coalesce((e->>'pts')::int,0),30)),true);
      select username into nm from accounts where id=s.account;
      for f in select mb__fids(s.account) loop
        insert into mb_ntf(account,msg) values(f,nm||' در آزول'||(case when won then ' برد 🏆' else ' بازی کرد' end));
      end loop;
    end if;
  end loop;
end $$;

revoke all on function az_ctx(text,text), az_save(text,int,jsonb,jsonb,text), az_done(text,jsonb), az_abort(text,text), az_expire(text), az_server_reset() from public, anon, authenticated;
grant execute on function az_ctx(text,text), az_save(text,int,jsonb,jsonb,text), az_done(text,jsonb), az_abort(text,text), az_expire(text), az_server_reset() to service_role;
grant execute on function az_create(text,text,int,int), az_join(text,text,text,int), az_setn(text,text,int), az_leave(text,text), az_poll(text,text,int) to anon, authenticated;

-- Poker server-authoritative rooms, same shape/thresholds as mb_jz_server / mb_kb_server (expire: 16s silence -> abort).
-- Table config (end/lim/bl/buy) is fixed at room creation time; editing it after the room is created is not yet wired
-- up (see KNOWN_ISSUES.md) -- betting/winner/pot-split rules themselves are unchanged from the existing client engine.
create table if not exists mb_pk(
  code text primary key, status text not null default 'wait', ver int not null default 0, n int not null default 4,
  host bigint not null, st jsonb, views jsonb, cfg jsonb not null default '{"end":"hands","lim":10,"bl":1,"buy":100}'::jsonb,
  created timestamptz not null default now(), upd timestamptz not null default now(),
  closed timestamptz, why text);
create table if not exists mb_pk_seat(
  code text not null references mb_pk(code) on delete cascade, seat int not null, account bigint not null,
  name text not null default '', av int not null default -1, seen timestamptz not null default now(), gone boolean not null default false,
  primary key(code,seat), unique(code,account));
create index if not exists mb_pk_status on mb_pk(status);
create index if not exists mb_pk_seat_acc on mb_pk_seat(account);
alter table mb_pk enable row level security;
alter table mb_pk_seat enable row level security;

create or replace function pk_abort(p_code text, p_why text) returns void language plpgsql security definer set search_path to 'public','extensions' as $$
declare r mb_pk; s record; ops jsonb;
begin
  select * into r from mb_pk where code=p_code for update;
  if not found or r.status<>'play' then return; end if;
  update mb_pk set status='closed',closed=now(),why=p_why,upd=now(),ver=ver+1 where code=p_code;
  for s in select * from mb_pk_seat where code=p_code loop
    select coalesce(jsonb_agg(name order by seat),'[]'::jsonb) into ops from mb_pk_seat where code=p_code and seat<>s.seat;
    perform jz__hist(s.account, jsonb_build_object('s',s.seat,'g','پوکر','r','u','n',r.n,'o',1,'ops',ops,'u','ناتمام — '||p_why));
  end loop;
end $$;

create or replace function pk_expire(p_code text) returns void language plpgsql security definer set search_path to 'public','extensions' as $$
declare r mb_pk;
begin
  select * into r from mb_pk where code=p_code;
  if not found then return; end if;
  if r.status='play' and not exists(select 1 from mb_pk_seat where code=p_code and seen>now()-interval '16 seconds') then
    perform pk_abort(p_code,'خروج بازیکنان');
  elsif r.status='wait' and not exists(select 1 from mb_pk_seat where code=p_code and seen>now()-interval '3 minutes') then
    update mb_pk set status='closed',closed=now(),why='expired',upd=now(),ver=ver+1 where code=p_code and status='wait';
  end if;
end $$;

create or replace function pk_server_reset() returns int language plpgsql security definer set search_path to 'public','extensions' as $$
declare c text; k int:=0;
begin
  for c in select code from mb_pk where status='play' loop perform pk_abort(c,'قطع سرور'); k:=k+1; end loop;
  update mb_pk set status='closed',closed=now(),why='server',upd=now() where status='wait';
  return k;
end $$;

create or replace function pk_create(p_token text, p_name text, p_av int, p_n int, p_cfg jsonb) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare a bigint:=mb__session(p_token); c text; i int:=0; ex text; cfg jsonb;
begin
  if a is null then return jsonb_build_object('ok',false,'why','login'); end if;
  for ex in select s.code from mb_pk_seat s join mb_pk r on r.code=s.code where s.account=a and r.status in ('wait','play') loop perform pk_expire(ex); end loop;
  select s.code into ex from mb_pk_seat s join mb_pk r on r.code=s.code where s.account=a and r.status in ('wait','play') and not s.gone limit 1;
  if ex is not null then return jsonb_build_object('ok',true,'code',ex,'rejoin',true); end if;
  loop
    c:=lpad((floor(random()*100000))::int::text,5,'0'); i:=i+1;
    exit when not exists(select 1 from mb_pk where code=c and status in ('wait','play')) or i>50;
  end loop;
  delete from mb_pk where code=c;
  cfg:=jsonb_build_object(
    'end',case when p_cfg->>'end' in ('hands','time','vote') then p_cfg->>'end' else 'hands' end,
    'lim',greatest(1,least(1000,coalesce((p_cfg->>'lim')::int,10))),
    'bl',case when (p_cfg->>'bl')::int in (1,2,5) then (p_cfg->>'bl')::int else 1 end,
    'buy',greatest(10,least(100000,coalesce((p_cfg->>'buy')::int,100))));
  insert into mb_pk(code,n,host,cfg) values(c,greatest(2,least(coalesce(p_n,4),9)),a,cfg);
  insert into mb_pk_seat(code,seat,account,name,av) values(c,0,a,left(coalesce(nullif(p_name,''),'میزبان'),20),coalesce(p_av,-1));
  return jsonb_build_object('ok',true,'code',c,'seat',0);
end $$;

create or replace function pk_join(p_token text, p_code text, p_name text, p_av int) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare a bigint:=mb__session(p_token); r mb_pk; sx int; nm text:=left(coalesce(nullif(p_name,''),'مهمان'),20);
begin
  if a is null then return jsonb_build_object('ok',false,'why','login'); end if;
  if p_code is null or p_code !~ '^[0-9]{5}$' then return jsonb_build_object('ok',false,'why','کد اتاق درست نیست'); end if;
  perform pk_expire(p_code);
  select * into r from mb_pk where code=p_code for update;
  if not found or r.status in ('closed','done') then return jsonb_build_object('ok',false,'why','این اتاق بسته شده یا وجود ندارد'); end if;
  select seat into sx from mb_pk_seat where code=p_code and account=a;
  if sx is not null then
    update mb_pk_seat set seen=now(),gone=false,name=case when r.status='wait' then nm else name end,av=coalesce(p_av,av) where code=p_code and seat=sx;
    return jsonb_build_object('ok',true,'seat',sx,'rejoin',true);
  end if;
  if r.status<>'wait' then return jsonb_build_object('ok',false,'why','بازی شروع شده است'); end if;
  select min(g) into sx from generate_series(0,r.n-1) g where not exists(select 1 from mb_pk_seat where code=p_code and seat=g);
  if sx is null then return jsonb_build_object('ok',false,'why','اتاق پر است'); end if;
  insert into mb_pk_seat(code,seat,account,name,av) values(p_code,sx,a,nm,coalesce(p_av,-1));
  update mb_pk set upd=now(),ver=ver+1 where code=p_code;
  return jsonb_build_object('ok',true,'seat',sx,'rejoin',false);
end $$;

create or replace function pk_setn(p_token text, p_code text, p_n int) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare a bigint:=mb__session(p_token); r mb_pk;
begin
  select * into r from mb_pk where code=p_code for update;
  if a is null or not found or r.host<>a or r.status<>'wait' then return jsonb_build_object('ok',false); end if;
  if p_n<2 or p_n>9 or p_n<(select count(*) from mb_pk_seat where code=p_code) or exists(select 1 from mb_pk_seat where code=p_code and seat>=p_n) then return jsonb_build_object('ok',false); end if;
  update mb_pk set n=p_n,upd=now(),ver=ver+1 where code=p_code;
  return jsonb_build_object('ok',true);
end $$;

create or replace function pk_leave(p_token text, p_code text) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare a bigint:=mb__session(p_token); r mb_pk;
begin
  select * into r from mb_pk where code=p_code for update;
  if a is null or not found then return jsonb_build_object('ok',false); end if;
  if r.status='wait' then
    delete from mb_pk_seat where code=p_code and account=a;
    if r.host=a then update mb_pk set status='closed',closed=now(),why='host',upd=now(),ver=ver+1 where code=p_code;
    else update mb_pk set upd=now(),ver=ver+1 where code=p_code; end if;
  elsif r.status='play' then
    update mb_pk_seat set gone=true where code=p_code and account=a;
    update mb_pk set upd=now() where code=p_code;
  end if;
  return jsonb_build_object('ok',true);
end $$;

create or replace function pk_poll(p_token text, p_code text, p_ver int) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare a bigint:=mb__session(p_token); r mb_pk; me int; seats jsonb;
begin
  if a is null then return jsonb_build_object('ok',false,'why','login'); end if;
  perform pk_expire(p_code);
  select * into r from mb_pk where code=p_code;
  if not found then return jsonb_build_object('ok',false,'why','closed'); end if;
  select seat into me from mb_pk_seat where code=p_code and account=a;
  if me is null then return jsonb_build_object('ok',false,'why','not seated'); end if;
  if r.status in ('wait','play') then update mb_pk_seat set seen=now() where code=p_code and seat=me; end if;
  select coalesce(jsonb_agg(jsonb_build_object('seat',seat,'name',name,'av',av,'on',seen>now()-interval '6 seconds','gone',gone) order by seat),'[]'::jsonb) into seats from mb_pk_seat where code=p_code;
  return jsonb_build_object('ok',true,'status',r.status,'ver',r.ver,'n',r.n,'you',me,'host',r.host=a,'seats',seats,'why',r.why,'now',(extract(epoch from clock_timestamp())*1000)::bigint,
    'view',case when r.status in ('play','done') and (p_ver is null or p_ver<>r.ver) then r.views->(me::text) else null end);
end $$;

create or replace function pk_ctx(p_token text, p_code text) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare a bigint:=mb__session(p_token); r mb_pk; me int; seats jsonb;
begin
  if a is null then return jsonb_build_object('ok',false,'why','login'); end if;
  perform pk_expire(p_code);
  select * into r from mb_pk where code=p_code;
  if not found then return jsonb_build_object('ok',false,'why','closed'); end if;
  select seat into me from mb_pk_seat where code=p_code and account=a;
  if me is null then return jsonb_build_object('ok',false,'why','not seated'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('seat',seat,'account',account,'name',name,'av',av,'age',(extract(epoch from (now()-seen))*1000)::bigint,'gone',gone) order by seat),'[]'::jsonb) into seats from mb_pk_seat where code=p_code;
  return jsonb_build_object('ok',true,'a',a,'seat',me,'status',r.status,'ver',r.ver,'n',r.n,'host',r.host=a,'st',r.st,'cfg',r.cfg,'seats',seats);
end $$;

create or replace function pk_save(p_code text, p_ver int, p_st jsonb, p_views jsonb, p_status text) returns boolean language plpgsql security definer set search_path to 'public','extensions' as $$
declare k int;
begin
  update mb_pk set st=p_st,views=p_views,status=p_status,ver=ver+1,upd=now() where code=p_code and ver=p_ver and status in ('wait','play');
  get diagnostics k = row_count;
  return k=1;
end $$;

create or replace function pk_done(p_code text, p_res jsonb) returns void language plpgsql security definer set search_path to 'public','extensions' as $$
declare r mb_pk; e jsonb; s record; ops jsonb; nm text; f bigint; won boolean;
begin
  select * into r from mb_pk where code=p_code for update;
  if not found or r.status not in ('play','done') then return; end if;
  if r.closed is not null then return; end if;
  update mb_pk set closed=now(),why='done' where code=p_code;
  for e in select * from jsonb_array_elements(p_res) loop
    select * into s from mb_pk_seat where code=p_code and seat=(e->>'seat')::int;
    if not found then continue; end if;
    select coalesce(jsonb_agg(name order by seat),'[]'::jsonb) into ops from mb_pk_seat where code=p_code and seat<>s.seat;
    perform jz__hist(s.account, jsonb_build_object('s',s.seat,'g','پوکر','r',e->>'r','n',r.n,'o',1,'ops',ops,'rp',e->'rp'));
    if coalesce((e->>'reward')::boolean,false) then
      won:=(e->>'r')='w';
      insert into mb_games(account,game,win,pts,online) values(s.account,'poker',won,greatest(0,least(coalesce((e->>'pts')::int,0),30)),true);
      select username into nm from accounts where id=s.account;
      for f in select mb__fids(s.account) loop
        insert into mb_ntf(account,msg) values(f,nm||' در پوکر'||(case when won then ' برد 🏆' else ' بازی کرد' end));
      end loop;
    end if;
  end loop;
end $$;

revoke all on function pk_ctx(text,text), pk_save(text,int,jsonb,jsonb,text), pk_done(text,jsonb), pk_abort(text,text), pk_expire(text), pk_server_reset() from public, anon, authenticated;
grant execute on function pk_ctx(text,text), pk_save(text,int,jsonb,jsonb,text), pk_done(text,jsonb), pk_abort(text,text), pk_expire(text), pk_server_reset() to service_role;
grant execute on function pk_create(text,text,int,int,jsonb), pk_join(text,text,text,int), pk_setn(text,text,int), pk_leave(text,text), pk_poll(text,text,int) to anon, authenticated;

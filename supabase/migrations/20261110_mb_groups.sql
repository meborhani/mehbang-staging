-- Mahbang: player groups (leader-led parties). A leader can gather friends into a group,
-- chat with them, and start any online game for the whole group at once (the server just
-- hands back the room code; the client's existing room-join flow does the rest).
-- Same SECURITY DEFINER RPC pattern as mb_social.

create table if not exists mb_groups(
  id bigserial primary key,
  leader bigint not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  start_game text,
  start_code text,
  start_at timestamptz
);
create table if not exists mb_group_members(
  group_id bigint not null references mb_groups(id) on delete cascade,
  account bigint not null references accounts(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(group_id,account)
);
create unique index if not exists mb_group_members_acc on mb_group_members(account);
create table if not exists mb_group_chat(
  id bigserial primary key,
  group_id bigint not null references mb_groups(id) on delete cascade,
  account bigint not null references accounts(id) on delete cascade,
  name text not null,
  msg text not null,
  at timestamptz not null default now()
);
alter table mb_groups enable row level security;
alter table mb_group_members enable row level security;
alter table mb_group_chat enable row level security;

create or replace function mb__grp(p_a bigint) returns bigint
language sql stable set search_path='public' as $$
  select group_id from mb_group_members where account=p_a
$$;

create or replace function mb_grp_get(p_token text) returns json
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); gid bigint; g mb_groups;
begin
  if a is null then return null; end if;
  gid:=mb__grp(a);
  if gid is null then return null; end if;
  select * into g from mb_groups where id=gid;
  if g.id is null then delete from mb_group_members where account=a; return null; end if;
  return json_build_object(
    'gid',g.id,'leader',(select username from accounts where id=g.leader),'iamleader',g.leader=a,
    'members',coalesce((select json_agg(json_build_object('n',ac.username,'o',ac.last_seen>now()-interval '90 seconds') order by gm.joined_at) from mb_group_members gm join accounts ac on ac.id=gm.account where gm.group_id=g.id),'[]'::json),
    'start',case when g.start_at is not null then json_build_object('g',g.start_game,'c',g.start_code,'t',(extract(epoch from g.start_at)*1000)::bigint) else null end);
end $$;

create or replace function mb_grp_create(p_token text) returns json
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); gid bigint;
begin
  if a is null then return null; end if;
  gid:=mb__grp(a);
  if gid is not null then return mb_grp_get(p_token); end if;
  insert into mb_groups(leader) values(a) returning id into gid;
  insert into mb_group_members(group_id,account) values(gid,a);
  return mb_grp_get(p_token);
end $$;

create or replace function mb_grp_invite(p_token text,p_user text) returns text
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); ub bigint; gid bigint; me text; g mb_groups;
begin
  if a is null then return 'auth'; end if;
  select id into ub from accounts where username=lower(btrim(coalesce(p_user,'')));
  if ub is null then return 'none'; end if;
  if not mb__friend(a,ub) then return 'notfriend'; end if;
  gid:=mb__grp(a);
  if gid is null then
    insert into mb_groups(leader) values(a) returning id into gid;
    insert into mb_group_members(group_id,account) values(gid,a);
  end if;
  select * into g from mb_groups where id=gid;
  if g.leader<>a then return 'notleader'; end if;
  if mb__grp(ub) is not null then return 'busy'; end if;
  if (select count(*) from mb_group_members where group_id=gid)>=9 then return 'full'; end if;
  insert into mb_group_members(group_id,account) values(gid,ub);
  select username into me from accounts where id=a;
  insert into mb_ntf(account,msg) values(ub,me||' تو را به گروهش اضافه کرد');
  return 'ok';
end $$;

create or replace function mb_grp_leave(p_token text) returns boolean
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); gid bigint; g mb_groups; nxt bigint;
begin
  if a is null then return false; end if;
  gid:=mb__grp(a);
  if gid is null then return false; end if;
  select * into g from mb_groups where id=gid;
  delete from mb_group_members where group_id=gid and account=a;
  if g.leader=a then
    select account into nxt from mb_group_members where group_id=gid order by joined_at limit 1;
    if nxt is null then delete from mb_groups where id=gid;
    else update mb_groups set leader=nxt where id=gid; end if;
  end if;
  return true;
end $$;

create or replace function mb_grp_disband(p_token text) returns boolean
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); gid bigint; g mb_groups;
begin
  if a is null then return false; end if;
  gid:=mb__grp(a);
  if gid is null then return false; end if;
  select * into g from mb_groups where id=gid;
  if g.leader<>a then return false; end if;
  delete from mb_groups where id=gid;
  return true;
end $$;

create or replace function mb_grp_start(p_token text,p_game text,p_code text) returns boolean
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); gid bigint; g mb_groups;
begin
  if a is null then return false; end if;
  gid:=mb__grp(a);
  if gid is null then return false; end if;
  select * into g from mb_groups where id=gid;
  if g.leader<>a then return false; end if;
  update mb_groups set start_game=left(coalesce(p_game,''),12),start_code=left(coalesce(p_code,''),8),start_at=now() where id=gid;
  return true;
end $$;

create or replace function mb_grp_chat_get(p_token text,p_after bigint) returns json
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); gid bigint;
begin
  if a is null then return null; end if;
  gid:=mb__grp(a);
  if gid is null then return '[]'::json; end if;
  return coalesce((select json_agg(x order by x.id) from (select id,name n,msg m,(extract(epoch from at)*1000)::bigint t from mb_group_chat where group_id=gid and id>coalesce(p_after,0) order by id desc limit 60) x),'[]'::json);
end $$;

create or replace function mb_grp_say(p_token text,p_msg text) returns boolean
language plpgsql security definer set search_path='public','extensions' as $$
declare a bigint:=mb__session(p_token); gid bigint; m text:=btrim(coalesce(p_msg,'')); nm text;
begin
  if a is null or length(m)<1 then return false; end if;
  gid:=mb__grp(a);
  if gid is null then return false; end if;
  m:=left(m,200);
  if exists(select 1 from mb_group_chat where account=a and at>now()-interval '2 seconds') then return false; end if;
  select username into nm from accounts where id=a;
  insert into mb_group_chat(group_id,account,name,msg) values(gid,a,nm,m);
  delete from mb_group_chat where group_id=gid and id<(select coalesce(max(id),0)-300 from mb_group_chat where group_id=gid);
  return true;
end $$;

revoke all on function mb__grp(bigint) from public,anon,authenticated;
grant execute on function mb_grp_get(text),mb_grp_create(text),mb_grp_invite(text,text),mb_grp_leave(text),mb_grp_disband(text),mb_grp_start(text,text,text),mb_grp_chat_get(text,bigint),mb_grp_say(text,text) to anon,authenticated;

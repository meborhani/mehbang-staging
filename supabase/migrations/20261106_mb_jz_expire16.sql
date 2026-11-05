-- all players silent for more than 16 s (6 s detection + 10 s return window) -> room closed "خروج بازیکنان"
create or replace function jz_expire(p_code text) returns void language plpgsql security definer set search_path to 'public','extensions' as $$
declare r mb_jz;
begin
  select * into r from mb_jz where code=p_code;
  if not found then return; end if;
  if r.status='play' and not exists(select 1 from mb_jz_seat where code=p_code and seen>now()-interval '16 seconds') then
    perform jz_abort(p_code,'خروج بازیکنان');
  elsif r.status='wait' and not exists(select 1 from mb_jz_seat where code=p_code and seen>now()-interval '3 minutes') then
    update mb_jz set status='closed',closed=now(),why='expired',upd=now(),ver=ver+1 where code=p_code and status='wait';
  end if;
end $$;

-- profile photo (96px JPEG data URL) stored on the account
alter table public.accounts add column if not exists avatar_img text;
alter table public.accounts drop constraint if exists accounts_avatar_img_chk;
alter table public.accounts add constraint accounts_avatar_img_chk
  check (avatar_img is null or (length(avatar_img) <= 12000 and avatar_img ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'));

create or replace function public.mb__out(p_id bigint, p_token text, p_daily boolean) returns json
language sql security definer set search_path = public as $$
  select json_build_object('token',p_token,'name',username,'bal',balance,'daily',p_daily,'av',avatar,'avi',avatar_img) from accounts where id = p_id
$$;

create or replace function public.mb_set_avatar_img(p_token text, p_img text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare a bigint := mb__session(p_token);
begin
  if a is null then raise exception 'نشست تمام شده؛ دوباره وارد شو'; end if;
  if p_img is not null and p_img <> '' and (length(p_img) > 12000 or p_img !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$') then
    raise exception 'عکس نامعتبر';
  end if;
  update accounts set avatar_img = nullif(p_img,'') where id = a;
end $$;

revoke all on function public.mb_set_avatar_img(text,text) from public;
grant execute on function public.mb_set_avatar_img(text,text) to anon, authenticated;

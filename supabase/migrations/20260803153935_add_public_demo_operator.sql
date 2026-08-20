-- The public presentation workspace uses this synthetic operator for durable,
-- database-backed demo sessions. Its credential row is never used for login.
with existing_demo_operator as (
  select officer_id
  from public.officer_credentials
  where username = 'smokecheck-public-demo'
), created_demo_operator as (
  insert into public.officers (display_name, role, agency, status)
  select 'Public Demo Operator', 'admin', 'SmokeCheck public presentation', 'active'
  where not exists (select 1 from existing_demo_operator)
  returning id
), demo_operator as (
  select officer_id as id from existing_demo_operator
  union all
  select id from created_demo_operator
)
insert into public.officer_credentials (officer_id, username, password_hash)
select id, 'smokecheck-public-demo', 'not-used-public-demo-access'
from demo_operator
on conflict (officer_id) do update
set username = excluded.username,
    password_hash = excluded.password_hash,
    password_updated_at = now();

update public.officers
set display_name = 'Public Demo Operator',
    role = 'admin',
    agency = 'SmokeCheck public presentation',
    status = 'active',
    updated_at = now()
where id in (
  select officer_id
  from public.officer_credentials
  where username = 'smokecheck-public-demo'
);

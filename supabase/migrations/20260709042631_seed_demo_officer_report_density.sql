alter table public.demo_officer_reports
  add column if not exists observation_subject text;

create index if not exists demo_officer_reports_created_at_idx
  on public.demo_officer_reports(created_at desc);

create index if not exists demo_officer_reports_location_idx
  on public.demo_officer_reports using gist (location);

with clusters as (
  select * from (values
    ('orchard_313', '313 Orchard Road frontage', 1.30115::double precision, 103.83834::double precision, array[2,5,9,18,30,42,70,110,150,240,390,620,1100,1700]::int[]),
    ('somerset_exit_b', 'Somerset MRT Exit B', 1.30074::double precision, 103.83908::double precision, array[4,12,28,55,86,130,260,520,900,1500]::int[]),
    ('tang_plaza_taxi', 'Tang Plaza taxi stand', 1.30502::double precision, 103.83248::double precision, array[7,20,48,94,180,360,720,1300]::int[]),
    ('ion_sheltered_link', 'ION Orchard sheltered link', 1.30407::double precision, 103.83193::double precision, array[3,16,38,80,160,330,760]::int[]),
    ('mandarin_service', 'Mandarin Gallery service lane', 1.30212::double precision, 103.83608::double precision, array[22,60,140,310,680,1200]::int[]),
    ('marina_bayfront', 'Marina Bay promenade bayfront', 1.28395::double precision, 103.86018::double precision, array[26,120,260,500,940,1600]::int[]),
    ('city_hall_walkway', 'City Hall sheltered walkway', 1.29308::double precision, 103.85210::double precision, array[44,180,420,880,1500]::int[]),
    ('geylang_l18', 'Geylang Lorong 18 five-foot way', 1.31258::double precision, 103.88312::double precision, array[14,74,200,620,1400]::int[])
  ) as c(cluster_key, address, lat, lng, hour_offsets)
), expanded as (
  select
    cluster_key,
    address,
    lat + (((ord - 1) % 3) - 1) * 0.00008 as lat,
    lng + (((ord) % 3) - 1) * 0.00008 as lng,
    hours_ago,
    ord
  from clusters
  cross join lateral unnest(hour_offsets) with ordinality as u(hours_ago, ord)
)
insert into public.demo_officer_reports (
  idempotency_key,
  nearest_address,
  boundary_status,
  occurred_at,
  incident_type,
  observation_subject,
  notes,
  location,
  status,
  created_at,
  updated_at
)
select
  'seed-density-' || cluster_key || '-' || ord,
  address || ', Singapore',
  case when cluster_key in ('marina_bayfront', 'city_hall_walkway') then 'Boundary requires on-site signage verification' else 'Outside known designated area in demo density seed' end,
  to_char(now() - make_interval(hours => hours_ago), 'DD Mon YYYY, HH24:MI "SGT"'),
  case when ord % 9 = 0 then 'Littering near smoking area' else 'Smoking in prohibited area' end,
  'Unknown person observed',
  'Seeded mock prior report for officer density visualisation. Not real enforcement evidence.',
  extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography,
  'mock_prior',
  now() - make_interval(hours => hours_ago),
  now() - make_interval(hours => hours_ago)
from expanded
on conflict (idempotency_key) do update set
  nearest_address = excluded.nearest_address,
  boundary_status = excluded.boundary_status,
  occurred_at = excluded.occurred_at,
  incident_type = excluded.incident_type,
  notes = excluded.notes,
  location = excluded.location,
  status = excluded.status,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

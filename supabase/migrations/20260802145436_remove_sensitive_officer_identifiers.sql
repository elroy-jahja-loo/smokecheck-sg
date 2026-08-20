alter table public.demo_officer_reports
  add column if not exists observation_subject text;

update public.demo_officer_reports
set observation_subject = coalesce(observation_subject, 'Unknown person observed')
where observation_subject is null;

alter table public.demo_officer_reports
  drop column if exists offender_name,
  drop column if exists offender_nric,
  drop column if exists offender_contact;

comment on column public.demo_officer_reports.observation_subject is
  'Non-identifying observation category. Prototype must not collect NRIC/FIN, offender name, or contact details.';

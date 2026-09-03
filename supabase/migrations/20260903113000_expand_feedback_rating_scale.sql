alter table public.feedback_submissions
  drop constraint if exists feedback_submissions_rating_check;

alter table public.feedback_submissions
  add constraint feedback_submissions_rating_check check (rating between 1 and 10);

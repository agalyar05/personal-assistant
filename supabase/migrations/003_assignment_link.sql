-- Add link column for assignment hyperlinks
alter table assignments
  add column if not exists link text not null default '';

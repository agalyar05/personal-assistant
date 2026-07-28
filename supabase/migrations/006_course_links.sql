-- Optional links under each class (Canvas, syllabus, etc.)
alter table courses
  add column if not exists links jsonb not null default '[]'::jsonb;

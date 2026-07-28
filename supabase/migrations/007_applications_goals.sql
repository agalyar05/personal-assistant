-- Applications (scholarships, jobs, programs…) with optional SMS reminders
-- (Goals tables removed from product; if you already created goal_* tables
--  from an earlier draft of this migration, you can drop them safely.)

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'scholarship'
    check (kind in ('scholarship', 'job', 'internship', 'program', 'grant', 'other')),
  status text not null default 'idea'
    check (status in (
      'idea', 'researching', 'in_progress', 'submitted',
      'interview', 'accepted', 'rejected', 'withdrawn'
    )),
  url text not null default '',
  description text not null default '',
  deadline text,
  remind_at text,
  reminder_id uuid,
  notes text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists applications_deadline_idx on applications (deadline);
create index if not exists applications_status_idx on applications (status);

alter table applications enable row level security;

-- Optional cleanup if you ran the earlier goals draft:
-- drop table if exists goal_milestones;
-- drop table if exists goals;
-- drop table if exists goal_areas;

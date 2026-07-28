-- Courses + assignments (academic tracker)
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null default '',
  color text not null default '#0f766e',
  professor text not null default '',
  schedule text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete set null,
  title text not null,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'submitted', 'complete')),
  due_at timestamptz,
  assignment_type text not null default 'Homework',
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  points_earned numeric,
  points_possible numeric,
  notes text not null default '',
  sort_order int not null default 0,
  due_reminder_sent_for text,
  created_at timestamptz not null default now()
);

create index if not exists assignments_due_idx on assignments (due_at);
create index if not exists assignments_course_idx on assignments (course_id);
create index if not exists assignments_status_idx on assignments (status);

alter table courses enable row level security;
alter table assignments enable row level security;

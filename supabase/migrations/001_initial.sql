-- Personal Assistant — initial schema
create table if not exists app_settings (
  id int primary key default 1 check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into app_settings (id, payload)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

create table if not exists list_items (
  id uuid primary key default gen_random_uuid(),
  list_name text not null,
  text text not null,
  checked boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists list_items_name_idx on list_items (list_name, sort_order);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  remind_at text,
  frequency text not null default 'once',
  fire_time text,
  last_sent text,
  snoozed_until text,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists processed_messages (
  gmail_message_id text primary key,
  thread_id text not null,
  processed_at timestamptz not null default now()
);

alter table app_settings enable row level security;
alter table list_items enable row level security;
alter table reminders enable row level security;
alter table processed_messages enable row level security;

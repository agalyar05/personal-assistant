-- Todo kanban difficulty on list items
alter table list_items
  add column if not exists difficulty text not null default 'medium';

alter table list_items drop constraint if exists list_items_difficulty_check;
alter table list_items
  add constraint list_items_difficulty_check
  check (difficulty in ('easy', 'medium', 'hard'));

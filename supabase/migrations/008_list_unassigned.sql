-- Allow unassigned difficulty for .todo kanban inbox
alter table list_items drop constraint if exists list_items_difficulty_check;
alter table list_items
  add constraint list_items_difficulty_check
  check (difficulty in ('unassigned', 'easy', 'medium', 'hard'));

alter table list_items alter column difficulty set default 'unassigned';

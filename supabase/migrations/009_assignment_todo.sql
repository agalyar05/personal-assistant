-- Link Masterlist assignments to .todo list items
alter table assignments
  add column if not exists todo_item_id uuid references list_items(id) on delete set null;

create index if not exists assignments_todo_item_idx on assignments (todo_item_id);

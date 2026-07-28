-- Expand assignment progress statuses
alter table assignments drop constraint if exists assignments_status_check;
alter table assignments
  add constraint assignments_status_check
  check (
    status in (
      'not_started',
      'in_progress',
      'complete',
      'submitted',
      'n_a'
    )
  );

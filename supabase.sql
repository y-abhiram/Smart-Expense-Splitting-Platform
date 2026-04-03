create extension if not exists "pgcrypto";

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  color text default '#1e8e6e',
  owner_id uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  amount numeric(12,2) not null,
  description text not null,
  date date not null,
  payer_id uuid not null references participants(id) on delete restrict,
  split_mode text not null,
  created_at timestamptz default now()
);

create table if not exists expense_participants (
  expense_id uuid not null references expenses(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  amount numeric(12,2) not null,
  primary key (expense_id, participant_id)
);

alter table groups enable row level security;
alter table participants enable row level security;
alter table expenses enable row level security;
alter table expense_participants enable row level security;

create policy "Groups owned" on groups
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "Participants in owned groups" on participants
  for all using (
    exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid())
  );

create policy "Expenses in owned groups" on expenses
  for all using (
    exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid())
  );

create policy "Expense participants in owned groups" on expense_participants
  for all using (
    exists (
      select 1
      from expenses e
      join groups g on g.id = e.group_id
      where e.id = expense_id and g.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from expenses e
      join groups g on g.id = e.group_id
      where e.id = expense_id and g.owner_id = auth.uid()
    )
  );

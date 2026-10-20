-- Durable profiles and conversations. Creating an employee/team never starts inference.
CREATE TABLE arc_employees (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 organization_id TEXT NOT NULL REFERENCES organizations(id),model_id TEXT NOT NULL,
 profile_ciphertext TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 creation_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(id,user_id)
);
CREATE INDEX arc_employees_owner ON arc_employees(user_id,status,updated_at,id);
CREATE TABLE arc_employee_versions (
 employee_id TEXT NOT NULL REFERENCES arc_employees(id) ON DELETE CASCADE,version INTEGER NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,model_id TEXT NOT NULL,
 profile_ciphertext TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(employee_id,version)
);
CREATE TABLE arc_teams (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 organization_id TEXT NOT NULL REFERENCES organizations(id),profile_ciphertext TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),creation_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(id,user_id)
);
CREATE INDEX arc_teams_owner ON arc_teams(user_id,status,updated_at,id);
CREATE TABLE arc_team_members (
 team_id TEXT NOT NULL,employee_id TEXT NOT NULL,user_id TEXT NOT NULL,
 PRIMARY KEY(team_id,employee_id),FOREIGN KEY(team_id,user_id) REFERENCES arc_teams(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(employee_id,user_id) REFERENCES arc_employees(id,user_id) ON DELETE CASCADE
);
CREATE TABLE arc_team_rooms (
 session_id TEXT PRIMARY KEY REFERENCES arc_chat_sessions(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 organization_id TEXT NOT NULL REFERENCES organizations(id),kind TEXT NOT NULL CHECK(kind IN ('direct','team','group')),
 team_id TEXT REFERENCES arc_teams(id) ON DELETE CASCADE,name_ciphertext TEXT NOT NULL,creation_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(session_id,user_id)
);
CREATE INDEX arc_team_rooms_owner ON arc_team_rooms(user_id,updated_at,session_id);
CREATE TABLE arc_room_members (
 room_id TEXT NOT NULL,employee_id TEXT NOT NULL,user_id TEXT NOT NULL,
 PRIMARY KEY(room_id,employee_id),FOREIGN KEY(room_id,user_id) REFERENCES arc_team_rooms(session_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(employee_id,user_id) REFERENCES arc_employees(id,user_id) ON DELETE CASCADE
);
CREATE TABLE arc_room_turns (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 room_id TEXT NOT NULL REFERENCES arc_team_rooms(session_id) ON DELETE CASCADE,request_id TEXT NOT NULL,input_hash TEXT NOT NULL,
 user_message_id TEXT NOT NULL REFERENCES arc_chat_messages(id) ON DELETE CASCADE,root_budget_id TEXT REFERENCES arc_execution_budgets(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','working','completed','paused','cancelled','unknown')),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,request_id)
);
CREATE TABLE arc_room_deliveries (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 turn_id TEXT NOT NULL REFERENCES arc_room_turns(id) ON DELETE CASCADE,room_id TEXT NOT NULL REFERENCES arc_team_rooms(session_id) ON DELETE CASCADE,
 source_message_id TEXT NOT NULL REFERENCES arc_chat_messages(id) ON DELETE CASCADE,employee_id TEXT NOT NULL REFERENCES arc_employees(id) ON DELETE CASCADE,
 run_id TEXT UNIQUE REFERENCES arc_chat_runs(id) ON DELETE CASCADE,depth INTEGER NOT NULL DEFAULT 0 CHECK(depth>=0 AND depth<=8),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','claimed','completed','failed','cancelled')),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(turn_id,source_message_id,employee_id)
);
CREATE INDEX arc_room_deliveries_queue ON arc_room_deliveries(room_id,status,created_at,id);
CREATE TABLE arc_employee_runs (
 run_id TEXT PRIMARY KEY REFERENCES arc_chat_runs(id) ON DELETE CASCADE,employee_id TEXT NOT NULL,
 profile_version INTEGER NOT NULL,turn_id TEXT NOT NULL REFERENCES arc_room_turns(id) ON DELETE CASCADE,
 delivery_id TEXT NOT NULL UNIQUE REFERENCES arc_room_deliveries(id) ON DELETE CASCADE,
 FOREIGN KEY(employee_id,profile_version) REFERENCES arc_employee_versions(employee_id,version) ON DELETE CASCADE
);
CREATE TABLE arc_team_events (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 employee_id TEXT,team_id TEXT,room_id TEXT,reference_id TEXT,event_type TEXT NOT NULL,
 details_ciphertext TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE INDEX arc_team_events_owner ON arc_team_events(user_id,created_at,id);
CREATE INDEX arc_team_events_room ON arc_team_events(user_id,room_id,created_at,id);
CREATE TABLE arc_team_drafts (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 source_run_id TEXT REFERENCES arc_chat_runs(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('employee','team')),
 input_ciphertext TEXT NOT NULL,input_hash TEXT NOT NULL,created_object_id TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled')),
 expires_at TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);

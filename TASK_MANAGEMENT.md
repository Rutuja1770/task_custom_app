# Task Management Page — Technical Documentation

**App:** `task_custom_app` (Task Custom App)
**Page name:** `task-management` (route: `/app/task-management`)
**Framework:** Frappe v16
**Architecture:** Design A — role-adaptive dashboard with in-page task table
**Last updated:** 2026-10-19

---

## 1. Overview

`task-management` is a custom Frappe desk Page that renders a **role-scoped task
dashboard**. Every number on the page comes from one shared condition builder,
so **KPI values always equal the in-page task table totals**.

### Features

- Role-adaptive KPI titles (`My` / `Project` / `All`)
- 4 KPI cards: Total, Overdue, Critical, Completed
- Charts: Delay range (bar), Upcoming deadlines (bar), Priority (donut + legend)
- Lists: Delayed tasks, Upcoming deadlines
- **My Projects** section (Main Manager + Project Manager + HR): project cards
  with task counts; click a card to filter the dashboard by that project
- **In-dashboard task table** with tabs (My / Team / All), server-side
  pagination, and KPI drill-down (no route change)
- Global filters: Project, Employee, Status, Priority (role-limited options)

### File map

| File | Purpose |
|---|---|
| `.../page/task_management/task_management.json` | Page DocType definition |
| `.../page/task_management/task_management.js` | UI, events, charts, task table (client) |
| `.../page/task_management/task_management.py` | Whitelisted APIs, role scope, SQL |
| `.../page/task_management/task_management.css` | Theme, layout, table, tabs, responsive |
| `task_custom_app/public/js/task_custom.js` | Task form script (feeds custom fields) |
| `task_custom_app/public/js/project_custom.js` | Project form script (HR dropdown query) |
| `task_custom_app/patches/*.py` | Creates custom Task fields + `Project.custom_project_lead` + `Project.custom_hr_user` |
| `task_custom_app/hooks.py` | `after_migrate` patches + Task doctype JS |

---

## 2. Role model (single source of truth)

Three-level hierarchy (all users report to the top manager via
`Employee.reports_to`):

| Level | Typical user | Role | Sees |
|---|---|---|---|
| 1 | Top manager (e.g. Vikas) | Main Manager | Projects led by/HR-assigned to people in their reporting tree + tasks assigned to them |
| 2 | Leads (e.g. Parveen, Nilesh) | Project Manager | Projects they lead + all tasks under them |
| 2b | HR person | HR Manager / HR User | Projects where they are the assigned HR + all tasks under them |
| 3 | Team members | *(no special role)* | Only tasks assigned to them |

Scope is computed server-side in `get_dashboard_conditions()`
(`task_management.py`) and reused by **every** endpoint: KPIs, charts, lists,
filter options, and the task table.

| Role | `scope_label` | KPI titles | Default tab | Tabs visible | Dashboard scope | Project filter | Employee filter |
|---|---|---|---|---|---|---|---|
| **Main Manager** | `All` | "All …" | All | My, Team, All | Projects led by/HR-assigned to reporting-tree members **+** tasks assigned directly to user | Projects led by/HR-assigned to reporting-tree members | Reporting tree (direct + indirect reports) |
| **Task Manager** | `All` | "All …" | All | My, Team, All | All tasks (system/admin role) | All projects | All active employees |
| **Project Manager** | `Project` | "Project …" | Team | My, Team | Projects where user is `custom_project_lead` (all tasks under them) **+** tasks assigned directly to user | Own assigned projects only | Employees with tasks in own projects + self |
| **HR Manager / HR User** | `Project` | "Project …" | Team | My, Team | Projects where user is `custom_hr_user` (all tasks under them) **+** tasks assigned directly to user — **same behavior as Project Manager** | Own HR-assigned projects only | Employees with tasks in own projects + self |
| **Employee / Task User** | `My` | "My …" | My | My only | Own assigned tasks | Projects with own tasks | Self only |
| No Employee record | `My` | "My …" | My | My | Fail-closed → `[user]` | Own tasks only | — |

Project scope roles share one constant — `PROJECT_SCOPE_ROLES =
{"Project Manager", "HR Manager", "HR User"}` (existing roles only; no new
roles are created).

Project assignment:

- **Leads:** one Project Lead per project via `Project.custom_project_lead`
  (Link → User).
- **HR:** one HR per project via `Project.custom_hr_user` (Link → User) —
  independent of Project Lead; a project can have both.
- **Top manager:** sees the union of both, filtered to their reporting tree.

Setup requirements for the hierarchy to work:

1. **Every project must have a Project Lead or an HR** — a project with
   neither is visible to no one via project scope (only to whoever has
   tasks assigned there personally).
2. The **top manager needs an Employee record** (`user_id` set) and a valid
   `reports_to` chain (e.g. Renu → Nilesh → Vikas), otherwise their tree —
   and therefore their project scope — is empty.
3. A project-scope role (PM/HR) with no assigned projects sees only tasks
   assigned directly to them (fail-safe, never unrestricted).

UI context is delivered by `get_dashboard_context()`:

```json
{
  "user": "…",
  "scope_label": "My | Project | All",
  "can_view_all": true/false,
  "can_view_team": true/false,
  "is_project_manager": true/false,
  "employee_name": "…"
}
```

Client fallback `can_view_all_tasks()` also accepts `Main Manager`
(previously Task Manager only — fixed).

### Security layers

1. **Server (authoritative):** every query passes through
   `get_dashboard_conditions()`; optional filters can only **narrow** scope.
   `tab=all` in `get_task_list_data` raises `frappe.PermissionError` for
   unauthorized users. Employee filter outside the caller's scope → `1 = 0`.
2. **Client (UI only):** hides Team/All tabs and sidebar items; re-checks on
   click. Never trusted for data.

---

## 3. Backend — `task_management.py`

### 3.1 Helpers

| Function | Role |
|---|---|
| `can_view_all()` | `True` for Main Manager \| Task Manager (tab permission only — Main Manager is still hierarchy-scoped) |
| `is_project_manager()` | `True` for any `PROJECT_SCOPE_ROLES` member (Project Manager, HR Manager, HR User) |
| `get_project_manager_projects(user)` | Project names where user is `custom_project_lead` **or** `custom_hr_user` |
| `get_hierarchy_projects(user)` | Project names led by/HR-assigned to anyone in the user's reporting tree (Main Manager scope) |
| `get_project_team_users(projects)` | Users assigned to any non-cancelled task in the projects |
| `get_task_dashboard_scope()` | `None` (unrestricted managers) or `[user]` (everyone else; PM scope is project-based) |
| `get_reporting_employee_users(user)` | BFS over Active employees' `reports_to` tree (employee filter fallback) |
| `_assignment_clause(param)` | `JSON_CONTAINS(COALESCE(NULLIF(t._assign,''),'[]'), JSON_QUOTE(%(param)s))` — exact match |
| `get_dashboard_conditions(project, employee, status, priority)` | Builds WHERE + params for all queries |

### 3.2 Condition rules

Always applied:

1. `COALESCE(t.status,'') != 'Cancelled'` — **removed** if an explicit Status
   filter is set (so `Cancelled` can be selected deliberately).
2. Scope by role:
   - Main Manager: `(t.project IN (hierarchy projects) OR _assign contains user)`.
   - Task Manager: unrestricted.
   - Project Manager / HR Manager / HR User: `(t.project IN (lead/HR projects) OR _assign contains user)`.
   - Employee: `_assign` contains user.

Optional filters (all AND-ed, all narrow-only):

| Param | SQL |
|---|---|
| `project` | `t.project = %(project)s` |
| `employee` | If outside scope → `1 = 0`; else `_assignment_clause` |
| `status` | `t.status = %(status)s` |
| `priority` | `t.custom_task_priority = %(priority)s` |

### 3.3 Whitelisted endpoints

API prefix:
`task_custom_app.task_custom_app.page.task_management.task_management.*`

| Method | Returns | Notes |
|---|---|---|
| `get_dashboard_context()` | role UI context | See §2 |
| `get_dashboard_data()` | 4 KPI counts | See §3.4 |
| `get_priority_data()` | `[{custom_task_priority, count}]` | Includes **Unassigned** row so donut sum = Total KPI |
| `get_delayed_tasks(delay_range)` | task rows | Excludes Completed/Cancelled, `custom_delayed_by > 0` |
| `get_upcoming_tasks(days)` | task rows + `days_remaining` | `days` clamped 1–365 |
| `get_deadline_chart_data(days)` | alias of `get_upcoming_tasks` | |
| `get_delay_chart_data(delay_range)` | 4 bucket counts | Buckets match SQL ranges |
| `get_project_filter_options()` | `[{value, label}]` | Main Manager → projects led by/HR-assigned to reporting tree; Task Manager → all; PM/HR → own lead/HR projects; others → projects with in-scope tasks |
| `get_employee_filter_options()` | `[{value, label}]` | Main Manager → reporting tree; Task Manager → all active; PM/HR → employees with tasks in own projects + self; others → reporting tree |
| `get_my_projects()` | `[{project, project_name, total_tasks, open_tasks, overdue_tasks}]` | Main Manager → hierarchy projects; Task Manager → all; PM/HR → own lead/HR projects; Employees → `[]` |
| **`hr_user_query(...)`** | link-search rows | `Project.custom_hr_user` dropdown — only enabled users with `HR Manager` / `HR User` roles |
| **`get_task_list_data(...)`** | `{rows, total, limit, offset}` | **KPI-consistent paginated table** — see §3.5 |

### 3.4 KPI definitions (identical to table overlays)

| KPI | Conditions |
|---|---|
| Total | base conditions |
| Completed | base conditions with `status = "Completed"` (**ignores** global Status filter) |
| Overdue | base + `status NOT IN ('Completed','Cancelled')` + `custom_delayed_by > 0` |
| Critical | base + `status NOT IN ('Completed','Cancelled')` + `custom_delayed_by >= 15` |

### 3.5 `get_task_list_data` — the consistency guarantee

```
get_task_list_data(tab, kpi_view, project, employee, status, priority, limit, offset)
```

| Input | Effect |
|---|---|
| base | `get_dashboard_conditions(...)` — scope + Cancelled + global filters |
| `tab=my` | + `_assign` contains session user |
| `tab=team` | PM: no extra condition (base scope = own projects + own assignments); managers unrestricted; employees: OR of scope users (UI hides the tab) |
| `tab=all` | requires `can_view_all()` else `PermissionError` |
| `kpi_view=overdue` | + exact Overdue conditions |
| `kpi_view=critical` | + exact Critical conditions |
| `kpi_view=completed` | forces `status = Completed` (ignores global Status, like KPI) |
| `limit` / `offset` | clamped: limit 1–100 (default 15), offset ≥ 0 |

Returns:

```json
{
  "rows": [ { "name", "task_name", "status", "priority",
              "custom_task_priority", "custom_action", "delayed_by",
              "days", "exp_end_date", "project", "_assign" } ],
  "total": 42, "limit": 15, "offset": 0,
  "tab": "my", "kpi_view": "overdue"
}
```

**Guarantee:** clicking any KPI sets `kpi_view` on the same API → the table
`total` always equals the KPI number under identical filters.

### 3.6 Delay buckets (SQL = chart = list)

Defined once in `DELAY_RANGES`:

| Label | Range |
|---|---|
| `1-5 Days` | `custom_delayed_by BETWEEN 1 AND 5` |
| `6-10 Days` | `BETWEEN 6 AND 10` |
| `11-14 Days` | `BETWEEN 11 AND 14` |
| `15+ Days` | `>= 15` |

### 3.7 Query safety

- Conditions are f-string fragments; **all values** go through named
  `%(param)s` placeholders.
- `JSON_CONTAINS` + `JSON_QUOTE` prevent partial user-ID matches.

---

## 4. Frontend — `task_management.js`

### 4.1 Layout

```
.enterprise-layout
├── aside.custom-sidebar
│   ├── Dashboard | My Tasks | Team Tasks* | All Tasks** | Projects | Settings
│   └── *hidden unless can_view_team   **hidden unless can_view_all
└── main.enterprise-dashboard
    ├── .top-header        Filters ▼ | 🔄 Refresh | + New Task
    ├── .filter-toolbar    Project / Employee / Status / Priority (+ Clear)
    ├── #my-projects-panel My Projects cards (Main Manager + Project Manager)
    ├── .kpi-grid          4 cards (role-adapted labels)
    ├── .dashboard-row     delay chart | deadline chart
    ├── .dashboard-row     delay list | upcoming list | priority donut
    └── .task-table-panel  tabs + table + pagination
```

### 4.2 State

```js
dashboard_context = { scope_label, can_view_all, can_view_team, is_project_manager, ... }
table_state = { tab: "my|team|all", kpi_view: "", limit: 15, offset: 0 }
```

### 4.3 Behaviour

| Action | Result |
|---|---|
| Page load | `get_project/employee_filter_options` → meta Status/Priority → `get_dashboard_context` → `refresh_dashboard` |
| Any global filter change | All KPIs + charts + lists + table refresh; filter-count badge updates |
| KPI card click / Enter / Space | Sets `table_state.kpi_view`, reloads table, smooth-scrolls to table — **no desk List route** |
| Tab click | Sets `table_state.tab`, clears `kpi_view`, resets offset, reloads |
| Sidebar My/Team/All | Same as tab switch (role-checked) |
| Table Prev/Next | ± one page (`limit`), reload |
| Table row click | `frappe.set_route("Form","Task",name)` |
| Delayed/upcoming list row click | Same form route |
| + New Task | `frappe.new_doc("Task")` |
| Refresh button | Full dashboard reload + alert |
| Settings | Redirect `/desk/task` (unchanged) |

### 4.4 Charts

| Chart | Type | Data |
|---|---|---|
| `#delay-chart` | bar | 4 buckets, colors `#9AD9A5 #FFC857 #FF9559 #F47791` |
| `#deadline-chart` | bar | per-task `days_remaining` |
| `#priority-chart` | donut | 4 Eisenhower labels **+ Unassigned** (`#94A3B8`), custom legend |

### 4.5 Table rendering

- Columns: Task, Status (badge), Priority, Action, Delayed, End Date, Project,
  Assigned To (email local-part)
- All strings through `frappe.utils.escape_html`
- Empty / loading states in a single colspan-8 row
- `Showing X–Y of Z` + `Page N of M` + disabled Prev/Next edges

---

## 5. Styling — `task_management.css`

Premium enterprise theme (Navy / Indigo / Teal / Amber / Coral) built on a
CSS design-token system.

### Design tokens (`--*` variables on `.enterprise-layout`)

| Group | Tokens |
|---|---|
| Brand | `--navy`, `--navy-deep`, `--indigo`, `--teal`, `--amber`, `--coral` |
| Surface | `--page-bg #F1F5F9`, `--card-bg #FFFFFF`, `--border`, `--border-strong` |
| Text | `--text #0F172A`, `--text-2`, `--text-3` |
| Shadow | `--shadow-xs/sm/md/lg/xl` (layered SaaS-style) |
| Radius | `--radius-sm 8px`, `--radius 12px`, `--radius-lg 16px` |
| Font | `Inter` stack, antialiased |

### Highlights

- **Sidebar:** navy radial + linear gradient, active pill with indigo
  gradient + glow + left accent bar, hover slide
- **KPI cards:** top accent stripe, soft gradient tints per variant, lift on
  hover, tabular-nums counters with count-up animation
- **Panels:** layered shadow, subtle border hover, 16 px radius
- **Filter panel:** slide-in animation, focus rings (indigo), coral Clear
- **Charts:** navy tooltips, Inter labels, soft gridlines
- **Table:** sticky gradient header, zebra rows, hover tint, monospace task
  IDs, status pill badges
- **Tabs:** segmented-control style (grey track, white active pill)
- **Pagination:** ghost buttons with indigo hover
- **Responsive:** 1280 / 960 / 640 / 420 breakpoints; `prefers-reduced-motion`
  respected

---

## 6. Supporting pieces

### 6.1 Custom fields (patches, `after_migrate`)

On `Task`:

| Field | Type | Purpose |
|---|---|---|
| `custom_task_priority` | Select (Eisenhower + Completed) | Priority chart & filter |
| `custom_action` | Select (Bravo!! / Do it First / …) | Suggested action column |
| `custom_task_status` | Link → `Status` | Custom status master |
| `custom_customer` | Link → `Customer` | External project customer |
| `custom_days` | Int, read-only | Today − exp_start_date |
| `custom_delayed_by` | Int, read-only | Today − exp_end_date — **key KPI input** |

On `Project`:

| Field | Type | Purpose |
|---|---|---|
| `custom_project_lead` | Link → `User` | Project Manager assignment — lead sees all tasks under the project |
| `custom_hr_user` | Link → `User` | HR assignment — HR Manager / HR User see all tasks under the project; dropdown lists **only users with HR roles** (custom query `hr_user_query`) |

Patches are idempotent; registered in both `hooks.py` and `patches.txt`.

### 6.2 Task form script — `public/js/task_custom.js`

- Completed status → sets priority `Completed`
- External project → fills/shows `custom_customer`
- Priority → sets `custom_action`
- Dates → computes `custom_days` and `custom_delayed_by` (calendar days)
- **Assignment timeline warning** (client-only, additive): when a user is
  newly assigned, checks other tasks where that user is already assigned
  and whose `exp_start_date..exp_end_date` **overlaps** this task's
  timeline → shows an orange message with the already-assigned task's
  subject. Never blocks the assignment, never touches date logic.

  How it works:

  1. Wraps `frappe.ui.form.AssignTo.prototype.render` once
     (`patch_assign_render_for_timeline_check`), Task forms only.
  2. First render = baseline (no warning on form load); later renders
     diff the assignee list → only **newly added** users are checked.
  3. `frappe.db.get_list("Task")` with date-overlap filters
     (`exp_start_date <= end AND exp_end_date >= start`, excluding this
     task) + `_assign LIKE` prefilter, then exact `JSON.parse(_assign)`
     match client-side.
  4. Failures are swallowed (`try/catch`) — assignment flow is never
     interrupted.

### 6.3 `Status` DocType

Single unique `status` Data field; System Manager CRUD. Options for
`Task.custom_task_status`.

---

## 7. End-to-end data flow

```
Task form (task_custom.js)
  └─ writes custom_delayed_by, custom_days, custom_task_priority, …
       │
       ▼
`tabTask` (+ _assign JSON)
       │
       ▼
get_task_dashboard_scope()  ──►  get_dashboard_conditions()
       │                              │
       │                              ├─ get_dashboard_data      → KPIs
       │                              ├─ get_priority_data       → donut (+= Unassigned)
       │                              ├─ get_delay_chart_data    → delay bars
       │                              ├─ get_delayed_tasks       → delay list
       │                              ├─ get_upcoming_tasks      → deadline bars/list
       │                              ├─ get_project/employee_filter_options
       │                              └─ get_task_list_data      → table (tab + kpi_view)
       ▼
get_dashboard_context()  → KPI titles + tab visibility
       │
       ▼
task_management.js  →  charts, lists, paginated table  →  CSS
```

**KPI click path:** `open_tasks_by_kpi(type)` → `table_state.kpi_view = type`
→ `get_task_list_data` with identical overlay conditions → table total = KPI.

---

## 8. Resolved issues (from previous revision)

| Old issue | Resolution |
|---|---|
| JS role check only allowed Task Manager | Server `get_dashboard_context()` + `can_view_all()` includes Main Manager; client fallback fixed |
| KPI click opened unscoped desk List | KPI click now drives the in-page table via `get_task_list_data` |
| My Tasks used `_assign LIKE %user%` | Sidebar My/Team/All use in-page tabs with exact `JSON_CONTAINS` |
| Priority donut sum ≠ Total KPI | `Unassigned` bucket added in `get_priority_data` |
| "10–15 Days" label was 11–14 | Renamed to `11-14 Days` everywhere (SQL, chart, select) |
| Employee filter not scope-validated | Outside-scope employee → `1 = 0` |
| Dead commented code in `.py` | Removed; file rewritten clean |

### Remaining notes

1. Completed KPI intentionally ignores the global Status filter (so
   Status=Open does not zero out Completed). Documented behaviour.
2. For managers, the Team tab equals All (no reporting tree). Acceptable.
3. `get_dashboard_data` still runs 4 COUNT queries (could be one later).
4. Patches run twice (hooks + patches.txt) — idempotent, harmless.
5. Settings nav still points at `/desk/task`.

---

## 9. Manual test matrix

Run as each role after `bench build` + hard reload.

| Step | Employee | Project Manager | HR (HR Manager/User) | Main Manager (Vikas) | Task Manager |
|---|---|---|---|---|---|
| KPI titles show | My … | Project … | Project … | All … | All … |
| My Projects section | hidden | lead projects + counts | HR projects + counts | team's projects + counts | all projects + counts |
| Default table tab | My | Team | Team | All | All |
| Tabs visible | My | My, Team | My, Team | My, Team, All | My, Team, All |
| `tab=all` API as that user | PermissionError (UI hidden) | PermissionError (UI hidden) | PermissionError (UI hidden) | OK (within hierarchy scope) | OK (unrestricted) |
| Project dropdown | Own projects only | Own lead projects only | Own HR projects only | Projects led by/HR-assigned to reporting tree | All |
| Employee dropdown | Self | Employees with tasks in own projects + self | Employees with tasks in own projects + self | Reporting tree | All active |
| Click Total KPI | table total = KPI | = | = | = | = |
| Click Overdue / Critical / Completed | table total = KPI | = | = | = | = |
| Apply Project + Status filter | all widgets update together | = | = | = | = |
| Employee filter outside scope | no rows (1=0) | no rows | no rows | n/a (in tree only) | n/a (unrestricted) |
| Table pagination | Prev/Next edges correct | = | = | = | = |
| Row click | opens Task form | = | = | = | = |
| Priority donut sum | = Total KPI | = | = | = | = |
| Delay buckets | match delayed list count | = | = | = | = |

**Assertion rule:** for every role and filter combination, each KPI number
must equal the table `total` shown after clicking that KPI.

---

## 10. Quick reference

| What | How |
|---|---|
| Open dashboard | `/app/task-management` |
| Build assets | `bench build` (then hard-reload browser) |
| Re-run field patches | `bench --site <site> migrate` |
| API prefix | `task_custom_app.task_custom_app.page.task_management.task_management.*` |
| Lint | `pre-commit run --all-files` |
| Page size | `TASK_PAGE_SIZE = 15` in `task_management.js` |

# Role-Based Dashboard — Visibility & Access Guide

**App:** `task_custom_app`
**Dashboard:** `/app/task-management`
**Framework:** Frappe v16
**Last updated:** 2026-10-19

> This document explains **who sees what** on the Task Management dashboard —
> the 3-level hierarchy, role definitions, visibility rules, filters, and the
> one-time setup needed. For deep technical internals (SQL, endpoints, file
> map), see `TASK_MANAGEMENT.md`.

---

## 1. What the dashboard is

A single role-adaptive page where every user sees **only their slice** of
task data. Same page, different view, depending on the user's role:

| Widget | What it shows |
|---|---|
| **My Projects** cards | Projects in your scope with total/open/overdue counts (Main Manager + Project Manager only) |
| **4 KPI cards** | Total, Overdue, Critical, Completed — titles adapt: "My …" / "Project …" / "All …" |
| **Charts** | Delay range (bar), Upcoming deadlines (bar), Priority donut |
| **Lists** | Delayed tasks, Upcoming deadlines |
| **Global filters** | Project, Employee, Status, Priority — options limited to your scope |
| **Task table** | Paginated list with tabs (My / Team / All) — clicking a KPI filters it to match exactly |

**Golden rule:** every number on the page comes from the same server-side
condition builder — a KPI count always equals the table total after you click
that KPI.

---

## 2. The 3-level hierarchy

```
        ┌──────────────────────┐
   L1   │  VIKAS sir (top manager) │  Role: Main Manager
        └──────────┬───────────┘
                   │  everyone reports to Vikas (Employee.reports_to)
        ┌──────────┴───────────┐
   L2   │  NILESH sir    PARVEEN sir│  Role: Project Manager
        │  leads Renu  leads BHs│
        └──────────┬───────────┘
                   │
   L3              │  EMPLOYEES (e.g. Renu)   Role: none special
                   │  work on tasks
```

### Your example, mapped

| Person | Assignment | Dashboard shows |
|---|---|---|
| **Vikas** | — (top) | **Both Renu and BHS** — every project led by someone under him, plus tasks assigned to him personally |
| **Nilesh** | Project Lead of **Renu** | Only Renu — all its tasks; nothing from BHS |
| **Parveen** | Project Lead of **BHS** | Only BHS — all its tasks; nothing from Renu |
| **Employees** | — | Only tasks assigned to them (My Tasks) |

### How visibility is decided (data sources)

| Piece of data | Where it lives | Used for |
|---|---|---|
| `Project.custom_project_lead` | Project form → "Task Management" section | Who leads a project (Nilesh → Renu, Parveen → BHS) |
| `Project.custom_hr_user` | Project form → "Task Management" section → **HR** | Who is the HR for a project — HR Manager / HR User see that project's tasks. Dropdown lists **only users with HR Manager / HR User roles** |
| `Employee.reports_to` | Employee form | Hierarchy chain (Renu → Nilesh → Vikas) — used by Vikas's scope and employee filter |
| `Task._assign` | Task's "Assigned To" | My Tasks tab, own-assignment fallback |
| `Task.project` | Task form | Project-based scope for L1, L2 and HR |

---

## 3. Role reference

Roles are checked **server-side** on every API call. Assign them under
`User → Roles`:

| Role | Give to | Sees scope |
|---|---|---|
| **Main Manager** | Vikas (top manager) | Projects led by/HR-assigned to his reporting-tree members + own assigned tasks |
| **Project Manager** | Nilesh, Parveen (leads) | Projects where they are the Project Lead + own assigned tasks |
| **HR Manager** / **HR User** | HR person | Projects where she is the assigned **HR** field + own assigned tasks (same behavior as Project Manager) |
| **Task Manager** | *(optional admin)* | Everything, no restrictions — system/admin role, not part of the 3-level hierarchy |
| *(no special role)* | Regular employees | Own assigned tasks only |

### 3.1 Vikas — Main Manager (Level 1)

| Aspect | Behaviour |
|---|---|
| KPI titles | "All Total", "All Overdue", "All Critical", "All Completed" |
| Task scope | `(project is led by anyone in Vikas's reporting tree) OR (task assigned to Vikas)` |
| Example | Nilesh leads Renu + Parveen leads BHS → Vikas sees **both** |
| Tabs | My, Team, All (default: All) |
| Project filter dropdown | Projects led by reporting-tree members only |
| **Employee filter dropdown** | **Employees under Vikas via `reports_to`** (direct + indirect reports) |
| My Projects section | Shows the team's projects (Renu + BHS) as clickable cards |
| "All Tasks" tab | All tasks **within his hierarchy** — never leaks projects outside it |

### 3.2 Nilesh / Parveen — Project Manager (Level 2)

| Aspect | Behaviour |
|---|---|
| KPI titles | "Project Total", "Project Overdue", … |
| Task scope | `(task belongs to a project they lead) OR (task assigned to them)` |
| Example | Nilesh sees **all tasks under Renu** (even tasks assigned to others); zero tasks from BHS |
| Tabs | My, Team (default: Team). **No All tab** |
| Project filter dropdown | Only their lead projects |
| Employee filter dropdown | Employees who have tasks in their projects + self |
| My Projects section | Their lead projects as clickable cards with counts |
| Fail-safe | No projects assigned yet → they only see tasks assigned directly to them (never unrestricted) |

### 3.3 HR — HR Manager / HR User (same pattern as Level 2)

| Aspect | Behaviour |
|---|---|
| KPI titles | "Project Total", "Project Overdue", … |
| Task scope | `(task belongs to a project where she is the assigned HR) OR (task assigned to her)` |
| Assignment | Project form → Task Management → **HR** field (Project Lead is not used for HR) |
| Tabs | My, Team (default: Team). **No All tab** |
| Project filter dropdown | Only projects where she is the assigned HR |
| Employee filter dropdown | Employees who have tasks in her projects + self |
| My Projects section | Her HR projects as clickable cards with counts |
| Fail-safe | No project marked yet → she only sees tasks assigned directly to her |
| Both roles identical | `HR Manager` and `HR User` behave exactly the same |

### 3.4 Employees (Level 3)

| Aspect | Behaviour |
|---|---|
| KPI titles | "My Total", "My Overdue", … |
| Task scope | Only tasks where **Assigned To = themselves** |
| Tabs | My only |
| Project filter dropdown | Projects that contain their own tasks |
| Employee filter dropdown | Self |
| My Projects section | Hidden |
| Team / All tabs | Hidden in UI **and** rejected server-side |

---

## 4. Dashboard visibility — widget by widget

### 4.1 My Projects cards

| Who | Sees |
|---|---|
| Vikas (Main Manager) | Projects led by / HR-assigned to his reporting tree — subtitle: "Projects handled by your team" |
| Nilesh / Parveen (PM) | Their lead projects — subtitle: "Projects assigned to you as lead" |
| HR (HR Manager / HR User) | Their HR-marked projects |
| Employees | Section hidden |

Clicking a card applies that Project filter to the whole dashboard and scrolls
to the task table. Cards highlight in amber/red when the project has overdue
tasks.

### 4.2 KPI cards (Total / Overdue / Critical / Completed)

| KPI | Counts tasks that… |
|---|---|
| Total | Are in your scope (per role above), excluding Cancelled |
| Overdue | Are not Completed/Cancelled and `custom_delayed_by > 0` (past expected end date) |
| Critical | Are not Completed/Cancelled and delayed **15+ days** |
| Completed | Have status Completed |

Clicking any KPI filters the in-page task table to show exactly those tasks —
the table's total always equals the KPI number.

### 4.3 Global filters

Filters only **narrow** your scope — they can never expand it:

| Filter | Vikas (Main Manager) | Nilesh/Parveen (PM) | HR (HR Manager/User) | Employees |
|---|---|---|---|---|
| Project | Projects led by/HR-assigned to his tree | Own lead projects | Own HR-marked projects | Projects with own tasks |
| Employee | His reporting tree | People with tasks in their projects + self | People with tasks in her projects + self | Self only |
| Status | All statuses | All statuses | All statuses | All statuses |
| Priority | All priorities | All priorities | All priorities | All priorities |

Selecting an Employee **outside** your scope returns zero rows (server-side
`1 = 0` guard) — it is not an error, just empty.

### 4.4 Task table tabs

| Tab | Vikas | Nilesh/Parveen | HR | Employees |
|---|---|---|---|---|
| My Tasks | Tasks assigned to Vikas | Tasks assigned to them | Tasks assigned to her | Tasks assigned to them |
| Team Tasks | All tasks in hierarchy projects | All tasks in their lead projects | All tasks in her HR projects | Hidden |
| All Tasks | All tasks in hierarchy projects | Hidden (blocked server-side) | Hidden (blocked server-side) | Hidden (blocked server-side) |

### 4.5 Charts & lists

Delay chart, deadline chart, priority donut, delayed list, upcoming list —
all use the same role scope as the KPIs. No extra rules to remember: if a
task is visible in the table, it's counted in the charts.

---

## 5. Security model

1. **Server is authoritative.** Every API re-computes the role scope from the
   session user. Hiding UI is cosmetic; the data layer enforces access.
2. **Filters can only narrow.** A Project/Employee/Status filter is AND-ed
   with your scope — it can never show out-of-scope tasks.
3. **`tab=all`** raises `PermissionError` for anyone who is not Main/Task
   Manager.
4. **Fail-safe defaults:**
   - PM/HR with no assigned projects → only own assigned tasks
   - Main Manager with no Employee record → only own assigned tasks
   - No Employee record at all → only own assigned tasks
5. **SQL safety:** all values go through named parameters; user IDs are
   matched with `JSON_CONTAINS` + `JSON_QUOTE` (exact match, no partial
   string leaks).

---

## 6. One-time setup checklist

Run once after deploying:

```bash
bench --site <your-site> migrate    # creates Project Lead + HR fields
bench build                         # rebuilds dashboard assets
```

Then in the UI:

| # | Step | Where |
|---|---|---|
| 1 | Give Vikas the **Main Manager** role | User → Vikas → Roles |
| 2 | Give Nilesh & Parveen the **Project Manager** role | User → Roles |
| 3 | Give HR her existing **HR Manager** or **HR User** role (no new role needed) | User → Roles |
| 4 | Employees: **no special role** needed | — |
| 5 | Set **Project Lead** on every project (Renu → Nilesh, BHS → Parveen) | Project form → Task Management → Project Lead |
| 6 | Set **HR** on projects HR should see (dropdown only lists HR-role users) | Project form → Task Management → HR |
| 7 | Create Vikas's **Employee** record; set `user_id` = his login | Employee form |
| 8 | Set **Reports To** chain: Renu → Nilesh, Nilesh → Vikas (or everyone → Vikas) | Employee form → Reports To |

### Setup rules (important)

- **Every project needs a Project Lead or an HR** — a project with neither
  is invisible to everyone through project scope.
- **Project Lead ≠ HR.** Lead drives Nilesh/Parveen (+ Vikas's hierarchy
  view); the HR field drives the HR Manager/HR User view. A project can
  have both.
- **The reporting chain must reach Vikas.** If Renu's `reports_to` is empty,
  she won't appear in Vikas's employee filter or project scope — and an
  HR-marked project won't show in his dashboard either.
- **Task Manager role = full access.** Don't give it to regular staff; it is
  an admin bypass outside the hierarchy.

---

## 7. Quick verification matrix

Test as each user after `bench build` + hard reload:

| Check | Vikas | Nilesh/Parveen | HR | Employee |
|---|---|---|---|---|
| My Projects cards | Team's projects (Renu + BHS) | Own lead projects only | Own HR-marked projects only | Hidden |
| KPI titles | "All …" | "Project …" | "Project …" | "My …" |
| Default tab | All | Team | Team | My |
| Project dropdown | Tree-led/HR projects | Own lead projects | Own HR-marked projects | Own projects |
| Employee dropdown | Reporting tree | Project workers + self | Project workers + self | Self |
| Click Total KPI | Table total = KPI | = | = | = |
| Open a task outside scope | Impossible | Impossible (e.g. Nilesh never sees BHS tasks) | Impossible (HR sees only her marked projects) | Impossible |
| Row click | Opens Task form | = | = | = |

**Assertion:** for every role and filter combination, each KPI number must
equal the table total shown after clicking that KPI.

---

## 8. FAQ

**Q — Nilesh assigns a BHS task to himself. Does Vikas see it?**
Yes — BHS is led by Parveen (in Vikas's tree), so the project is already in
Vikas's scope.

**Q — Can Parveen see Renu tasks if he's assigned to one?**
Only if the task is *assigned directly to Parveen* (own-assignment rule).
Project-wise, Renu is out of his scope.

**Q — New project created, no lead yet. Who sees it?**
Nobody via project scope. Assign a Project Lead or HR → that person, their
top manager (for leads), and anyone personally assigned to its tasks will
see it.

**Q — Does HR need the Project Lead field set to her?**
No. HR uses the separate **HR** field on the Project. Project Lead stays
with Nilesh/Parveen — a project can have both.

**Q — HR Manager and HR User — is there any difference?**
No — both roles behave identically (project-scope). Pick whichever matches
your user setup; no new role is created.

**Q — Can Vikas force his way into "everything"?**
Not with Main Manager. The Task Manager role is the unrestricted admin role
— use only if truly needed.

**Q — Why does my employee filter not show someone?**
Either they are not in your scope (check `reports_to` chain / project
assignment), or they have no User ID on their Employee record.

---

## 9. Related files

| File | Purpose |
|---|---|
| `task_custom_app/task_custom_app/page/task_management/task_management.py` | All scope logic + APIs |
| `task_custom_app/task_custom_app/page/task_management/task_management.js` | Dashboard UI, My Projects cards, tabs |
| `task_custom_app/task_custom_app/page/task_management/task_management.css` | Theme incl. project cards |
| `task_custom_app/patches/add_project_lead_field.py` | Creates `Project.custom_project_lead` |
| `task_custom_app/patches/add_hr_field_on_project.py` | Creates `Project.custom_hr_user` (HR assignment) |
| `TASK_MANAGEMENT.md` | Full technical reference (SQL, endpoints, charts) |

# Role-Based Desk List Views — Visibility & Access Guide

**App:** `task_custom_app`
**Applies to:** Desk **Project List** (`/app/project`) and **Task List** (`/app/task`)
**Framework:** Frappe v16
**Last updated:** 2026-10-28

> This document explains **who sees what** on the standard desk Project and
> Task list views. The visibility rules are a **client-script mirror of the
> Task Management dashboard** (`/app/task-management`) — same roles, same
> scope. The dashboard itself is **not modified** by this feature.

---

## 1. What this feature does

Every user opening the desk Project or Task list sees **only their slice** of
data — the same slice the dashboard shows them.

### The 3 core rules (plain language)

1. **Employee** — sees **their own tasks** (assigned to their User ID) and
   **projects assigned to them**.
2. **Project Manager** — sees the **projects where they are the Project
   Lead** (`custom_project_lead`), and on the Task list sees **all tasks
   under those projects** (the employees' tasks there) **+ their own
   assigned tasks**.
3. **Main Manager** — sees projects based on the **`reports_to` reporting
   hierarchy**: if a project's lead reports (directly or indirectly) to
   this manager, that manager sees **the project in the Project list** and
   **all its tasks in the Task list + their own assigned tasks**.

### Role reference table

| User type | Task list shows | Project list shows |
|---|---|---|
| **Employee** (no special role) | Tasks assigned to their own User ID (`_assign` / `completed_by`) | Projects assigned to them (Assign To on the Project) |
| **Project Manager** | Own assigned tasks **+ all tasks** of projects where they are `custom_project_lead` / `custom_hr_user` | Projects where they are the Project Lead or assigned HR |
| **HR Manager / HR User** | Same as Project Manager | Same as Project Manager |
| **Main Manager** | Own assigned tasks **+ all tasks** of projects led/HR-assigned to anyone in their reporting tree (`Employee.reports_to`, full BFS) | Projects led/HR-assigned to any member of their reporting tree |
| **Task Manager** or **Administrator** | Everything — unrestricted | Everything — unrestricted |

Role precedence is checked in this order:
**Administrator / Task Manager → Main Manager → Project-scope roles (PM / HR) → Employee**.

### Worked example (matches the dashboard)

| Person | Role | Project list | Task list |
|---|---|---|---|
| Vikas | Main Manager | Renu + BHS (leads Nilesh & Parveen report to him) | All tasks of Renu + BHS + tasks assigned to him |
| Nilesh | Project Manager, lead of Renu | Renu only | All tasks of Renu + tasks assigned to him |
| Renu employee | none | Only projects assigned to them | Only tasks assigned to them |

> **Setup note:** the role must actually be **saved on the user**
> (User form → Roles tab → tick → Save). A user with only
> `Project Manager` who leads no projects gets an empty scope — e.g. Vikas
> must have the **Main Manager** role saved to see the hierarchy, not the
> similarly-named ERPNext "Projects Manager" role. Reload the browser after
> changing roles.

---

## 2. How it works

- Purely a **client script** — no new server endpoints, no DocType permission
  changes, no dashboard changes.
- The script reuses the dashboard's existing whitelisted API
  **`get_my_projects`** (`task_custom_app...page.task_management.task_management.get_my_projects`)
  to resolve the viewer's project scope. That API runs the exact dashboard
  server logic (`get_hierarchy_projects` / `get_project_manager_projects`
  via `frappe.get_all`), so list scope and dashboard scope can never drift.
- The resolved scope is injected into the list view's data query
  (`frappe.desk.reportview.get`) as additional `filters` + `or_filters` just
  before the request is sent. User-applied filters keep working and are
  combined (AND) with the injected scope (OR).
- The header count ("X of Y") is overridden so it counts **within the scope**,
  including the "load accurate count" button.
- The scope is resolved **once per user per browser session** and cached;
  while it resolves, the list stays empty (an impossible `__resolving__`
  filter is used) so unrestricted rows never flash.
- If scope resolution fails, the script falls back to the **Employee**
  scope (own assignments only) — it never fails open.

### Files

| File | Change |
|---|---|
| `task_custom_app/public/js/list_visibility.js` | **New** — scope resolvers + list-view injection for Task and Project |
| `task_custom_app/hooks.py` | `doctype_list_js` registers the script for both Task and Project |

Form scripts (`doctype_js`), `doc_events`, patches and the dashboard page
are untouched.

---

## 3. Per-role details (mirrors the dashboard)

### 3.1 Main Manager (top of hierarchy)

| List | Scope |
|---|---|
| Task | `_assign` contains me OR `completed_by = me` OR `project IN` (projects led by / HR-assigned to anyone in the full `reports_to` tree) |
| Project | `name IN` hierarchy projects (same set as dashboard "My Projects" cards) |

Uses the same server-side tree walk as the dashboard
(`get_reporting_employee_users` → BFS over `Employee.reports_to`), so
direct **and** indirect reports are included — identical to Vikas's
dashboard view.

### 3.2 Project Manager / HR Manager / HR User

| List | Scope |
|---|---|
| Task | Own assigned tasks OR `project IN` (projects where `custom_project_lead` or `custom_hr_user` = me) |
| Project | Projects where `custom_project_lead` or `custom_hr_user` = me |

### 3.3 Employee (no special role)

| List | Scope |
|---|---|
| Task | `_assign` contains my User ID OR `completed_by = me` (covers tasks completed by me — ERPNext clears `_assign` on completion) |
| Project | `_assign` contains my User ID (projects assigned to them via Assign To) |

---

## 4. Known limitations (client-side enforcement)

- **UI-level only.** The data is still fetched under the user's standard
  DocType permissions; the script only narrows what the list requests.
  Anyone calling the API directly would bypass it. For hard enforcement,
  server-side `permission_query_conditions` would be needed later (out of
  scope by design for this task).
- Applies to the standard **List view** (and its count). Kanban / Calendar /
  Gantt views, workspace cards, and global search counts are not filtered.
- Role changes take effect after a browser reload (roles are read from
  `frappe.user_roles`; scope is cached per session).
- Reporting-tree / lead resolution depends on the dashboard API, which needs
  the viewer to be a logged-in desk user (all roles above qualify).

---

## 5. Deployment & testing

```bash
bench build --app task_custom_app
bench clear-cache
# hard-refresh the browser (Ctrl+Shift+R)
```

Test one user per role:

1. **Employee** — Task list shows only their assigned tasks; Project list
   shows only projects assigned to them.
2. **Project Manager (e.g. Nilesh)** — Task list adds all tasks of led/HR
   projects (e.g. Renu); Project list shows only those projects.
3. **Main Manager (e.g. Vikas)** — Task/Project lists cover the whole
   reporting tree (e.g. both Renu and BHS), matching the dashboard exactly.
4. **Task Manager / Administrator** — no restriction.
5. Apply a user filter (e.g. Status = Open) on a scoped list and confirm the
   header count still matches the filtered rows.

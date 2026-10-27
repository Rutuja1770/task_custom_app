import json

import frappe


DELAY_RANGES = {
    "1-5 Days": "t.custom_delayed_by BETWEEN 1 AND 5",
    "6-10 Days": "t.custom_delayed_by BETWEEN 6 AND 10",
    "11-14 Days": "t.custom_delayed_by BETWEEN 11 AND 14",
    "15+ Days": "t.custom_delayed_by >= 15",
}

PRIORITY_UNASSIGNED = "Unassigned"

# Roles that get project-based dashboard scope: all tasks under projects
# where they are the Project Lead or the assigned HR, plus own assignments.
# Existing roles only — no new roles are created by this app.
PROJECT_SCOPE_ROLES = frozenset({
    "Project Manager",
    "HR Manager",
    "HR User",
})


def can_view_all():
    """Return True when the user may see every task."""
    roles = set(frappe.get_roles(frappe.session.user))
    return bool(roles.intersection({"Main Manager", "Task Manager"}))


def is_project_manager():
    """Return True for project-scope roles.

    Covers Project Manager, HR Manager and HR User (PROJECT_SCOPE_ROLES).
    """
    roles = set(frappe.get_roles(frappe.session.user))
    return bool(roles.intersection(PROJECT_SCOPE_ROLES))


def can_view_employees():
    """Return True for roles that may see the Available Employees section.

    Project Manager, Task Manager and Main Manager only — HR roles and
    employees are excluded.
    """
    roles = set(frappe.get_roles(frappe.session.user))
    return bool(
        roles.intersection(
            {"Main Manager", "Task Manager", "Project Manager"}
        )
    )


def _collect_assignees(rows):
    """Parse Task._assign JSON rows into a set of user ids."""
    users = set()

    for row in rows:
        try:
            assigned = json.loads(row._assign or "[]")
        except (TypeError, ValueError):
            continue

        if isinstance(assigned, list):
            users.update(
                user for user in assigned if isinstance(user, str)
            )

    return users


def _get_scope_project_assignees(user=None):
    """Users with open Project-level ToDo in the caller's project scope.

    Main Manager → projects led by/HR-assigned to reporting tree.
    Task Manager → all projects. Project-scope roles → own lead/HR
    projects. Matches get_my_projects() scope so project assignees show
    up as candidates for the same viewers who see the project cards.
    """
    user = user or frappe.session.user
    roles = set(frappe.get_roles(user))

    if "Main Manager" in roles:
        project_names = get_hierarchy_projects(user)

    elif "Task Manager" in roles:
        project_names = frappe.get_all(
            "Project",
            pluck="name",
            limit_page_length=0,
        )

    elif is_project_manager():
        project_names = get_project_manager_projects(user)

    else:
        return set()

    if not project_names:
        return set()

    todo_users = frappe.get_all(
        "ToDo",
        filters={
            "reference_type": "Project",
            "reference_name": ["in", project_names],
            "status": "Open",
        },
        fields=["allocated_to"],
        limit_page_length=0,
    )

    return {
        todo.allocated_to
        for todo in todo_users
        if todo.allocated_to
    }


def get_project_manager_projects(user=None):
    """Return project names in the user's project scope.

    A project is in scope when the user is the Project Lead
    (custom_project_lead) or the assigned HR (custom_hr_user).
    """
    user = user or frappe.session.user

    lead_projects = frappe.get_all(
        "Project",
        filters={"custom_project_lead": user},
        pluck="name",
        limit_page_length=0,
    )

    hr_projects = frappe.get_all(
        "Project",
        filters={"custom_hr_user": user},
        pluck="name",
        limit_page_length=0,
    )

    return sorted(set(lead_projects) | set(hr_projects))


def get_project_team_users(assigned_projects):
    """Return users assigned to any non-cancelled task in the projects."""
    if not assigned_projects:
        return set()

    rows = frappe.get_all(
        "Task",
        filters={
            "project": ["in", assigned_projects],
            "status": ["!=", "Cancelled"],
        },
        fields=["_assign"],
        limit_page_length=0,
    )

    users = set()

    for row in rows:
        try:
            assigned = json.loads(row._assign or "[]")
        except (TypeError, ValueError):
            continue

        if isinstance(assigned, list):
            users.update(assigned)

    return users


def get_hierarchy_projects(user):
    """Return projects led by or HR-assigned to the user's reporting tree.

    Used by the top manager (Main Manager): they see the projects
    handled by their direct and indirect reports (e.g. leads and HR).
    """
    tree_users = get_reporting_employee_users(user)

    if not tree_users:
        return []

    lead_projects = frappe.get_all(
        "Project",
        filters={"custom_project_lead": ["in", tree_users]},
        pluck="name",
        limit_page_length=0,
    )

    hr_projects = frappe.get_all(
        "Project",
        filters={"custom_hr_user": ["in", tree_users]},
        pluck="name",
        limit_page_length=0,
    )

    return sorted(set(lead_projects) | set(hr_projects))


def get_task_dashboard_scope():
    """Return the users whose assigned tasks are visible in the dashboard."""

    user = frappe.session.user
    roles = set(frappe.get_roles(user))

    # Main Manager and Task Manager can see all dashboard tasks.
    if roles.intersection({"Main Manager", "Task Manager"}):
        return None

    # Project-scope roles (PROJECT_SCOPE_ROLES) are project-based
    # (see get_dashboard_conditions), not reporting-tree based.

    # Employee / Task User: only their own assigned tasks.
    return [user]


def _assignment_clause(param_name):
    """Exact JSON match on Task._assign for a single user id."""
    return f"""
        JSON_CONTAINS(
            COALESCE(NULLIF(t._assign, ''), '[]'),
            JSON_QUOTE(%({param_name})s)
        )
    """


def _user_clause(param_name):
    """Match tasks in a user's scope.

    Open tasks are matched through Task._assign (Frappe assignment).
    ERPNext clears _assign when a task is marked Completed
    (close_all_assignments), so completed tasks are matched through
    Task.completed_by (set on completion) or the user's closed ToDo
    on the task (covers tasks completed before completed_by existed).
    """
    return f"""
        (
            {_assignment_clause(param_name)}
            OR t.completed_by = %({param_name})s
            OR (
                t.status = 'Completed'
                AND EXISTS (
                    SELECT 1 FROM `tabToDo` td
                    WHERE td.reference_type = 'Task'
                      AND td.reference_name = t.name
                      AND td.allocated_to = %({param_name})s
                )
            )
        )
    """


def get_dashboard_conditions(
    project=None,
    employee=None,
    status=None,
    priority=None,
):
    conditions = ["COALESCE(t.status, '') != 'Cancelled'"]
    params = {}

    user = frappe.session.user
    roles = set(frappe.get_roles(user))

    # Track user-based scope so the employee filter can be validated
    # against it. None means unrestricted (managers) or project-based
    # (PROJECT_SCOPE_ROLES) — no per-user membership check applies.
    visible_users = None

    if "Main Manager" in roles:
        # Top manager (e.g. Vikas): hierarchy scope — projects led by
        # or HR-assigned to anyone in their reporting tree (e.g. Nilesh's,
        # Parveen's and HR's projects), plus tasks assigned directly
        # to them.
        visible_users = get_reporting_employee_users(user) or [user]
        hierarchy_projects = get_hierarchy_projects(user)
        scope_clauses = []

        if hierarchy_projects:
            placeholders = []

            for index, project_name in enumerate(hierarchy_projects):
                param_name = f"scope_project_{index}"
                params[param_name] = project_name
                placeholders.append(f"%({param_name})s")

            scope_clauses.append(
                f"t.project IN ({', '.join(placeholders)})"
            )

        params["scope_main_user"] = user
        scope_clauses.append(_user_clause("scope_main_user"))

        conditions.append(
            "(" + " OR ".join(scope_clauses) + ")"
        )

    elif "Task Manager" in roles:
        # Unrestricted scope (system/admin role).
        pass

    elif is_project_manager():
        # Project-based scope (Project Manager / HR Manager / HR User):
        # all tasks under projects the user leads or is assigned as HR,
        # plus anything assigned directly to the user.
        assigned_projects = get_project_manager_projects(user)
        scope_clauses = []

        if assigned_projects:
            placeholders = []

            for index, project_name in enumerate(assigned_projects):
                param_name = f"scope_project_{index}"
                params[param_name] = project_name
                placeholders.append(f"%({param_name})s")

            scope_clauses.append(
                f"t.project IN ({', '.join(placeholders)})"
            )

        params["scope_pm_user"] = user
        scope_clauses.append(_user_clause("scope_pm_user"))

        conditions.append(
            "(" + " OR ".join(scope_clauses) + ")"
        )

    else:
        # Employee / Task User: only their own assigned tasks.
        visible_users = [user]
        params["scope_user_0"] = user
        conditions.append(_user_clause("scope_user_0"))

    # Optional dashboard filters narrow the authorized task scope.
    if project:
        conditions.append("t.project = %(project)s")
        params["project"] = project

    if employee:
        # Employee filter must stay inside the caller's authorized scope.
        if visible_users is not None and employee not in visible_users:
            conditions.append("1 = 0")
        else:
            conditions.append(_user_clause("employee"))
            params["employee"] = employee

    if status:
        conditions = [
            condition for condition in conditions
            if condition != "COALESCE(t.status, '') != 'Cancelled'"
        ]
        conditions.append("t.status = %(status)s")
        params["status"] = status

    if priority:
        conditions.append(
            "t.custom_task_priority = %(priority)s"
        )
        params["priority"] = priority

    return " AND ".join(conditions), params


def get_task_conditions():
    # Backward compatibility with existing code.
    return "COALESCE(status, '') != 'Cancelled'"


# =========================================================
# DASHBOARD CONTEXT (role labels / tab visibility)
# =========================================================


@frappe.whitelist()
def get_dashboard_context():
    """Return role-driven UI context for the dashboard."""

    user = frappe.session.user
    roles = set(frappe.get_roles(user))
    managers = bool(roles.intersection({"Main Manager", "Task Manager"}))
    is_pm = is_project_manager()

    employee_name = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        "employee_name",
    )

    if managers:
        scope_label = "All"
    elif is_pm:
        scope_label = "Project"
    else:
        scope_label = "My"

    return {
        "user": user,
        "scope_label": scope_label,
        "can_view_all": managers,
        "can_view_team": managers or is_pm,
        "is_project_manager": is_pm,
        "can_view_employees": can_view_employees(),
        "employee_name": employee_name or user,
    }


# =========================================================
# DASHBOARD KPI DATA
# =========================================================


@frappe.whitelist()
def get_dashboard_data(
    project=None,
    employee=None,
    status=None,
    priority=None,
):
    conditions, params = get_dashboard_conditions(
        project=project,
        employee=employee,
        status=status,
        priority=priority,
    )

    total_tasks = frappe.db.sql(
        f"""
        SELECT COUNT(*)
        FROM `tabTask` t
        WHERE {conditions}
        """,
        params,
    )[0][0]

    completed_conditions, completed_params = get_dashboard_conditions(
        project=project,
        employee=employee,
        status="Completed",
        priority=priority,
    )

    completed_tasks = frappe.db.sql(
        f"""
        SELECT COUNT(*)
        FROM `tabTask` t
        WHERE {completed_conditions}
        """,
        completed_params,
    )[0][0]

    overdue_conditions = conditions + """
        AND t.status NOT IN ('Completed', 'Cancelled')
        AND COALESCE(t.custom_delayed_by, 0) > 0
    """

    overdue_tasks = frappe.db.sql(
        f"""
        SELECT COUNT(*)
        FROM `tabTask` t
        WHERE {overdue_conditions}
        """,
        params,
    )[0][0]

    critical_conditions = conditions + """
        AND t.status NOT IN ('Completed', 'Cancelled')
        AND COALESCE(t.custom_delayed_by, 0) >= 15
    """

    critical_tasks = frappe.db.sql(
        f"""
        SELECT COUNT(*)
        FROM `tabTask` t
        WHERE {critical_conditions}
        """,
        params,
    )[0][0]

    return {
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "overdue_tasks": overdue_tasks,
        "critical_tasks": critical_tasks,
    }


# =========================================================
# PRIORITY CHART
# =========================================================


@frappe.whitelist()
def get_priority_data(
    project=None,
    employee=None,
    status=None,
    priority=None,
):
    conditions, params = get_dashboard_conditions(
        project, employee, status, priority
    )

    rows = frappe.db.sql(
        f"""
        SELECT
            t.custom_task_priority,
            COUNT(*) AS count
        FROM `tabTask` t
        WHERE {conditions}
          AND COALESCE(t.custom_task_priority, '') != ''
        GROUP BY t.custom_task_priority
        ORDER BY t.custom_task_priority
        """,
        params,
        as_dict=True,
    )

    # Include blank-priority tasks so the donut sums to the Total KPI.
    unassigned = frappe.db.sql(
        f"""
        SELECT COUNT(*)
        FROM `tabTask` t
        WHERE {conditions}
          AND COALESCE(t.custom_task_priority, '') = ''
        """,
        params,
    )[0][0]

    if unassigned:
        rows.append(
            frappe._dict(
                {
                    "custom_task_priority": PRIORITY_UNASSIGNED,
                    "count": unassigned,
                }
            )
        )

    return rows


# =========================================================
# DELAYED TASKS
# =========================================================


@frappe.whitelist()
def get_delayed_tasks(
    delay_range="All",
    project=None,
    employee=None,
    status=None,
    priority=None,
):
    conditions, params = get_dashboard_conditions(
        project, employee, status, priority
    )

    # Delayed-task lists never contain completed/cancelled tasks.
    conditions += """
        AND t.status NOT IN ('Completed', 'Cancelled')
        AND COALESCE(t.custom_delayed_by, 0) > 0
    """

    if delay_range in DELAY_RANGES:
        conditions += " AND " + DELAY_RANGES[delay_range]

    return frappe.db.sql(
        f"""
        SELECT
            t.name,
            t.subject AS task_name,
            t.status,
            t.priority,
            t.custom_task_priority,
            t.custom_delayed_by AS delayed_by,
            t.exp_end_date,
            t.project
        FROM `tabTask` t
        WHERE {conditions}
        ORDER BY t.custom_delayed_by DESC
        """,
        params,
        as_dict=True,
    )


# =========================================================
# UPCOMING TASKS
# =========================================================


@frappe.whitelist()
def get_upcoming_tasks(
    days=7,
    project=None,
    employee=None,
    status=None,
    priority=None,
):
    try:
        days = int(days)
    except (TypeError, ValueError):
        days = 7

    days = max(1, min(days, 365))

    conditions, params = get_dashboard_conditions(
        project, employee, status, priority
    )

    params["days"] = days

    # Upcoming tasks exclude completed/cancelled tasks.
    conditions += """
        AND t.status NOT IN ('Completed', 'Cancelled')
        AND t.exp_end_date IS NOT NULL
        AND t.exp_end_date >= CURDATE()
        AND t.exp_end_date <= DATE_ADD(
            CURDATE(), INTERVAL %(days)s DAY
        )
    """

    return frappe.db.sql(
        f"""
        SELECT
            t.name,
            t.subject AS task_name,
            t.status,
            t.priority,
            t.custom_task_priority,
            t.project,
            t.exp_end_date,
            DATEDIFF(
                t.exp_end_date, CURDATE()
            ) AS days_remaining
        FROM `tabTask` t
        WHERE {conditions}
        ORDER BY t.exp_end_date ASC
        """,
        params,
        as_dict=True,
    )


# =========================================================
# DEADLINE CHART
# =========================================================


@frappe.whitelist()
def get_deadline_chart_data(
    days=7,
    project=None,
    employee=None,
    status=None,
    priority=None,
):
    return get_upcoming_tasks(
        days=days,
        project=project,
        employee=employee,
        status=status,
        priority=priority,
    )


# =========================================================
# DELAY CHART
# =========================================================


@frappe.whitelist()
def get_delay_chart_data(
    delay_range="All",
    project=None,
    employee=None,
    status=None,
    priority=None,
):
    tasks = get_delayed_tasks(
        delay_range=delay_range,
        project=project,
        employee=employee,
        status=status,
        priority=priority,
    )

    buckets = {key: 0 for key in DELAY_RANGES}

    for task in tasks:
        delayed_by = task.get("delayed_by") or 0

        if delayed_by <= 5:
            buckets["1-5 Days"] += 1
        elif delayed_by <= 10:
            buckets["6-10 Days"] += 1
        elif delayed_by < 15:
            buckets["11-14 Days"] += 1
        else:
            buckets["15+ Days"] += 1

    return buckets


# =========================================================
# TASK TABLE (in-dashboard, KPI-consistent)
# =========================================================


@frappe.whitelist()
def get_task_list_data(
    tab="my",
    kpi_view="",
    project=None,
    employee=None,
    status=None,
    priority=None,
    limit=15,
    offset=0,
):
    """Return one page of tasks plus the exact filtered total.

    Uses the same conditions as the KPI cards so counts always match.
    tab: my | team | all
    kpi_view: '' | overdue | critical | completed
    """

    tab = (tab or "my").strip()
    kpi_view = (kpi_view or "").strip()

    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 15

    try:
        offset = int(offset)
    except (TypeError, ValueError):
        offset = 0

    limit = max(1, min(limit, 100))
    offset = max(0, offset)

    user = frappe.session.user

    if tab not in ("my", "team", "all"):
        tab = "my"

    if tab == "all" and not can_view_all():
        raise frappe.PermissionError(
            "You are not permitted to view all tasks."
        )

    # Completed KPI view always means Completed, like get_dashboard_data.
    effective_status = status
    if kpi_view == "completed":
        effective_status = "Completed"

    base_conditions, params = get_dashboard_conditions(
        project=project,
        employee=employee,
        status=effective_status,
        priority=priority,
    )

    # get_dashboard_conditions returns a joined string; keep a list of
    # fragments so tab / KPI overlays can still be appended.
    conditions = [base_conditions]

    if tab == "my":
        params["tab_user"] = user
        conditions.append(_user_clause("tab_user"))

    elif tab == "team":
        # Project-scope roles (PM / HR): base scope already covers their
        # projects and own assignments — no extra condition needed.
        # Managers: unrestricted; team == all for them.
        # Employees: user-based scope (UI hides the tab).
        visible_users = None if is_project_manager() else get_task_dashboard_scope()

        if visible_users is not None:
            team_conditions = []

            for index, user_id in enumerate(visible_users):
                param_name = f"team_user_{index}"
                params[param_name] = user_id
                team_conditions.append(_user_clause(param_name))

            if team_conditions:
                conditions.append(
                    "(" + " OR ".join(team_conditions) + ")"
                )
            else:
                conditions.append("1 = 0")

    # KPI overlays reuse the exact KPI conditions.
    if kpi_view == "overdue":
        conditions.append(
            "t.status NOT IN ('Completed', 'Cancelled')"
        )
        conditions.append("COALESCE(t.custom_delayed_by, 0) > 0")

    elif kpi_view == "critical":
        conditions.append(
            "t.status NOT IN ('Completed', 'Cancelled')"
        )
        conditions.append("COALESCE(t.custom_delayed_by, 0) >= 15")

    where = " AND ".join(
        condition for condition in conditions if condition
    )

    total = frappe.db.sql(
        f"""
        SELECT COUNT(*)
        FROM `tabTask` t
        WHERE {where}
        """,
        params,
    )[0][0]

    rows = frappe.db.sql(
        f"""
        SELECT
            t.name,
            t.subject AS task_name,
            t.status,
            t.priority,
            t.custom_task_priority,
            t.custom_action,
            COALESCE(t.custom_delayed_by, 0) AS delayed_by,
            COALESCE(t.custom_days, 0) AS days,
            DATE(t.exp_end_date) AS exp_end_date,
            t.project,
            COALESCE(NULLIF(p.project_name, ''), t.project) AS project_name,
            t.completed_by,
            t._assign
        FROM `tabTask` t
        LEFT JOIN `tabProject` p ON p.name = t.project
        WHERE {where}
        ORDER BY
            COALESCE(t.custom_delayed_by, 0) DESC,
            t.exp_end_date ASC,
            t.name
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        {**params, "limit": limit, "offset": offset},
        as_dict=True,
    )

    return {
        "rows": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
        "tab": tab,
        "kpi_view": kpi_view,
    }


# =========================================================
# FILTER OPTIONS
# =========================================================


@frappe.whitelist()
def get_project_filter_options():
    """Return projects based on the logged-in user's task scope."""

    user = frappe.session.user
    roles = set(frappe.get_roles(user))

    if "Main Manager" in roles:
        # Top manager: projects led by / HR-assigned to their reporting
        # tree (same scope as their task visibility).
        hierarchy_projects = get_hierarchy_projects(user)

        if not hierarchy_projects:
            return []

        projects = frappe.get_all(
            "Project",
            filters={"name": ["in", hierarchy_projects]},
            fields=["name", "project_name"],
            order_by="project_name asc",
            limit_page_length=0,
        )

    elif "Task Manager" in roles:
        # Unrestricted (system/admin role): all projects.
        projects = frappe.get_all(
            "Project",
            fields=["name", "project_name"],
            order_by="project_name asc",
            limit_page_length=0,
        )

    elif is_project_manager():
        # Project-scope roles see only their lead/HR-assigned projects.
        assigned_projects = get_project_manager_projects(user)

        if not assigned_projects:
            return []

        projects = frappe.get_all(
            "Project",
            filters={"name": ["in", assigned_projects]},
            fields=["name", "project_name"],
            order_by="project_name asc",
            limit_page_length=0,
        )

    else:
        # Use the same assignment scope as the dashboard KPIs.
        visible_users = get_task_dashboard_scope()

        if not visible_users:
            return []

        task_filters = [
            "COALESCE(t.status, '') != 'Cancelled'",
        ]
        params = {}

        if visible_users is not None:
            assignments = []

            for index, assigned_user in enumerate(visible_users):
                key = f"scope_user_{index}"
                params[key] = assigned_user
                assignments.append(_user_clause(key))

            task_filters.append(
                "(" + " OR ".join(assignments) + ")"
                if assignments else "1 = 0"
            )

        project_names = frappe.db.sql(
            f"""
            SELECT DISTINCT t.project
            FROM `tabTask` t
            WHERE {" AND ".join(task_filters)}
              AND COALESCE(t.project, '') != ''
            """,
            params,
            pluck=True,
        )

        projects = []

        if project_names:
            projects = frappe.get_all(
                "Project",
                filters={"name": ["in", project_names]},
                fields=["name", "project_name"],
                order_by="project_name asc",
                limit_page_length=0,
            )

    return [
        {
            "value": project.name,
            "label": project.project_name or project.name,
        }
        for project in projects
    ]


def get_reporting_employee_users(user):
    """Get the current employee and all direct/indirect reports."""

    current_employee = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        "name",
    )

    if not current_employee:
        return []

    employees = frappe.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["name", "employee_name", "reports_to", "user_id"],
        limit_page_length=0,
    )

    children_by_manager = {}

    for emp in employees:
        if emp.reports_to:
            children_by_manager.setdefault(
                emp.reports_to, []
            ).append(emp)

    visible_names = {current_employee}
    pending = [current_employee]

    while pending:
        manager_name = pending.pop()

        for child in children_by_manager.get(manager_name, []):
            if child.name not in visible_names:
                visible_names.add(child.name)
                pending.append(child.name)

    visible_users = {
        emp.user_id
        for emp in employees
        if emp.name in visible_names and emp.user_id
    }

    visible_users.add(user)
    return sorted(visible_users)


@frappe.whitelist()
def get_employee_filter_options():
    """Return employee filter options based on reporting hierarchy."""

    user = frappe.session.user
    roles = set(frappe.get_roles(user))

    if "Main Manager" in roles:
        # Top manager: employees under them via the reporting hierarchy
        # (Employee.reports_to), including direct and indirect reports.
        visible_users = get_reporting_employee_users(user) or [user]

        employees = frappe.get_all(
            "Employee",
            filters={
                "user_id": ["in", visible_users],
                "status": "Active",
            },
            fields=["name", "employee_name", "user_id"],
            order_by="employee_name asc",
            limit_page_length=0,
        )

    elif "Task Manager" in roles:
        # Unrestricted (system/admin role): all active employees.
        employees = frappe.get_all(
            "Employee",
            filters={"status": "Active"},
            fields=["name", "employee_name", "user_id"],
            order_by="employee_name asc",
            limit_page_length=0,
        )

    elif is_project_manager():
        # Project-scope roles (PM / HR) see employees working on their
        # projects (anyone assigned to a task in an assigned project)
        # + self.
        assigned_projects = get_project_manager_projects(user)
        team_users = get_project_team_users(assigned_projects) | {user}

        employees = frappe.get_all(
            "Employee",
            filters={
                "user_id": ["in", sorted(team_users)],
                "status": "Active",
            },
            fields=["name", "employee_name", "user_id"],
            order_by="employee_name asc",
            limit_page_length=0,
        )

    else:
        visible_users = get_reporting_employee_users(user)

        if not visible_users:
            return []

        employees = frappe.get_all(
            "Employee",
            filters={
                "user_id": ["in", visible_users],
                "status": "Active",
            },
            fields=["name", "employee_name", "user_id"],
            order_by="employee_name asc",
            limit_page_length=0,
        )

    return [
        {
            "value": emp.user_id,
            "label": emp.employee_name or emp.name,
        }
        for emp in employees
        if emp.user_id
    ]


# =========================================================
# MY PROJECTS (project-scope roles: PM / HR)
# =========================================================


@frappe.whitelist()
def get_my_projects():
    """Return the user's visible projects with task counts.

    Main Manager: projects led by/HR-assigned to their reporting tree.
    Task Manager: all projects. Project-scope roles (Project Manager,
    HR Manager, HR User): own lead/HR projects. Employees: empty list.
    """

    user = frappe.session.user
    roles = set(frappe.get_roles(user))

    if "Main Manager" in roles:
        project_names = get_hierarchy_projects(user)

    elif "Task Manager" in roles:
        project_names = frappe.get_all(
            "Project",
            pluck="name",
            limit_page_length=0,
        )

    elif is_project_manager():
        project_names = get_project_manager_projects(user)

    else:
        return []

    if not project_names:
        return []

    count_rows = frappe.db.sql(
        f"""
        SELECT
            t.project,
            COUNT(*) AS total_tasks,
            SUM(
                CASE WHEN t.status NOT IN ('Completed', 'Cancelled')
                    THEN 1 ELSE 0 END
            ) AS open_tasks,
            SUM(
                CASE WHEN t.status NOT IN ('Completed', 'Cancelled')
                      AND COALESCE(t.custom_delayed_by, 0) > 0
                    THEN 1 ELSE 0 END
            ) AS overdue_tasks
        FROM `tabTask` t
        WHERE t.project IN %(projects)s
          AND COALESCE(t.status, '') != 'Cancelled'
        GROUP BY t.project
        """,
        {"projects": tuple(project_names)},
        as_dict=True,
    )

    counts = {row.project: row for row in count_rows}

    projects = frappe.get_all(
        "Project",
        filters={"name": ["in", project_names]},
        fields=["name", "project_name"],
        order_by="project_name asc",
        limit_page_length=0,
    )

    return [
        {
            "project": project.name,
            "project_name": project.project_name or project.name,
            "total_tasks": counts[project.name].total_tasks
            if project.name in counts else 0,
            "open_tasks": counts[project.name].open_tasks
            if project.name in counts else 0,
            "overdue_tasks": counts[project.name].overdue_tasks
            if project.name in counts else 0,
        }
        for project in projects
    ]


# =========================================================
# AVAILABLE EMPLOYEES (next N days)
# =========================================================


@frappe.whitelist()
def get_available_employees(days=7):
    """Return scope-team users free for the next `days` days.

    Visible to Project Manager, Task Manager and Main Manager only.

    Candidates = users assigned to tasks inside the caller's dashboard
    scope, plus users assigned to in-scope projects (open Project-level
    ToDo). Busy = any user with an unfinished task (not Completed or
    Cancelled) due on or before the end of the window — overdue pending
    tasks count as busy, and tasks outside the caller's scope still
    occupy the user. Available = candidates − busy.
    """

    if not can_view_employees():
        raise frappe.PermissionError(
            "Available Employees is not available for your role."
        )

    try:
        days = int(days)
    except (TypeError, ValueError):
        days = 7

    days = max(1, min(days, 30))

    # Candidates: users assigned to tasks inside the caller's scope.
    conditions, params = get_dashboard_conditions()

    candidate_rows = frappe.db.sql(
        f"""
        SELECT t._assign
        FROM `tabTask` t
        WHERE {conditions}
          AND COALESCE(t._assign, '') != ''
        """,
        params,
        as_dict=True,
    )

    candidates = _collect_assignees(candidate_rows)

    # Project-level assignees (open ToDo on in-scope projects).
    candidates.update(_get_scope_project_assignees())

    if not candidates:
        return []

    # Busy: unfinished tasks due on or before the window end
    # (global — includes overdue and other-scope tasks).
    busy_rows = frappe.db.sql(
        """
        SELECT t._assign
        FROM `tabTask` t
        WHERE COALESCE(t.status, '') NOT IN ('Completed', 'Cancelled')
          AND t.exp_end_date IS NOT NULL
          AND DATE(t.exp_end_date) <= DATE_ADD(
              CURDATE(), INTERVAL %(days)s DAY
          )
          AND COALESCE(t._assign, '') != ''
        """,
        {"days": days},
        as_dict=True,
    )

    busy = _collect_assignees(busy_rows)
    available = sorted(candidates - busy)

    if not available:
        return []

    users = frappe.get_all(
        "User",
        filters={"name": ["in", available], "enabled": 1},
        fields=["name", "full_name", "email"],
        limit_page_length=0,
    )

    employees = {
        emp.user_id: emp
        for emp in frappe.get_all(
            "Employee",
            filters={
                "user_id": ["in", available],
                "status": "Active",
            },
            fields=["user_id", "employee_name", "designation"],
            limit_page_length=0,
        )
    }

    result = []

    for user in users:
        employee = employees.get(user.name)
        full_name = (
            (employee.employee_name if employee else None)
            or user.full_name
            or user.email
        )

        result.append({
            "user": user.name,
            "full_name": full_name,
            "email": user.email or user.name,
            "designation": (
                employee.designation if employee else None
            )
            or "",
        })

    result.sort(key=lambda item: (item["full_name"] or "").lower())
    return result


# =========================================================
# LINK QUERIES
# =========================================================


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def hr_user_query(doctype, txt, searchfield, start, page_len, filters):
    """Link query for Project.custom_hr_user.

    Lists only enabled users having an HR role
    (HR Manager or HR User) — the HR dropdown never shows other users.
    """

    return frappe.db.sql(
        """
        SELECT DISTINCT
            u.name,
            u.full_name
        FROM `tabUser` u
        INNER JOIN `tabHas Role` r
            ON r.parent = u.name
           AND r.parenttype = 'User'
           AND r.parentfield = 'roles'
           AND r.role IN ('HR Manager', 'HR User')
        WHERE u.enabled = 1
          AND (u.name LIKE %(txt)s
               OR u.full_name LIKE %(txt)s)
        ORDER BY u.name
        LIMIT %(start)s, %(page_len)s
        """,
        {
            "txt": f"%{txt}%",
            "start": start,
            "page_len": page_len,
        },
    )

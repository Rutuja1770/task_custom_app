import frappe


DELAY_RANGES = {
    "1-5 Days": "t.custom_delayed_by BETWEEN 1 AND 5",
    "6-10 Days": "t.custom_delayed_by BETWEEN 6 AND 10",
    "11-14 Days": "t.custom_delayed_by BETWEEN 11 AND 14",
    "15+ Days": "t.custom_delayed_by >= 15",
}

PRIORITY_UNASSIGNED = "Unassigned"


def can_view_all():
    """Return True when the user may see every task."""
    roles = set(frappe.get_roles(frappe.session.user))
    return bool(roles.intersection({"Main Manager", "Task Manager"}))


def get_task_dashboard_scope():
    """Return the users whose assigned tasks are visible in the dashboard."""

    user = frappe.session.user
    roles = set(frappe.get_roles(user))

    # Main Manager and Task Manager can see all dashboard tasks.
    if roles.intersection({"Main Manager", "Task Manager"}):
        return None

    # Find the logged-in user's Employee record in Employee Master.
    current_employee = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        "name",
    )

    # If no Employee record exists, restrict to the logged-in user.
    if not current_employee:
        return [user]

    # Project Manager: self + all direct and indirect reporting employees.
    if "Project Manager" in roles:
        visible_users = get_reporting_employee_users(user)

        # Fail closed if the reporting hierarchy returns no users.
        if not visible_users:
            return [user]

        return sorted(set(visible_users) | {user})

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


def get_dashboard_conditions(
    project=None,
    employee=None,
    status=None,
    priority=None,
):
    conditions = ["COALESCE(t.status, '') != 'Cancelled'"]
    params = {}

    # Apply the logged-in user's mandatory access scope.
    visible_users = get_task_dashboard_scope()

    if visible_users is not None:
        assignment_conditions = []

        for index, user_id in enumerate(visible_users):
            param_name = f"scope_user_{index}"
            params[param_name] = user_id
            assignment_conditions.append(_assignment_clause(param_name))

        if assignment_conditions:
            conditions.append(
                "(" + " OR ".join(assignment_conditions) + ")"
            )
        else:
            conditions.append("1 = 0")

    # Optional dashboard filters narrow the authorized task scope.
    if project:
        conditions.append("t.project = %(project)s")
        params["project"] = project

    if employee:
        # Employee filter must stay inside the caller's authorized scope.
        if visible_users is not None and employee not in visible_users:
            conditions.append("1 = 0")
        else:
            conditions.append(_assignment_clause("employee"))
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
    is_pm = "Project Manager" in roles

    employee_name = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        "employee_name",
    )

    if managers:
        scope_label = "All"
    elif is_pm:
        scope_label = "Team"
    else:
        scope_label = "My"

    return {
        "user": user,
        "scope_label": scope_label,
        "can_view_all": managers,
        "can_view_team": managers or is_pm,
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
        conditions.append(_assignment_clause("tab_user"))

    elif tab == "team":
        visible_users = get_task_dashboard_scope()

        # Managers are unrestricted; team == all for them.
        if visible_users is not None:
            team_conditions = []

            for index, user_id in enumerate(visible_users):
                param_name = f"team_user_{index}"
                params[param_name] = user_id
                team_conditions.append(_assignment_clause(param_name))

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
            t.exp_end_date,
            t.project,
            t._assign
        FROM `tabTask` t
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

    # Main Manager and Task Manager can see all projects.
    if roles.intersection({"Main Manager", "Task Manager"}):
        projects = frappe.get_all(
            "Project",
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
                assignments.append(_assignment_clause(key))

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

    if "Main Manager" in roles or "Task Manager" in roles:
        employees = frappe.get_all(
            "Employee",
            filters={"status": "Active"},
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


import json

import frappe


def get_task_dashboard_scope():
    """Return the user IDs whose assigned tasks the current user may see."""

    user = frappe.session.user
    roles = set(frappe.get_roles(user))

    # Only these explicitly authorized roles see every task.
    if roles.intersection({"Task Manager", "Main Manager"}):
        return None

    # Find the logged-in user's Employee record.
    employee = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        ["name", "reports_to"],
        as_dict=True,
    )

    # Fail closed: a non-manager without an Employee record
    # sees only tasks assigned directly to their own user.
    if not employee:
        return [user]

    # Project Managers can see their direct and indirect
    # reporting employees across projects.
    if "Project Manager" in roles:
        employees = frappe.get_all(
            "Employee",
            filters={"status": "Active"},
            fields=["name", "reports_to", "user_id"],
        )

        children_by_manager = {}
        for row in employees:
            if row.reports_to:
                children_by_manager.setdefault(
                    row.reports_to, []
                ).append(row)

        visible_employee_names = {employee.name}
        pending = [employee.name]

        while pending:
            manager_name = pending.pop()

            for child in children_by_manager.get(manager_name, []):
                if child.name not in visible_employee_names:
                    visible_employee_names.add(child.name)
                    pending.append(child.name)

        visible_users = {
            row.user_id
            for row in employees
            if row.name in visible_employee_names and row.user_id
        }
        visible_users.add(user)

        return sorted(visible_users)

    # Employees / Task Users see their own assigned tasks.
    return [user]


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

            assignment_conditions.append(
                f"""
                JSON_CONTAINS(
                    COALESCE(NULLIF(t._assign, ''), '[]'),
                    JSON_QUOTE(%({param_name})s)
                )
                """
            )

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
        conditions.append("""
            JSON_CONTAINS(
                COALESCE(NULLIF(t._assign, ''), '[]'),
                JSON_QUOTE(%(employee)s)
            )
        """)
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

# =========================================================
# SHARED DASHBOARD FILTERS
# =========================================================

# def get_dashboard_conditions(
#     project=None,
#     employee=None,
#     status=None,
#     priority=None,
# ):
#     conditions = ["COALESCE(t.status, '') != 'Cancelled'"]
#     params = {}

#     if project:
#         conditions.append("t.project = %(project)s")
#         params["project"] = project

#     if employee:
#         # Task._assign stores assigned user IDs as JSON.
#         # JSON_CONTAINS avoids partial user-ID matches.
#         conditions.append("""
#             JSON_CONTAINS(
#                 COALESCE(NULLIF(t._assign, ''), '[]'),
#                 JSON_QUOTE(%(employee)s)
#             )
#         """)
#         params["employee"] = employee

#     if status:
#         # An explicitly selected status, including Cancelled,
#         # overrides the default Cancelled exclusion.
#         conditions = [
#             condition for condition in conditions
#             if condition != "COALESCE(t.status, '') != 'Cancelled'"
#         ]
#         conditions.append("t.status = %(status)s")
#         params["status"] = status

#     if priority:
#         conditions.append(
#             "t.custom_task_priority = %(priority)s"
#         )
#         params["priority"] = priority

#     return " AND ".join(conditions), params


def get_task_conditions():
    # Backward compatibility with existing code.
    return "COALESCE(status, '') != 'Cancelled'"


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
        project, employee, status, priority
    )

    total_tasks = frappe.db.sql(
        f"""
        SELECT COUNT(*)
        FROM `tabTask` t
        WHERE {conditions}
        """,
        params,
    )[0][0]

    # Completed KPI always counts Completed tasks, while
    # retaining the selected Project, Employee and Priority.
    completed_conditions, completed_params = (
        get_dashboard_conditions(
            project=project,
            employee=employee,
            status="Completed",
            priority=priority,
        )
    )

    completed_tasks = frappe.db.sql(
        f"""
        SELECT COUNT(*)
        FROM `tabTask` t
        WHERE {completed_conditions}
        """,
        completed_params,
    )[0][0]

    overdue_tasks = frappe.db.sql(
        f"""
        SELECT COUNT(*)
        FROM `tabTask` t
        WHERE {conditions}
          AND t.status != 'Completed'
          AND COALESCE(t.custom_delayed_by, 0) > 0
        """,
        params,
    )[0][0]

    critical_tasks = frappe.db.sql(
        f"""
        SELECT COUNT(*)
        FROM `tabTask` t
        WHERE {conditions}
          AND t.status != 'Completed'
          AND COALESCE(t.custom_delayed_by, 0) >= 15
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

    return frappe.db.sql(
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

    range_conditions = {
        "0-5 Days": "t.custom_delayed_by BETWEEN 1 AND 5",
        "5-10 Days": "t.custom_delayed_by BETWEEN 6 AND 10",
        "10-15 Days": "t.custom_delayed_by BETWEEN 11 AND 14",
        "15+ Days": "t.custom_delayed_by >= 15",
    }

    if delay_range in range_conditions:
        conditions += " AND " + range_conditions[delay_range]

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

    buckets = {
        "0-5 Days": 0,
        "5-10 Days": 0,
        "10-15 Days": 0,
        "15+ Days": 0,
    }

    for task in tasks:
        delayed_by = task.get("delayed_by") or 0

        if delayed_by <= 5:
            buckets["0-5 Days"] += 1
        elif delayed_by <= 10:
            buckets["5-10 Days"] += 1
        elif delayed_by < 15:
            buckets["10-15 Days"] += 1
        else:
            buckets["15+ Days"] += 1

    return buckets





@frappe.whitelist()
def get_project_filter_options():
    """Return projects with readable project names."""
    projects = frappe.get_all(
        "Project",
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


@frappe.whitelist()
def get_employee_filter_options():
    """Return the current user's reporting employees as filter options."""
    user = frappe.session.user
    roles = set(frappe.get_roles(user))

    # Users authorized to manage all tasks can filter all employees.
    if roles.intersection({"Task Manager", "Main Manager"}):
        employees = frappe.get_all(
            "Employee",
            filters={"status": "Active"},
            fields=["name", "employee_name", "user_id"],
            order_by="employee_name asc",
            limit_page_length=0,
        )
    else:
        current_employee = frappe.db.get_value(
            "Employee",
            {"user_id": user},
            "name",
        )

        if not current_employee:
            return []

        # Build the reporting hierarchy.
        all_employees = frappe.get_all(
            "Employee",
            filters={"status": "Active"},
            fields=["name", "employee_name", "reports_to", "user_id"],
            limit_page_length=0,
        )

        children_by_manager = {}
        for emp in all_employees:
            if emp.reports_to:
                children_by_manager.setdefault(
                    emp.reports_to, []
                ).append(emp)

        visible_names = set()
        pending = [current_employee]

        while pending:
            manager = pending.pop()

            for child in children_by_manager.get(manager, []):
                if child.name not in visible_names:
                    visible_names.add(child.name)
                    pending.append(child.name)

        employees = [
            emp for emp in all_employees
            if emp.name in visible_names
        ]

    return [
        {
            "value": emp.user_id,
            "label": emp.employee_name or emp.name,
        }
        for emp in employees
        if emp.user_id
    ]





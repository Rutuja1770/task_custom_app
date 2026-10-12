
import frappe


def get_task_conditions():
    return "COALESCE(status, '') != 'Cancelled'"


@frappe.whitelist()
def get_dashboard_data():
    conditions = get_task_conditions()

    total_tasks = frappe.db.sql(
        f"""
        SELECT COUNT(*)
        FROM `tabTask`
        WHERE {conditions}
        """
    )[0][0]

    completed_tasks = frappe.db.count(
        "Task",
        {"status": "Completed"}
    )

    overdue_tasks = frappe.db.sql(
        f"""
        SELECT COUNT(*)
        FROM `tabTask`
        WHERE {conditions}
          AND status != 'Completed'
          AND COALESCE(custom_delayed_by, 0) > 0
        """
    )[0][0]

    critical_tasks = frappe.db.sql(
        f"""
        SELECT COUNT(*)
        FROM `tabTask`
        WHERE {conditions}
          AND status != 'Completed'
          AND COALESCE(custom_delayed_by, 0) >= 15
        """
    )[0][0]

    return {
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "overdue_tasks": overdue_tasks,
        "critical_tasks": critical_tasks
    }



@frappe.whitelist()
def get_priority_data():
    return frappe.db.sql("""
        SELECT
            custom_task_priority,
            COUNT(*) AS count
        FROM `tabTask`
        WHERE COALESCE(status, '') != 'Cancelled'
          AND COALESCE(custom_task_priority, '') != 'Completed'
          AND COALESCE(custom_task_priority, '') != ''
        GROUP BY custom_task_priority
        ORDER BY custom_task_priority
    """, as_dict=True)

@frappe.whitelist()
def get_delayed_tasks(delay_range="All"):
    query = """
        SELECT
            name,
            subject AS task_name,
            status,
            priority,
            custom_delayed_by AS delayed_by,
            exp_end_date
        FROM `tabTask`
        WHERE COALESCE(status, '') NOT IN ('Completed', 'Cancelled')
          AND COALESCE(custom_delayed_by, 0) > 0
    """

    range_conditions = {
        "0-5 Days": "custom_delayed_by BETWEEN 1 AND 5",
        "5-10 Days": "custom_delayed_by BETWEEN 6 AND 10",
        "10-15 Days": "custom_delayed_by BETWEEN 11 AND 14",
        "15+ Days": "custom_delayed_by >= 15"
    }

    if delay_range in range_conditions:
        query += f" AND {range_conditions[delay_range]}"

    query += " ORDER BY custom_delayed_by DESC"

    return frappe.db.sql(query, as_dict=True)


@frappe.whitelist()
def get_upcoming_tasks(days=7):
    days = max(1, min(int(days), 365))

    return frappe.db.sql(
        """
        SELECT
            name,
            subject AS task_name,
            status,
            priority,
            exp_end_date,
            DATEDIFF(exp_end_date, CURDATE()) AS days_remaining
        FROM `tabTask`
        WHERE COALESCE(status, '') NOT IN ('Completed', 'Cancelled')
          AND exp_end_date IS NOT NULL
          AND exp_end_date >= CURDATE()
          AND exp_end_date <= DATE_ADD(
              CURDATE(), INTERVAL %(days)s DAY
          )
        ORDER BY exp_end_date ASC
        """,
        {"days": days},
        as_dict=True
    )


@frappe.whitelist()
def get_deadline_chart_data(days=7):
    return get_upcoming_tasks(days)


@frappe.whitelist()
def get_delay_chart_data(delay_range="All"):
    tasks = get_delayed_tasks(delay_range)

    buckets = {
        "0-5 Days": 0,
        "5-10 Days": 0,
        "10-15 Days": 0,
        "15+ Days": 0
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

import frappe


def execute():
    """Backfill Task.completed_by from closed ToDos.

    Tasks completed before the before_save hook existed have an empty
    completed_by. The assignee is recovered from the ToDo that
    close_all_assignments closed (most recently closed wins).
    """
    if not frappe.db.exists("DocType", "Task"):
        return

    rows = frappe.db.sql(
        """
        SELECT t.name, t.completed_by,
            (
                SELECT td.allocated_to
                FROM `tabToDo` td
                WHERE td.reference_type = 'Task'
                  AND td.reference_name = t.name
                  AND td.status = 'Closed'
                  AND COALESCE(td.allocated_to, '') != ''
                ORDER BY td.modified DESC
                LIMIT 1
            ) AS todo_user
        FROM `tabTask` t
        WHERE t.status = 'Completed'
          AND COALESCE(t.completed_by, '') = ''
        """,
        as_dict=True,
    )

    updated = 0

    for row in rows:
        if not row.todo_user:
            continue

        frappe.db.set_value(
            "Task",
            row.name,
            "completed_by",
            row.todo_user,
            update_modified=False,
        )
        updated += 1

    frappe.db.commit()

    if updated:
        print(f"task_custom_app: backfilled completed_by on {updated} tasks")

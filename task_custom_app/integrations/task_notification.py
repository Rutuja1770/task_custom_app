
import json

import frappe
from frappe.utils import cint


def on_task_created(doc, method=None):
    """Notify after a new Task is committed.

    Notifies the Project Manager, the reporting manager of the Task
    owner, and the creator. Assignees are notified separately through
    the ToDo after_insert hook (assignment happens after insert).
    """
    _enqueue_notification(doc.name, include_assignees=False)


def on_todo_created(doc, method=None):
    """Notify when a user is assigned to a Task via ToDo."""
    if getattr(doc, "reference_type", None) != "Task":
        return

    if not getattr(doc, "reference_name", None):
        return

    if getattr(doc, "status", None) == "Closed":
        return

    _enqueue_notification(doc.reference_name, include_assignees=True)


def _enqueue_notification(task_name, include_assignees):
    frappe.enqueue(
        "task_custom_app.integrations.task_notification.process_task_notification",
        queue="short",
        enqueue_after_commit=True,
        task_name=task_name,
        include_assignees=include_assignees,
    )


def process_task_notification(task_name, include_assignees=True):
    """Notify Project Manager, reporting managers and assigned users."""
    try:
        task = frappe.get_doc("Task", task_name)

        if not task.project:
            return

        project = frappe.get_doc("Project", task.project)

        if project.status != "Open":
            return

        recipients = set()

        if include_assignees:
            for user in get_assigned_users(task):
                add_enabled_user(recipients, user)
                _add_reporting_manager(recipients, user)

        project_manager = get_project_manager_user(project)
        add_enabled_user(recipients, project_manager)

        owner = getattr(task, "owner", None)
        add_enabled_user(recipients, owner)

        if not recipients:
            return

        already_notified = _already_notified_users(task.name, recipients)
        recipients -= already_notified

        if not recipients:
            return

        subject = f"New Task Created: {task.name}"
        message = build_message(task, project)

        for user in recipients:
            try:
                frappe.get_doc(
                    {
                        "doctype": "Notification Log",
                        "subject": subject,
                        "email_content": message,
                        "for_user": user,
                        "type": "Alert",
                        "document_type": "Task",
                        "document_name": task.name,
                    }
                ).insert(ignore_permissions=True)

            except Exception:
                frappe.log_error(
                    title=f"Task notification failed: {task.name}",
                    message=frappe.get_traceback(),
                )

    except Exception:
        frappe.log_error(
            title=f"Task notification processing failed: {task_name}",
            message=frappe.get_traceback(),
        )


def _already_notified_users(task_name, users):
    """Return users who already have a notification for this task."""
    if not users:
        return set()

    rows = frappe.get_all(
        "Notification Log",
        filters={
            "document_type": "Task",
            "document_name": task_name,
            "for_user": ["in", list(users)],
        },
        pluck="for_user",
    )

    return set(rows)


def _add_reporting_manager(recipients, user):
    """Add the reporting manager of an assigned user, if any."""
    employee_name = frappe.db.get_value(
        "Employee",
        {"user_id": user, "status": "Active"},
        "name",
    )

    if not employee_name:
        return

    reports_to = frappe.db.get_value(
        "Employee",
        employee_name,
        "reports_to",
    )

    if not reports_to:
        return

    manager_user = frappe.db.get_value(
        "Employee",
        reports_to,
        "user_id",
    )

    add_enabled_user(recipients, manager_user)


def get_assigned_users(task):
    """Read assigned users from Task._assign."""
    assigned = task.get("_assign")

    if isinstance(assigned, str):
        try:
            assigned = json.loads(assigned)
        except (TypeError, ValueError):
            assigned = []

    if not isinstance(assigned, list):
        assigned = []

    return {
        user.strip()
        for user in assigned
        if isinstance(user, str) and user.strip()
    }


def add_enabled_user(recipients, user):
    """Add an enabled ERPNext user to the recipient set."""
    if not user or not isinstance(user, str):
        return

    enabled = frappe.db.get_value("User", user, "enabled")

    if cint(enabled):
        recipients.add(user)


def get_project_manager_user(project):
    """Resolve a Project Manager field to an ERPNext User."""
    meta = frappe.get_meta("Project")

    for fieldname in _project_manager_fields(meta):
        field = meta.get_field(fieldname)

        if not field:
            continue

        value = project.get(fieldname)

        if not value:
            continue

        if field.options == "User":
            return value

        if field.options == "Employee":
            return frappe.db.get_value("Employee", value, "user_id")

        user_exists = frappe.db.exists("User", value)
        if user_exists:
            return value

        employee_user = frappe.db.get_value(
            "Employee",
            value,
            "user_id",
        )

        if employee_user:
            return employee_user

    return None


def _project_manager_fields(meta):
    """Candidate Project fields that may hold the Project Manager."""
    fields = (
        "custom_project_lead",
        "project_manager",
        "custom_project_manager",
        "project_lead",
        "custom_hr_user",
    )

    return [f for f in fields if meta.get_field(f)]


def build_message(task, project):
    """Build a readable in-system notification."""
    description = frappe.utils.strip_html(
        task.get("description") or ""
    )

    parts = [
        f"A new Task has been created: {task.name}",
        f"Subject: {task.subject or task.name}",
        f"Project: {project.name}",
        f"Project Status: {project.status}",
    ]

    if task.get("exp_end_date"):
        parts.append(
            f"Expected End Date: {task.get('exp_end_date')}"
        )

    if description:
        parts.append(f"Description: {description[:500]}")

    return "\n".join(parts)

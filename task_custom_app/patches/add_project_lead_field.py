import frappe


def execute():
    """Add custom_project_lead (Link -> User) on Project.

    One project lead per project. The lead (e.g. Project Manager role
    user) sees all tasks under projects where they are the lead.
    """

    doctype = "Project"

    fields = [
        {
            "fieldname": "custom_task_management_section",
            "fieldtype": "Section Break",
            "label": "Task Management",
            "insert_after": "status",
        },
        {
            "fieldname": "custom_project_lead",
            "fieldtype": "Link",
            "label": "Project Lead",
            "options": "User",
            "insert_after": "custom_task_management_section",
            "description": (
                "User responsible for this project's tasks "
                "(Project Manager sees all tasks under this project)."
            ),
        },
    ]

    for field in fields:
        fieldname = field["fieldname"]

        existing = frappe.db.get_value(
            "Custom Field",
            {
                "dt": doctype,
                "fieldname": fieldname,
            },
            "name",
        )

        if existing:
            frappe.db.set_value(
                "Custom Field",
                existing,
                {
                    key: value
                    for key, value in field.items()
                    if key != "fieldname"
                },
            )
            print(f"Updated: {fieldname}")

        else:
            frappe.get_doc({
                "doctype": "Custom Field",
                "dt": doctype,
                **field,
            }).insert(ignore_permissions=True)

            print(f"Created: {fieldname}")

    frappe.clear_cache(doctype=doctype)
    print("Project Task Management fields updated.")

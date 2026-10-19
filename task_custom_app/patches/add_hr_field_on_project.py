import frappe


def execute():
    """Add custom_hr_user (Link -> User) on Project.

    Marks the HR person assigned to a project. Users with the
    HR Manager or HR User roles see all tasks under projects where
    they are the assigned HR (Project Lead field stays as-is).
    """

    doctype = "Project"

    field = {
        "fieldname": "custom_hr_user",
        "fieldtype": "Link",
        "label": "HR",
        "options": "User",
        "insert_after": "custom_project_lead",
        "description": (
            "HR assigned to this project. Users with the "
            "HR Manager / HR User roles see this project's tasks."
        ),
    }

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
    print("Project HR field updated.")

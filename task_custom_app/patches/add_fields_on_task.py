import frappe


def execute():
    doctype = "Task"

    fields = [
        {
            "fieldname": "task_management_details_section",
            "fieldtype": "Section Break",
            "label": "Task Management Details",
            "insert_after": "is_group",
        },
        {
            "fieldname": "custom_task_priority",
            "fieldtype": "Select",
            "label": "Task Priority",
            "options": (
                "\n"
                "Completed\n"
                "Important-Urgent\n"
                "Important-Not Urgent\n"
                "Not Important-Urgent\n"
                "Not Important-Not Urgent"
            ),
            "insert_after": "task_management_details_section",
        },
        {
            "fieldname": "task_action_column",
            "fieldtype": "Column Break",
            "insert_after": "custom_task_priority",
        },
        {
            "fieldname": "custom_action",
            "fieldtype": "Select",
            "label": "Action",
            "options": (
                "\n"
                "Bravo!!\n"
                "Schedule it\n"
                "Hold/Delete\n"
                "Delegate it\n"
                "Do it First"
            ),
            "insert_after": "task_action_column",
        },
        {
            "fieldname": "task_status_column",
            "fieldtype": "Column Break",
            "insert_after": "custom_action",
        },
        {
            "fieldname": "custom_task_status",
            "fieldtype": "Link",
            "label": "Task Status",
            "options": "Status",
            "insert_after": "task_status_column",
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
    print("Task Management Details layout updated.")
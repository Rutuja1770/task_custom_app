import frappe


def execute():
    fieldname = "custom_days"

    if not frappe.db.exists(
        "Custom Field",
        {"dt": "Task", "fieldname": fieldname}
    ):
        frappe.get_doc({
            "doctype": "Custom Field",
            "dt": "Task",
            "label": "Days",
            "fieldname": "custom_days",
            "fieldtype": "Int",
            "insert_after": "progress",
            "default": "0",
            "read_only": 1,
        }).insert(ignore_permissions=True)

    frappe.clear_cache(doctype="Task")
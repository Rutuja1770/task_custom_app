
import frappe


def execute():
    fieldname = "custom_delayed_by"

    if not frappe.db.exists(
        "Custom Field",
        {"dt": "Task", "fieldname": fieldname}
    ):
        frappe.get_doc({
            "doctype": "Custom Field",
            "dt": "Task",
            "label": "Delayed By",
            "fieldname": fieldname,
            "fieldtype": "Int",
            "insert_after": "expected_time",
            "read_only": 1,
            "default": 0,
        }).insert(ignore_permissions=True)

    frappe.clear_cache(doctype="Task")

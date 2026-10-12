import frappe


def execute():
    fieldname = "custom_customer"

    if not frappe.db.exists(
        "Custom Field",
        {"dt": "Task", "fieldname": fieldname}
    ):
        frappe.get_doc({
            "doctype": "Custom Field",
            "dt": "Task",
            "fieldname": "custom_customer",
            "label": "Customer",
            "fieldtype": "Link",
            "options": "Customer",
            "insert_after": "project",
        }).insert(ignore_permissions=True)

    frappe.clear_cache(doctype="Task")

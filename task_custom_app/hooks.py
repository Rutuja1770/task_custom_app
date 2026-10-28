app_name = "task_custom_app"
app_title = "Task Custom App"
app_publisher = "Assimilate"
app_description = "Task realted Customization"
app_email = "rutujasangar1770@gmail.com"
app_license = "mit"

after_migrate = [
    "task_custom_app.patches.add_two_fields_External_customer.execute",
    "task_custom_app.patches.add_delayed_by_field.execute",
    "task_custom_app.patches.add_days_field.execute",
    "task_custom_app.patches.add_fields_on_task.execute",
    "task_custom_app.patches.add_project_lead_field.execute",
    "task_custom_app.patches.add_hr_field_on_project.execute",
    "task_custom_app.patches.backfill_completed_by.execute",
]




doctype_js = {
    "Task": "public/js/task_custom.js",
    "Project": "public/js/project_custom.js"
}

doctype_list_js = {
    "Task": "public/js/list_visibility.js",
    "Project": "public/js/list_visibility.js",
}


doc_events = {
    "Task": {
        "after_insert": (
            "task_custom_app.integrations.task_notification.on_task_created"
        ),
        "before_save": (
            "task_custom_app.integrations.task_notification.on_task_save"
        ),
    },
    "ToDo": {
        "after_insert": (
            "task_custom_app.integrations.task_notification.on_todo_created"
        ),
    },
}
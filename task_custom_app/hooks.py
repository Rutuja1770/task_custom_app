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
    "task_custom_app.patches.add_fields_on_task.execute"
]




doctype_js = {
    "Task": "public/js/task_custom.js"
}

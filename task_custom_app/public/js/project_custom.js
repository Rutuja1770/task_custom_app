frappe.ui.form.on("Project", {
    setup(frm) {
        frm.set_query("custom_hr_user", function () {
            return {
                query:
                    "task_custom_app.task_custom_app.page.task_management.task_management.hr_user_query",
            };
        });
    },
});


frappe.ui.form.on("Task", {
    refresh(frm) {
        set_customer_field(frm);
        set_priority_from_status(frm);
        update_action(frm);
        calculate_days(frm);
        calculate_delay(frm);
    },

    status(frm) {
        set_priority_from_status(frm);
        update_action(frm);
        calculate_delay(frm);
    },

    project(frm) {
        set_customer_field(frm);
    },

    custom_task_priority(frm) {
        update_action(frm);
        calculate_delay(frm);
    },

    exp_start_date(frm) {
        calculate_days(frm);
    },

    exp_end_date(frm) {
        calculate_delay(frm);
    }
});


// ====================================
// Priority from Task Status
// ====================================

function set_priority_from_status(frm) {
    if (frm.doc.status === "Completed") {
        if (frm.doc.custom_task_priority !== "Completed") {
            frm.set_value("custom_task_priority", "Completed");
        }
    }
}

// ====================================
// Customer from External Project
// ====================================

function set_customer_field(frm) {
    if (!frm.doc.project) {
        frm.toggle_display("custom_customer", false);
        frm.set_value("custom_customer", "");
        return;
    }

    frappe.db.get_value(
        "Project",
        frm.doc.project,
        ["project_type", "customer"]
    ).then((r) => {
        if (!r || !r.message) {
            frm.toggle_display("custom_customer", false);
            frm.set_value("custom_customer", "");
            return;
        }

        const project = r.message;

        if (project.project_type === "External") {
            frm.toggle_display("custom_customer", true);
            frm.set_value(
                "custom_customer",
                project.customer || ""
            );
        } else {
            frm.toggle_display("custom_customer", false);
            frm.set_value("custom_customer", "");
        }
    });
}


// ====================================
// Action from Task Priority
// ====================================

function update_action(frm) {
    const action_map = {
        "Completed": "Bravo!!",
        "Important-Urgent": "Do it First",
        "Important-Not Urgent": "Schedule it",
        "Not Important-Urgent": "Delegate it",
        "Not Important-Not Urgent": "Hold/Delete"
    };

    frm.set_value(
        "custom_action",
        action_map[frm.doc.custom_task_priority] || ""
    );
}




function get_calendar_date_diff(date1, date2) {
    if (!date1 || !date2) {
        return 0;
    }

    // Use only the YYYY-MM-DD part, ignoring time.
    const firstDate = String(date1).split(" ")[0];
    const secondDate = String(date2).split(" ")[0];

    const [y1, m1, d1] = firstDate.split("-").map(Number);
    const [y2, m2, d2] = secondDate.split("-").map(Number);

    const first = Date.UTC(y1, m1 - 1, d1);
    const second = Date.UTC(y2, m2 - 1, d2);

    return Math.round((first - second) / 86400000);
}


// Days = Today - Expected Start Date
function calculate_days(frm) {
    if (!frm.doc.exp_start_date) {
        frm.set_value("custom_days", 0);
        return;
    }

    const today = frappe.datetime.get_today();

    const days = get_calendar_date_diff(
        today,
        frm.doc.exp_start_date
    );

    frm.set_value("custom_days", Math.max(0, days));
}


// Delayed By = Today - Expected End Date
function calculate_delay(frm) {
    if (
        frm.doc.custom_task_priority === "Completed" ||
        !frm.doc.exp_end_date
    ) {
        frm.set_value("custom_delayed_by", 0);
        return;
    }

    const today = frappe.datetime.get_today();

    const delay = get_calendar_date_diff(
        today,
        frm.doc.exp_end_date
    );

    frm.set_value("custom_delayed_by", Math.max(0, delay));
}


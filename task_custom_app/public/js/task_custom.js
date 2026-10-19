
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



// ====================================
// Assignment Timeline Conflict Warning
// ====================================
// When a user is newly assigned to this Task, check whether that user
// already has another task assigned whose exp_start_date..exp_end_date
// overlaps THIS task's timeline. Shows a message with the already
// assigned task's subject — assignment is never blocked and the
// existing exp_start_date / exp_end_date logic is untouched.

function check_assignment_timeline_conflict(frm, new_users) {
    try {
        const start = frm.doc.exp_start_date;
        const end = frm.doc.exp_end_date;

        if (!start || !end || !frm.doc.name || !new_users.length) {
            return;
        }

        frappe.db
            .get_list("Task", {
                filters: {
                    name: ["!=", frm.doc.name],
                    exp_start_date: ["<=", end],
                    exp_end_date: [">=", start]
                },
                or_filters: new_users.map(function (user) {
                    return ["_assign", "like", "%" + user + "%"];
                }),
                fields: [
                    "name",
                    "subject",
                    "exp_start_date",
                    "exp_end_date",
                    "_assign"
                ],
                limit: 100
            })
            .then(function (rows) {
                const lines = [];

                (rows || []).forEach(function (row) {
                    let assigned = [];

                    try {
                        assigned = JSON.parse(row._assign || "[]");
                    } catch (e) {
                        assigned = [];
                    }

                    if (!Array.isArray(assigned)) {
                        return;
                    }

                    new_users.forEach(function (user) {
                        if (assigned.indexOf(user) === -1) {
                            return;
                        }

                        const subject = frappe.utils.escape_html(
                            row.subject || row.name
                        );
                        const who = frappe.utils.escape_html(user);
                        const from = frappe.utils.escape_html(
                            format_task_date(row.exp_start_date)
                        );
                        const to = frappe.utils.escape_html(
                            format_task_date(row.exp_end_date)
                        );

                        lines.push(
                            __(
                                '{0} is already assigned to task "{1}" ({2} to {3}) for this timeline.',
                                [who, subject, from, to]
                            )
                        );
                    });
                });

                if (lines.length) {
                    frappe.msgprint({
                        title: __("Already Assigned"),
                        indicator: "orange",
                        message: lines.join("<br>")
                    });
                }
            })
            .catch(function () {
                // Silent — never break the assignment flow.
            });
    } catch (e) {
        console.error("Assignment timeline check failed", e);
    }
}


function format_task_date(value) {
    const raw = (value || "").substring(0, 10);

    if (!raw) {
        return "-";
    }

    try {
        return frappe.datetime.str_to_user(raw) || raw;
    } catch (e) {
        return raw;
    }
}


// Wrap the form sidebar assignment renderer once. We diff the assignee
// list between renders: the first render is only a baseline (no warning
// on form load); later renders warn for newly added users only.
function patch_assign_render_for_timeline_check() {
    const proto =
        frappe.ui.form.AssignTo && frappe.ui.form.AssignTo.prototype;

    if (!proto || proto.__timeline_conflict_patched) {
        return;
    }

    const original_render = proto.render;

    proto.render = function (assignments) {
        original_render.apply(this, arguments);

        try {
            if (!this.frm || this.frm.doctype !== "Task") {
                return;
            }

            const current = (assignments || [])
                .map(function (item) {
                    return typeof item === "string" ? item : item.owner;
                })
                .filter(Boolean);

            const previous = this.__timeline_seen_assignees;

            if (!Array.isArray(previous)) {
                this.__timeline_seen_assignees = current;
                return;
            }

            const added = current.filter(function (user) {
                return previous.indexOf(user) === -1;
            });

            this.__timeline_seen_assignees = current;

            if (added.length) {
                check_assignment_timeline_conflict(this.frm, added);
            }
        } catch (e) {
            console.error("Timeline assignment check failed", e);
        }
    };

    proto.__timeline_conflict_patched = true;
}

// Patch as soon as this doctype script loads; onload is a safe fallback.
patch_assign_render_for_timeline_check();

frappe.ui.form.on("Task", {
    onload: function () {
        patch_assign_render_for_timeline_check();
    }
});

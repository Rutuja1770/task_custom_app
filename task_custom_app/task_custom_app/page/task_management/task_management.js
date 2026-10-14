

function can_view_all_tasks() {
    const roles = frappe.user_roles || [];
    return roles.includes("Task Manager");
}




frappe.pages["task-management"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Task Management",
        single_column: true
    });

    const $main = $(page.main);
    $main.empty();
    $main.html(`<div class="enterprise-layout">
        <div class="enterprise-layout">
            <aside class="custom-sidebar">
                <div class="sidebar-logo">
                    <h3>📋 Task Management</h3>
                </div>

                <div class="sidebar-menu">
                    <div class="menu-item active" id="dashboard-link">
                        📊 Dashboard
                    </div>
                    <div class="menu-item" id="my-task-link">
                        ✅ My Tasks
                    </div>
                    ${can_view_all_tasks() ? `
                        <div class="menu-item" id="all-task-link">
                            📋 All Tasks
                        </div>
                    ` : ""}
                    <div class="menu-item" id="project-link">
                        📁 Projects
                    </div>
                    <div class="menu-item" id="settings-link">
                        ⚙️ Settings
                    </div>
                </div>
            </aside>

            <main class="enterprise-dashboard">
                <div class="top-header">
                    <div>
                        <h2>Task Dashboard 👋</h2>
                        <p>Monitor tasks, priorities and deadlines.</p>
                    </div>

                    <div class="top-actions">
                        <button class="btn btn-default" id="refresh-dashboard">
                            🔄 Refresh
                        </button>
                        <button class="btn btn-primary" id="new-task-btn">
                            + New Task
                        </button>
                    </div>
                </div>
                
                <div class="kpi-grid">
                    <div class="kpi-card purple" data-kpi="total" role="button" tabindex="0">
                        <h5>📋 Total Tasks</h5>
                        <h2 id="total-tasks">0</h2>
                    </div>

                    <div class="kpi-card orange" data-kpi="overdue" role="button" tabindex="0">
                        <h5>⏰ Overdue Tasks</h5>
                        <h2 id="overdue-tasks">0</h2>
                    </div>

                    <div class="kpi-card red" data-kpi="critical" role="button" tabindex="0">
                        <h5>🚨 Critical Tasks</h5>
                        <h2 id="critical-tasks">0</h2>
                    </div>

                    <div class="kpi-card green" data-kpi="completed" role="button" tabindex="0">
                        <h5>✅ Completed Tasks</h5>
                        <h2 id="completed-tasks">0</h2>
                    </div>
                </div>


                <div class="dashboard-row">
                    <section class="dashboard-panel">
                        <div class="panel-header">
                            <h4>⚠️ Tasks By Delay Range</h4>
                            <select id="delay-filter" class="form-control">
                                <option value="All">All Ranges</option>
                                <option value="0-5 Days">1–5 Days</option>
                                <option value="5-10 Days">6–10 Days</option>
                                <option value="10-15 Days">11–14 Days</option>
                                <option value="15+ Days">15+ Days</option>
                            </select>
                        </div>
                        <div id="delay-chart"></div>
                    </section>

                    <section class="dashboard-panel">
                        <div class="panel-header">
                            <h4>🎯 Upcoming Deadlines</h4>
                            <select id="deadline-filter" class="form-control">
                                <option value="7">Next 7 Days</option>
                                <option value="15">Next 15 Days</option>
                                <option value="30">Next 30 Days</option>
                            </select>
                        </div>
                        <div id="deadline-chart"></div>
                    </section>
                </div>

                <div class="dashboard-row bottom-row">
                    <section class="dashboard-panel">
                        <h4>🚨 Delayed Tasks</h4>
                        <div id="delay-list"></div>
                    </section>

                    <section class="dashboard-panel">
                        <h4>📅 Upcoming Deadlines</h4>
                        <div id="upcoming-list"></div>
                    </section>

                    <section class="dashboard-panel">
                        <h4>🎯 Tasks by Priority</h4>
                        <div id="priority-chart"></div>
                    </section>
                </div>
            </main>
        </div>
        `);

    // Keep all events scoped to this page.
    $main.on("click", "#refresh-dashboard", function () {
        refresh_dashboard();
        frappe.show_alert({
            message: "Dashboard refreshed",
            indicator: "green"
        });
    });

    $main.on("click", "#new-task-btn", function () {
        frappe.new_doc("Task");
    });

    
    // MY TASKS
    $main.on("click", "#my-task-link", function () {
        frappe.route_options = {
            assigned_to: frappe.session.user
        };

        frappe.set_route("List", "Task", "List");

        setTimeout(() => {
            const lv = window.cur_list;

            if (lv && lv.filter_area) {
                lv.filter_area.clear();
                lv.filter_area.add([
                    ["Task", "status", "not in", ["Completed", "Cancelled"]],
                    ["Task", "_assign", "like", "%" + frappe.session.user + "%"]
                ]);
            }
        }, 800);
    });

    // ALL TASKS
   
    $main.on("click", "#all-task-link", function () {

        // Extra client-side role check
        if (!can_view_all_tasks()) {
            frappe.msgprint(
                "You are not permitted to view All Tasks."
            );
            return;
        }

        frappe.route_options = null;
        frappe.set_route("List", "Task", "List");

        setTimeout(() => {
            const lv = window.cur_list;

            if (lv && lv.filter_area) {
                lv.filter_area.clear();
            }
        }, 800);
    });


    // My Tasks: open a fresh list with only the current user's tasks
    // $main.on("click", "#my-task-link", function () {
    //     frappe.route_options = null;

    //     window.location.href =
    //         "/desk/task?assigned_to=" +
    //         encodeURIComponent(frappe.session.user);
    // });

    // // All Tasks: open a fresh, unfiltered Task List
    // $main.on("click", "#all-task-link", function () {
    //     frappe.route_options = null;
    //     window.location.href = "/desk/task";
    // });

    $main.on("click", "#dashboard-link", function () {
        frappe.set_route("task-management");
    });

    $main.on("click", "#project-link", function () {
        frappe.set_route("List", "Project");
    });

    // Settings: retain your existing destination for now
    $main.on("click", "#settings-link", function () {
        frappe.route_options = null;
        window.location.href = "/desk/task";
    });


    $main.on("change", "#delay-filter", function () {
        const range = $(this).val();
        load_delay_chart(range);
        load_delay_list(range);
    });

    $main.on("change", "#deadline-filter", function () {
        const days = $(this).val();
        load_deadline_chart(days);
        load_upcoming_list(days);
    });

    $main.on("click", ".task-link, .upcoming-task-link", function () {
        const task_name = $(this).attr("data-task");
        if (task_name) {
            frappe.set_route("Form", "Task", task_name);
        }
    });

  
  // KPI cards
    $main.on("click", ".kpi-card", function () {
        open_tasks_by_kpi($(this).attr("data-kpi"));
    });

    $main.on("keydown", ".kpi-card", function (e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open_tasks_by_kpi($(this).attr("data-kpi"));
        }
    });


    refresh_dashboard();
};


function refresh_dashboard() {
    load_dashboard_data();
    load_delay_chart($("#delay-filter").val() || "All");
    load_deadline_chart($("#deadline-filter").val() || 7);
    load_delay_list($("#delay-filter").val() || "All");
    load_upcoming_list($("#deadline-filter").val() || 7);
    load_priority_chart();
}


const TASK_API =
    "task_custom_app.task_custom_app.page.task_management.task_management";


function call_task_api(method, args, callback) {
    frappe.call({
        method: `${TASK_API}.${method}`,
        args: args || {},
        callback: function (r) {
            if (r.exc) {
                console.error(`Task dashboard error: ${method}`, r.exc);
                return;
            }

            callback(r.message);
        }
    });
}


function load_dashboard_data() {
    call_task_api("get_dashboard_data", {}, function (data) {
        if (!data) return;

        $("#total-tasks").text(data.total_tasks || 0);
        $("#overdue-tasks").text(data.overdue_tasks || 0);
        $("#critical-tasks").text(data.critical_tasks || 0);
        $("#completed-tasks").text(data.completed_tasks || 0);
    });
}


function load_delay_chart(delay_range = "All") {
    call_task_api(
        "get_delay_chart_data",
        { delay_range: delay_range },
        function (data) {
            if (!data) return;

            const labels = [
                "0-5 Days",
                "5-10 Days",
                "10-15 Days",
                "15+ Days"
            ];

            $("#delay-chart").empty();

            new frappe.Chart("#delay-chart", {
                data: {
                    labels: labels,
                    datasets: [{
                        name: "Delayed Tasks",
                        values: labels.map(label => data[label] || 0)
                    }]
                },
                type: "bar",
                height: 280,
                colors: [
					"#9AD9A5", // Soft green — 0–5 Days
					"#FFC857", // Warm amber — 5–10 Days
					"#FF9559", // Soft orange — 10–15 Days
					"#F47791"  // Soft coral pink — 15+ Days
				],
                barOptions: {
                    spaceRatio: 0.35
                }
            });
        }
    );
}


function load_deadline_chart(days = 7) {
    call_task_api(
        "get_deadline_chart_data",
        { days: Number(days) },
        function (tasks) {
            tasks = tasks || [];

            $("#deadline-chart").empty();

            if (!tasks.length) {
                $("#deadline-chart").html(
                    "<p>No upcoming deadlines found.</p>"
                );
                return;
            }

            const labels = tasks.map(task => task.task_name || task.name);
            const values = tasks.map(task =>
                Math.max(0, Number(task.days_remaining) || 0)
            );

            new frappe.Chart("#deadline-chart", {
                data: {
                    labels: labels,
                    datasets: [{
                        name: "Days Remaining",
                        values: values
                    }]
                },
                type: "bar",
                height: 280,
                colors: [
					"#6366F1", // Indigo
					"#14B8A6", // Teal
					"#F59E0B", // Amber
					"#F87171"  // Coral
				],
                barOptions: {
                    spaceRatio: 0.35
                }
            });
        }
    );
}


function load_delay_list(delay_range = "All") {
    call_task_api(
        "get_delayed_tasks",
        { delay_range: delay_range },
        function (tasks) {
            tasks = tasks || [];

            const html = tasks.map(task => `
                <div class="task-item task-link"
                     data-task="${frappe.utils.escape_html(task.name)}">
                    <div>
                        <strong>${frappe.utils.escape_html(task.task_name || task.name)}</strong>
                        <br>
                        <small>${frappe.utils.escape_html(task.name)}</small>
                    </div>
                    <div class="text-danger">
                        ${Number(task.delayed_by) || 0} Days
                    </div>
                </div>
            `).join("");

            $("#delay-list").html(
                html || "<p>No delayed tasks found.</p>"
            );
        }
    );
}


function load_upcoming_list(days = 7) {
    call_task_api(
        "get_upcoming_tasks",
        { days: Number(days) },
        function (tasks) {
            tasks = tasks || [];

            const html = tasks.map(task => `
                <div class="task-item upcoming-task-link"
                     data-task="${frappe.utils.escape_html(task.name)}">
                    <div>
                        <strong>${frappe.utils.escape_html(task.task_name || task.name)}</strong>
                        <br>
                        <small>${frappe.utils.escape_html(task.name)}</small>
                    </div>
                    <div class="text-success">
                        ${Number(task.days_remaining) || 0} Days Left
                    </div>
                </div>
            `).join("");

            $("#upcoming-list").html(
                html || "<p>No upcoming tasks found.</p>"
            );
        }
    );
}

function load_priority_chart() {
    const labels = [
        "Important-Urgent",
        "Important-Not Urgent",
        "Not Important-Urgent",
        "Not Important-Not Urgent"
    ];

    const colors = [
        "#ed4d4d", // Soft green — 0–5 Days
		"#58e6d8", // Warm amber — 5–10 Days
		"#FF9559", // 
		"#F47791"  
    ];

    call_task_api("get_priority_data", {}, function (rows) {
        rows = rows || [];

        const priority_map = {};
        labels.forEach(label => {
            priority_map[label] = 0;
        });

        rows.forEach(row => {
            const priority = row.custom_task_priority;

            if (Object.prototype.hasOwnProperty.call(priority_map, priority)) {
                priority_map[priority] += Number(row.count) || 0;
            }
        });

        const values = labels.map(label => priority_map[label]);

        $("#priority-chart").empty();
        $("#priority-legend").remove();

        const chartContainer = $("#priority-chart");

        if (values.every(value => value === 0)) {
            chartContainer.html(`
                <div style="text-align:center;padding:55px 10px;color:#64748b;">
                    No priority data available
                </div>
            `);
            return;
        }

        new frappe.Chart("#priority-chart", {
            data: {
                labels: labels,
                datasets: [{
                    name: "Tasks",
                    values: values
                }]
            },
            type: "donut",
            height: 250,
            colors: colors,
            showLegend: false
        });

        const legendHtml = labels.map((label, index) => `
            <div class="priority-legend-item">
                <span class="priority-legend-dot"
                      style="background:${colors[index]}"></span>
                <span class="priority-legend-label">${label}</span>
                <span class="priority-legend-count">
                    ${values[index]}
                </span>
            </div>
        `).join("");

        chartContainer.after(`
            <div id="priority-legend" class="priority-legend">
                ${legendHtml}
            </div>
        `);
    });
}



function open_tasks_by_kpi(kpiType) {
    if (kpiType === "total") {
        // Clear route filters
        frappe.route_options = null;

        // Navigate to the Task List
        frappe.set_route("List", "Task", "List");

        // Clear any filters retained by the Task List
        setTimeout(() => {
            const lv = window.cur_list;

            if (lv && lv.filter_area) {
                lv.filter_area.clear();
            }
        }, 800);

        return;
    }

    let filters = {};

    if (kpiType === "overdue") {
        filters = {
            status: ["not in", ["Completed", "Cancelled"]],
            custom_delayed_by: [">", 0]
        };
    } else if (kpiType === "critical") {
        filters = {
            status: ["not in", ["Completed", "Cancelled"]],
            custom_delayed_by: [">=", 15]
        };
    } else if (kpiType === "completed") {
        filters = {
            status: "Completed"
        };
    }

    frappe.route_options = filters;
    frappe.set_route("List", "Task", "List");
}








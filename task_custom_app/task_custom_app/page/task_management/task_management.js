const TASK_API =
    "task_custom_app.task_custom_app.page.task_management.task_management";

const TASK_PAGE_SIZE = 15;

let dashboard_context = {
    user: "",
    scope_label: "My",
    can_view_all: false,
    can_view_team: false
};

const table_state = {
    tab: "my",
    kpi_view: "",
    limit: TASK_PAGE_SIZE,
    offset: 0
};


function can_view_all_tasks() {
    if (dashboard_context && typeof dashboard_context.can_view_all === "boolean") {
        return dashboard_context.can_view_all;
    }

    const roles = frappe.user_roles || [];
    return roles.includes("Task Manager") || roles.includes("Main Manager");
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
                    <div class="menu-item" id="team-task-link" hidden>
                        👥 Team Tasks
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
                <div class="dashboard-heading">
                    <h2>Task Dashboard 👋</h2>
                    <p>Monitor tasks, priorities and deadlines.</p>
                </div>

                        <div class="top-actions">
                            <button class="btn btn-default" id="toggle-dashboard-filters"
                                    type="button" aria-expanded="false">
                                <span class="filter-button-icon">▼</span>
                                Filters
                                <span id="active-filter-count" class="filter-count" hidden>0</span>
                            </button>

                            <button class="btn btn-default" id="refresh-dashboard" type="button">
                                🔄 Refresh
                            </button>

                            <button class="btn btn-primary" id="new-task-btn" type="button">
                                + New Task
                            </button>
                        </div>
                    </div>

                    <!-- Collapsible dashboard filters -->
                    <div class="filter-toolbar">
                        <div id="dashboard-filter-panel" class="dashboard-filter-panel" hidden>
                            <div class="filter-panel-header">
                                <div>
                                    <h4>Filter Tasks</h4>
                                    <p>Choose filters to update dashboard data.</p>
                                </div>

                                <button type="button" class="btn btn-default btn-xs"
                                        id="clear-dashboard-filters">
                                    Clear
                                </button>
                            </div>

                            <div class="dashboard-filters">
                                <div class="filter-group">
                                    <label for="filter-project">Project</label>
                                    <select id="filter-project" class="form-control">
                                        <option value="">All Projects</option>
                                    </select>
                                </div>

                                <div class="filter-group">
                                    <label for="filter-employee">Employee</label>
                                    <select id="filter-employee" class="form-control">
                                        <option value="">All Employees</option>
                                    </select>
                                </div>

                                <div class="filter-group">
                                    <label for="filter-status">Status</label>
                                    <select id="filter-status" class="form-control">
                                        <option value="">All Statuses</option>
                                    </select>
                                </div>

                                <div class="filter-group">
                                    <label for="filter-priority">Priority</label>
                                    <select id="filter-priority" class="form-control">
                                        <option value="">All Priorities</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>


                <div class="kpi-grid">
                    <div class="kpi-card purple" data-kpi="total" role="button" tabindex="0">
                        <h5 id="kpi-total-label">📋 Total Tasks</h5>
                        <h2 id="total-tasks">0</h2>
                    </div>

                    <div class="kpi-card orange" data-kpi="overdue" role="button" tabindex="0">
                        <h5 id="kpi-overdue-label">⏰ Overdue Tasks</h5>
                        <h2 id="overdue-tasks">0</h2>
                    </div>

                    <div class="kpi-card red" data-kpi="critical" role="button" tabindex="0">
                        <h5 id="kpi-critical-label">🚨 Critical Tasks</h5>
                        <h2 id="critical-tasks">0</h2>
                    </div>

                    <div class="kpi-card green" data-kpi="completed" role="button" tabindex="0">
                        <h5 id="kpi-completed-label">✅ Completed Tasks</h5>
                        <h2 id="completed-tasks">0</h2>
                    </div>
                </div>


                <div class="dashboard-row">
                    <section class="dashboard-panel">
                        <div class="panel-header">
                            <h4>⚠️ Tasks By Delay Range</h4>
                            <select id="delay-filter" class="form-control">
                                <option value="All">All Ranges</option>
                                <option value="1-5 Days">1–5 Days</option>
                                <option value="6-10 Days">6–10 Days</option>
                                <option value="11-14 Days">11–14 Days</option>
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

                <section class="dashboard-panel task-table-panel">
                    <div class="panel-header">
                        <h4 id="task-table-title">📑 Tasks</h4>
                        <span id="table-range" class="table-range">Showing 0–0 of 0</span>
                    </div>

                    <div class="task-tabs" id="task-tabs" role="tablist">
                        <button class="task-tab active" data-tab="my"
                                type="button" role="tab">
                            ✅ My Tasks
                        </button>
                        <button class="task-tab" data-tab="team" id="team-tab"
                                type="button" role="tab" hidden>
                            👥 Team Tasks
                        </button>
                        <button class="task-tab" data-tab="all" id="all-tab"
                                type="button" role="tab" hidden>
                            📋 All Tasks
                        </button>
                    </div>

                    <div class="table-scroll">
                        <table class="task-table">
                            <thead>
                                <tr>
                                    <th>Task</th>
                                    <th>Status</th>
                                    <th>Priority</th>
                                    <th>Action</th>
                                    <th>Delayed</th>
                                    <th>End Date</th>
                                    <th>Project</th>
                                    <th>Assigned To</th>
                                </tr>
                            </thead>
                            <tbody id="task-table-body">
                                <tr>
                                    <td colspan="8" class="table-empty">
                                        Loading…
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div class="table-pagination">
                        <button class="btn btn-default btn-xs" id="table-prev"
                                type="button">
                            ← Prev
                        </button>
                        <span id="table-page-info">Page 1</span>
                        <button class="btn btn-default btn-xs" id="table-next"
                                type="button">
                            Next →
                        </button>
                    </div>
                </section>
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


    // Show / hide all dashboard filters
    $main.on("click", "#toggle-dashboard-filters", function () {
        const $panel = $("#dashboard-filter-panel");
        const $button = $(this);
        const isOpening = $panel.prop("hidden");

        $panel.prop("hidden", !isOpening);

        $button.attr("aria-expanded", String(isOpening));
        $button.find(".filter-button-icon").text(
            isOpening ? "▲" : "▼"
        );

        $button.toggleClass("filters-open", isOpening);
    });

    // Clear all four filters
    $main.on("click", "#clear-dashboard-filters", function () {
        $("#filter-project").val("");
        $("#filter-employee").val("");
        $("#filter-status").val("");
        $("#filter-priority").val("");

        table_state.offset = 0;

        refresh_dashboard();
        update_active_filter_count();

        frappe.show_alert({
            message: "Dashboard filters cleared",
            indicator: "green"
        });
    });


    $main.on("click", "#new-task-btn", function () {
        frappe.new_doc("Task");
    });


    // MY TASKS — in-page table tab
    $main.on("click", "#my-task-link", function () {
        switch_task_tab("my");
    });

    // TEAM TASKS — in-page table tab
    $main.on("click", "#team-task-link", function () {
        switch_task_tab("team");
    });

    // ALL TASKS — role-gated in-page table tab
    $main.on("click", "#all-task-link", function () {
        if (!can_view_all_tasks()) {
            frappe.msgprint(
                "You are not permitted to view All Tasks."
            );
            return;
        }

        switch_task_tab("all");
    });


    $main.on("click", "#dashboard-link", function () {
        frappe.set_route("task-management");
    });

    $main.on("click", "#project-link", function () {
        frappe.set_route("List", "Project");
    });

    // Settings: retain existing destination
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


    // Refresh dashboard whenever a filter changes
    $main.on(
        "change",
        "#filter-project, #filter-employee, #filter-status, #filter-priority",
        function () {
            table_state.offset = 0;
            refresh_dashboard();
            update_active_filter_count();
        }
    );


    $main.on("click", ".task-link, .upcoming-task-link", function () {
        const task_name = $(this).attr("data-task");
        if (task_name) {
            frappe.set_route("Form", "Task", task_name);
        }
    });


    // KPI cards → filter the in-page task table (no route change)
    $main.on("click", ".kpi-card", function () {
        open_tasks_by_kpi($(this).attr("data-kpi"));
    });

    $main.on("keydown", ".kpi-card", function (e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open_tasks_by_kpi($(this).attr("data-kpi"));
        }
    });


    // Task table: tabs
    $main.on("click", "#task-tabs .task-tab", function () {
        if ($(this).prop("hidden")) {
            return;
        }

        switch_task_tab($(this).attr("data-tab"));
    });

    // Task table: pagination
    $main.on("click", "#table-prev", function () {
        table_state.offset = Math.max(
            0,
            table_state.offset - table_state.limit
        );
        load_task_table();
    });

    $main.on("click", "#table-next", function () {
        table_state.offset += table_state.limit;
        load_task_table();
    });

    // Task table: row → open form
    $main.on("click", ".task-row", function () {
        const task_name = $(this).attr("data-task");
        if (task_name) {
            frappe.set_route("Form", "Task", task_name);
        }
    });

    load_dashboard_filter_options();

    load_dashboard_context(function () {
        refresh_dashboard();
    });
};


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


// =========================================================
// ROLE CONTEXT
// =========================================================


function load_dashboard_context(done) {
    call_task_api("get_dashboard_context", {}, function (ctx) {
        if (ctx) {
            dashboard_context = ctx;
        }

        apply_dashboard_context();
        done && done();
    });
}


function apply_dashboard_context() {
    const label = dashboard_context.scope_label || "My";

    $("#kpi-total-label").text(`📋 ${label} Tasks`);
    $("#kpi-overdue-label").text(`⏰ ${label} Overdue`);
    $("#kpi-critical-label").text(`🚨 ${label} Critical`);
    $("#kpi-completed-label").text(`✅ ${label} Completed`);

    if (dashboard_context.can_view_team) {
        $("#team-tab").prop("hidden", false);
        $("#team-task-link").prop("hidden", false);
    }

    if (dashboard_context.can_view_all) {
        $("#all-tab").prop("hidden", false);
    }

    // Default tab by role
    if (dashboard_context.can_view_all) {
        table_state.tab = "all";
    } else if (dashboard_context.can_view_team) {
        table_state.tab = "team";
    } else {
        table_state.tab = "my";
    }

    table_state.offset = 0;
    sync_tab_ui();
}


function switch_task_tab(tab) {
    if (tab === "all" && !can_view_all_tasks()) {
        frappe.msgprint("You are not permitted to view All Tasks.");
        return;
    }

    if (tab === "team" && !dashboard_context.can_view_team) {
        frappe.msgprint("Team tasks are not available for your role.");
        return;
    }

    table_state.tab = tab;
    table_state.kpi_view = "";
    table_state.offset = 0;

    sync_tab_ui();
    update_task_table_title();
    load_task_table();
    scroll_to_task_table();
}


function sync_tab_ui() {
    $("#task-tabs .task-tab").removeClass("active");
    $(`#task-tabs .task-tab[data-tab="${table_state.tab}"]`)
        .addClass("active");
}


function update_task_table_title() {
    const view = table_state.kpi_view;
    const tab = table_state.tab;

    let title = "📑 Tasks";

    if (view === "overdue") {
        title = "📑 Overdue Tasks";
    } else if (view === "critical") {
        title = "📑 Critical Tasks";
    } else if (view === "completed") {
        title = "📑 Completed Tasks";
    } else if (tab === "my") {
        title = "📑 My Tasks";
    } else if (tab === "team") {
        title = "📑 Team Tasks";
    } else if (tab === "all") {
        title = "📑 All Tasks";
    }

    $("#task-table-title").text(title);
}


function scroll_to_task_table() {
    const el = document.querySelector(".task-table-panel");
    if (el && el.scrollIntoView) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}


// =========================================================
// DASHBOARD REFRESH
// =========================================================


function refresh_dashboard() {
    load_dashboard_data();

    load_delay_chart($("#delay-filter").val() || "All");
    load_deadline_chart($("#deadline-filter").val() || 7);
    load_delay_list($("#delay-filter").val() || "All");
    load_upcoming_list($("#deadline-filter").val() || 7);
    load_priority_chart();
    load_task_table();
}


function load_dashboard_data() {
    call_task_api(
        "get_dashboard_data",
        get_dashboard_filters(),
        function (data) {
            if (!data) return;

            $("#total-tasks").text(data.total_tasks || 0);
            $("#overdue-tasks").text(data.overdue_tasks || 0);
            $("#critical-tasks").text(data.critical_tasks || 0);
            $("#completed-tasks").text(data.completed_tasks || 0);
        }
    );
}


// =========================================================
// CHARTS
// =========================================================


function load_delay_chart(delay_range = "All") {
    call_task_api(
        "get_delay_chart_data",
        {
            ...get_dashboard_filters(),
            delay_range: delay_range
        },
        function (data) {
            if (!data) return;

            const labels = [
                "1-5 Days",
                "6-10 Days",
                "11-14 Days",
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
                    "#9AD9A5",
                    "#FFC857",
                    "#FF9559",
                    "#F47791"
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
        {
            ...get_dashboard_filters(),
            days: Number(days)
        },
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
                    "#6366F1",
                    "#14B8A6",
                    "#F59E0B",
                    "#F87171"
                ],
                barOptions: {
                    spaceRatio: 0.35
                }
            });
        }
    );
}


function load_priority_chart() {
    const labels = [
        "Important-Urgent",
        "Important-Not Urgent",
        "Not Important-Urgent",
        "Not Important-Not Urgent",
        "Unassigned"
    ];

    const colors = [
        "#ed4d4d",
        "#58e6d8",
        "#FF9559",
        "#F47791",
        "#94A3B8"
    ];

    call_task_api(
        "get_priority_data",
        get_dashboard_filters(),
        function (rows) {
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
        }
    );
}


// =========================================================
// TASK LISTS
// =========================================================


function load_delay_list(delay_range = "All") {
    call_task_api(
        "get_delayed_tasks",
        {
            ...get_dashboard_filters(),
            delay_range: delay_range
        },
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
        {
            ...get_dashboard_filters(),
            days: Number(days)
        },
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


// =========================================================
// KPI → IN-PAGE TASK TABLE
// =========================================================


function open_tasks_by_kpi(kpiType) {
    table_state.kpi_view = (kpiType === "total") ? "" : (kpiType || "");
    table_state.offset = 0;

    update_task_table_title();
    load_task_table();
    scroll_to_task_table();
}


// =========================================================
// TASK TABLE
// =========================================================


function load_task_table() {
    const args = {
        ...get_dashboard_filters(),
        tab: table_state.tab,
        kpi_view: table_state.kpi_view,
        limit: table_state.limit,
        offset: table_state.offset
    };

    call_task_api("get_task_list_data", args, function (data) {
        if (!data) return;

        const rows = data.rows || [];
        const total = Number(data.total) || 0;
        const limit = Number(data.limit) || table_state.limit;
        const offset = Number(data.offset) || 0;

        table_state.limit = limit;
        table_state.offset = offset;

        const start = total === 0 ? 0 : offset + 1;
        const end = Math.min(offset + limit, total);
        $("#table-range").text(`Showing ${start}–${end} of ${total}`);

        const page = Math.floor(offset / limit) + 1;
        const pages = Math.max(1, Math.ceil(total / limit));
        $("#table-page-info").text(`Page ${page} of ${pages}`);
        $("#table-prev").prop("disabled", offset <= 0);
        $("#table-next").prop("disabled", offset + limit >= total);

        if (!rows.length) {
            $("#task-table-body").html(`
                <tr>
                    <td colspan="8" class="table-empty">
                        No tasks found.
                    </td>
                </tr>
            `);
            return;
        }

        const html = rows.map(task => {
            const delayed = Number(task.delayed_by) || 0;

            return `
                <tr class="task-row"
                    data-task="${frappe.utils.escape_html(task.name)}">
                    <td>
                        <strong>${frappe.utils.escape_html(task.task_name || task.name)}</strong>
                        <br>
                        <small>${frappe.utils.escape_html(task.name)}</small>
                    </td>
                    <td>
                        <span class="table-badge badge-status">
                            ${frappe.utils.escape_html(task.status || "—")}
                        </span>
                    </td>
                    <td>
                        ${frappe.utils.escape_html(
                            task.custom_task_priority || task.priority || "—"
                        )}
                    </td>
                    <td>
                        ${frappe.utils.escape_html(task.custom_action || "—")}
                    </td>
                    <td class="${delayed > 0 ? "text-danger" : ""}">
                        ${delayed} d
                    </td>
                    <td>
                        ${frappe.utils.escape_html(task.exp_end_date || "—")}
                    </td>
                    <td>
                        ${frappe.utils.escape_html(task.project || "—")}
                    </td>
                    <td>
                        ${frappe.utils.escape_html(parse_assign(task._assign))}
                    </td>
                </tr>
            `;
        }).join("");

        $("#task-table-body").html(html);
    });
}


function parse_assign(raw) {
    try {
        const list = JSON.parse(raw || "[]");

        if (Array.isArray(list) && list.length) {
            return list
                .map(user_id => String(user_id).split("@")[0])
                .join(", ");
        }
    } catch (e) {
        // fall through
    }

    return "—";
}


// =========================================================
// FILTER OPTIONS
// =========================================================


function load_dashboard_filter_options() {
    // Project filter: show project title, retain project ID as value
    call_task_api(
        "get_project_filter_options",
        {},
        function (projects) {
            const $project = $("#filter-project");
            const selected = $project.val();

            $project.empty().append(
                $("<option>", {
                    value: "",
                    text: "All Projects"
                })
            );

            (projects || []).forEach(project => {
                $project.append(
                    $("<option>", {
                        value: project.value,
                        text: project.label
                    })
                );
            });

            if (selected) {
                $project.val(selected);
            }
        }
    );

    // Employee filter: show employees reporting to this user
    call_task_api(
        "get_employee_filter_options",
        {},
        function (employees) {
            const $employee = $("#filter-employee");
            const selected = $employee.val();

            $employee.empty().append(
                $("<option>", {
                    value: "",
                    text: "All Reporting Employees"
                })
            );

            (employees || []).forEach(employee => {
                $employee.append(
                    $("<option>", {
                        value: employee.value,
                        text: employee.label
                    })
                );
            });

            if (selected) {
                $employee.val(selected);
            }
        }
    );

    // Load Status and Priority from Task DocType metadata
    frappe.model.with_doctype("Task", function () {
        const meta = frappe.get_meta("Task");
        const fields = meta.fields || [];

        // Status options
        const statusField = fields.find(
            field => field.fieldname === "status"
        );

        const $status = $("#filter-status");
        $status.empty();
        $status.append(
            $("<option>", { value: "", text: "All Statuses" })
        );

        if (statusField && statusField.options) {
            statusField.options
                .split("\n")
                .map(option => option.trim())
                .filter(Boolean)
                .forEach(option => {
                    $status.append(
                        $("<option>", {
                            value: option,
                            text: option
                        })
                    );
                });
        } else {
            console.warn("Task status options were not found.");
        }

        // Priority options
        const priorityField = fields.find(
            field => field.fieldname === "custom_task_priority"
        );

        const $priority = $("#filter-priority");
        $priority.empty();
        $priority.append(
            $("<option>", { value: "", text: "All Priorities" })
        );

        if (priorityField && priorityField.options) {
            priorityField.options
                .split("\n")
                .map(option => option.trim())
                .filter(Boolean)
                .forEach(option => {
                    $priority.append(
                        $("<option>", {
                            value: option,
                            text: option
                        })
                    );
                });
        } else {
            console.warn(
                "Task custom_task_priority options were not found. " +
                "Check the Custom Field configuration."
            );
        }
    });
}


function get_dashboard_filters() {
    return {
        project: $("#filter-project").val() || "",
        employee: $("#filter-employee").val() || "",
        status: $("#filter-status").val() || "",
        priority: $("#filter-priority").val() || ""
    };
}


function update_active_filter_count() {
    const count = [
        $("#filter-project").val(),
        $("#filter-employee").val(),
        $("#filter-status").val(),
        $("#filter-priority").val()
    ].filter(value => value !== "").length;

    const $badge = $("#active-filter-count");

    $badge.text(count);
    $badge.prop("hidden", count === 0);
}

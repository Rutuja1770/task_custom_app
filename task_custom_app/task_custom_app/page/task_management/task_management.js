const TASK_API =
    "task_custom_app.task_custom_app.page.task_management.task_management";

const TASK_PAGE_SIZE = 15;

let dashboard_context = {
    user: "",
    scope_label: "My",
    can_view_all: false,
    can_view_team: false,
    is_project_manager: false
};

const table_state = {
    tab: "my",
    kpi_view: "",
    limit: TASK_PAGE_SIZE,
    offset: 0
};

let last_overdue_count = 0;
let last_upcoming_count = 0;
let last_upcoming_urgent = 0;

let employee_days = 7;


function can_view_all_tasks() {
    if (dashboard_context && typeof dashboard_context.can_view_all === "boolean") {
        return dashboard_context.can_view_all;
    }

    const roles = frappe.user_roles || [];
    return roles.includes("Task Manager") || roles.includes("Main Manager");
}


function set_active_menu(el) {
    $(".custom-sidebar .menu-item").removeClass("active");
    $(el).addClass("active");
}


function animate_kpi($el, target) {
    const end = Number(target) || 0;
    const duration = 450;
    const start = Number(String($el.text()).replace(/[^\d]/g, "")) || 0;

    if (start === end || duration === 0) {
        $el.text(end);
        return;
    }

    const t0 = performance.now();

    function frame(now) {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        $el.text(Math.round(start + (end - start) * eased));

        if (p < 1) {
            requestAnimationFrame(frame);
        }
    }

    requestAnimationFrame(frame);
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
                    <div class="menu-item" id="timesheet-link">
                        ⏱️ Timesheet
                    </div>
                </div>
            </aside>

            <main class="enterprise-dashboard">

            <div class="top-header">
                <div class="dashboard-heading">
                    <h2>Task Dashboard</h2>
                    <p>Monitor tasks, priorities and deadlines across your team.</p>
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
                                        <option value="">All Status</option>
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


                <!-- Quick KPI toggles: My Projects + Available Employees -->
                <div class="quick-kpi-row" id="quick-kpi-row">
                    <div class="quick-kpi-card quick-kpi-amber"
                         id="qp-my-projects" role="button" tabindex="0"
                         data-panel="my-projects-panel" aria-expanded="false"
                         aria-controls="my-projects-panel">
                        <div class="quick-kpi-accent"></div>
                        <div class="quick-kpi-inner">
                            <div class="quick-kpi-top">
                                <div class="quick-kpi-icon" aria-hidden="true">📁</div>
                                <div class="quick-kpi-meta">
                                    <div class="quick-kpi-label">My Projects</div>
                                    <div class="quick-kpi-hint" id="qp-projects-hint">
                                        Projects in your scope
                                    </div>
                                </div>
                            </div>
                            <div class="quick-kpi-value" id="qp-projects-count">0</div>
                            <div class="quick-kpi-footer">
                                <span>Click to view projects</span>
                                <span class="quick-kpi-arrow" aria-hidden="true">→</span>
                            </div>
                        </div>
                    </div>

                    <div class="quick-kpi-card quick-kpi-teal"
                         id="qp-employees" role="button" tabindex="0"
                         data-panel="employees-panel" aria-expanded="false"
                         aria-controls="employees-panel" hidden>
                        <div class="quick-kpi-accent"></div>
                        <div class="quick-kpi-inner">
                            <div class="quick-kpi-top">
                                <div class="quick-kpi-icon" aria-hidden="true">🧑‍💻</div>
                                <div class="quick-kpi-meta">
                                    <div class="quick-kpi-label">Available Employees</div>
                                    <div class="quick-kpi-hint" id="qp-employees-hint">
                                        Users free in the period
                                    </div>
                                </div>
                            </div>
                            <div class="quick-kpi-value" id="qp-employees-count">0</div>
                            <div class="quick-kpi-footer">
                                <span>Click to view employees</span>
                                <span class="quick-kpi-arrow" aria-hidden="true">→</span>
                            </div>
                        </div>
                    </div>
                </div>


                <!-- My Projects panel (opens from KPI) -->
                <section class="dashboard-panel my-projects-panel"
                         id="my-projects-panel" hidden>
                    <div class="my-projects-grid" id="my-projects-grid"></div>
                </section>


                <!-- Available Employees panel (opens from KPI) -->
                <section class="dashboard-panel employees-panel"
                         id="employees-panel" hidden>
                    <div class="employees-toolbar">
                        <span class="employees-toolbar-label">Next</span>
                        <div class="employee-days" id="employee-days"
                             role="group" aria-label="Days window">
                            <button type="button" class="employee-day-chip"
                                    data-days="1">1</button>
                            <button type="button" class="employee-day-chip"
                                    data-days="2">2</button>
                            <button type="button" class="employee-day-chip"
                                    data-days="3">3</button>
                            <button type="button" class="employee-day-chip"
                                    data-days="4">4</button>
                            <button type="button" class="employee-day-chip"
                                    data-days="5">5</button>
                            <button type="button" class="employee-day-chip"
                                    data-days="6">6</button>
                            <button type="button" class="employee-day-chip active"
                                    data-days="7">7</button>
                        </div>
                        <input type="number" id="employee-days-input"
                               class="form-control employee-days-input"
                               min="1" max="30" value="7"
                               aria-label="Custom days" />
                        <span class="employees-toolbar-label">days</span>
                    </div>

                    <div class="employees-grid" id="employees-grid"></div>
                </section>


                <div class="kpi-grid">
                    <div class="kpi-card purple metric-kpi" data-kpi="total" role="button" tabindex="0">
                        <div class="metric-kpi-accent"></div>
                        <div class="metric-kpi-inner">
                            <div class="metric-kpi-top">
                                <div class="metric-kpi-icon" aria-hidden="true">📋</div>
                                <div class="metric-kpi-meta">
                                    <div class="metric-kpi-label" id="kpi-total-label">Total Tasks</div>
                                    <div class="metric-kpi-hint">All in scope</div>
                                </div>
                            </div>
                            <div class="metric-kpi-value" id="total-tasks">0</div>
                            <div class="metric-kpi-footer">
                                <span>Click to view tasks</span>
                                <span class="metric-kpi-arrow">→</span>
                            </div>
                        </div>
                    </div>

                    <div class="kpi-card orange metric-kpi" data-kpi="overdue" role="button" tabindex="0">
                        <div class="metric-kpi-accent"></div>
                        <div class="metric-kpi-inner">
                            <div class="metric-kpi-top">
                                <div class="metric-kpi-icon" aria-hidden="true">⏰</div>
                                <div class="metric-kpi-meta">
                                    <div class="metric-kpi-label" id="kpi-overdue-label">Overdue</div>
                                    <div class="metric-kpi-hint">Past due date</div>
                                </div>
                            </div>
                            <div class="metric-kpi-value metric-kpi-alert" id="overdue-tasks">0</div>
                            <div class="metric-kpi-footer">
                                <span>Click to filter</span>
                                <span class="metric-kpi-arrow">→</span>
                            </div>
                        </div>
                    </div>

                    <div class="kpi-card red metric-kpi" data-kpi="critical" role="button" tabindex="0">
                        <div class="metric-kpi-accent"></div>
                        <div class="metric-kpi-inner">
                            <div class="metric-kpi-top">
                                <div class="metric-kpi-icon" aria-hidden="true">🚨</div>
                                <div class="metric-kpi-meta">
                                    <div class="metric-kpi-label" id="kpi-critical-label">Critical</div>
                                    <div class="metric-kpi-hint">Delayed 15+ days</div>
                                </div>
                            </div>
                            <div class="metric-kpi-value metric-critical" id="critical-tasks">0</div>
                            <div class="metric-kpi-footer">
                                <span>Click to filter</span>
                                <span class="metric-kpi-arrow">→</span>
                            </div>
                        </div>
                    </div>

                    <div class="kpi-card green metric-kpi" data-kpi="completed" role="button" tabindex="0">
                        <div class="metric-kpi-accent"></div>
                        <div class="metric-kpi-inner">
                            <div class="metric-kpi-top">
                                <div class="metric-kpi-icon" aria-hidden="true">✅</div>
                                <div class="metric-kpi-meta">
                                    <div class="metric-kpi-label" id="kpi-completed-label">Completed</div>
                                    <div class="metric-kpi-hint">Done tasks</div>
                                </div>
                            </div>
                            <div class="metric-kpi-value metric-success" id="completed-tasks">0</div>
                            <div class="metric-kpi-footer">
                                <span>Click to filter</span>
                                <span class="metric-kpi-arrow">→</span>
                            </div>
                        </div>
                    </div>
                </div>


                <div class="dashboard-row">
                    <section class="dashboard-panel chart-panel">
                        <div class="panel-header">
                            <div class="panel-title-row">
                                <div class="panel-icon panel-icon-amber" aria-hidden="true">⚠️</div>
                                <div>
                                    <h4>Tasks By Delay Range</h4>
                                    <p class="panel-subtitle">How long tasks have been overdue</p>
                                </div>
                            </div>
                            <select id="delay-filter" class="panel-select">
                                <option value="All">All Ranges</option>
                                <option value="1-5 Days">1–5 Days</option>
                                <option value="6-10 Days">6–10 Days</option>
                                <option value="11-14 Days">11–14 Days</option>
                                <option value="15+ Days">15+ Days</option>
                            </select>
                        </div>
                        <div id="delay-chart" class="chart-surface"></div>
                    </section>

                    <section class="dashboard-panel chart-panel">
                        <div class="panel-header">
                            <div class="panel-title-row">
                                <div class="panel-icon" aria-hidden="true">🎯</div>
                                <div>
                                    <h4>Upcoming Deadlines</h4>
                                    <p class="panel-subtitle">Tasks due by expected end date</p>
                                </div>
                            </div>
                            <span class="panel-chip" id="deadline-chart-chip">Next 15 days</span>
                        </div>
                        <div id="deadline-chart" class="chart-surface"></div>
                    </section>
                </div>

                <div class="dashboard-row bottom-row">
                    <section class="dashboard-panel">
                        <div class="panel-header">
                            <h4>🚨 Delayed Tasks</h4>
                            <span class="panel-chip panel-chip-danger" id="delay-count-chip">0 tasks</span>
                        </div>
                        <div id="delay-list"></div>
                    </section>

                    <section class="dashboard-panel metric-card" id="upcoming-card">
                        <div class="metric-card-accent"></div>
                        <div class="metric-card-inner">
                            <div class="metric-card-header">
                                <div class="metric-card-icon" aria-hidden="true">📅</div>
                                <div class="metric-card-heading">
                                    <span class="metric-card-prefix">Next</span>
                                    <select id="deadline-filter" class="metric-card-select"
                                            aria-label="Days window">
                                        <option value="7">7</option>
                                        <option value="15" selected>15</option>
                                        <option value="30">30</option>
                                    </select>
                                    <span class="metric-card-suffix">Days · Upcoming Deadlines</span>
                                </div>
                            </div>

                            <div class="metric-card-stats">
                                <div class="metric-stat">
                                    <div class="metric-stat-value" id="upcoming-count">0</div>
                                    <div class="metric-stat-label">(Count)</div>
                                </div>
                                <div class="metric-stat metric-stat-right">
                                    <div class="metric-stat-value metric-stat-alert"
                                         id="upcoming-urgent">0</div>
                                    <div class="metric-stat-label">(Urgent ≤3d)</div>
                                </div>
                            </div>

                            <div class="metric-card-footer" id="upcoming-summary">
                                0 upcoming / 0 overdue
                            </div>

                            <div id="upcoming-list" class="metric-card-list"></div>
                        </div>
                    </section>

                    <section class="dashboard-panel chart-panel priority-panel">
                        <div class="panel-header">
                            <div class="panel-title-row">
                                <div class="panel-icon panel-icon-teal" aria-hidden="true">🎯</div>
                                <div>
                                    <h4>Tasks by Priority</h4>
                                    <p class="panel-subtitle">Eisenhower matrix breakdown</p>
                                </div>
                            </div>
                            <span class="panel-chip" id="priority-total-chip">0 tasks</span>
                        </div>

                        <div class="priority-body">
                            <div class="priority-total-block">
                                <div class="priority-total-value" id="priority-center-value">0</div>
                                <div class="priority-total-label">Total Tasks</div>
                            </div>
                            <div id="priority-chart" class="priority-donut"></div>
                        </div>

                        <div id="priority-legend" class="priority-legend"></div>
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
                                    <th id="col-assigned-to">Assigned To</th>
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
        set_active_menu(this);
        switch_task_tab("my");
    });

    // TEAM TASKS — in-page table tab
    $main.on("click", "#team-task-link", function () {
        set_active_menu(this);
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

        set_active_menu(this);
        switch_task_tab("all");
    });


    $main.on("click", "#dashboard-link", function () {
        frappe.set_route("task-management");
    });

    // TIMESHEET — ERPNext Timesheet list
    $main.on("click", "#timesheet-link", function () {
        frappe.set_route("List", "Timesheet");
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

    // My Projects card → filter dashboard by that project
    $main.on("click", ".my-project-card", function () {
        const project = $(this).attr("data-project");
        if (!project) {
            return;
        }

        $("#filter-project").val(project).trigger("change");
        scroll_to_task_table();
    });

    $main.on("keydown", ".my-project-card", function (e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            $(this).trigger("click");
        }
    });

    // Available Employees: day chips + custom days input
    $main.on("click", ".employee-day-chip", function () {
        set_employee_days($(this).attr("data-days"));
    });

    $main.on("change", "#employee-days-input", function () {
        set_employee_days($(this).val());
    });

    // Quick KPI cards: toggle My Projects / Available Employees panels
    $main.on("click", ".quick-kpi-card", function () {
        toggle_quick_panel(this);
    });

    $main.on("keydown", ".quick-kpi-card", function (e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            $(this).trigger("click");
        }
    });


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

    $("#kpi-total-label").text(`${label} Tasks`);
    $("#kpi-overdue-label").text(`${label} Overdue`);
    $("#kpi-critical-label").text(`${label} Critical`);
    $("#kpi-completed-label").text(`${label} Completed`);

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
    sync_sidebar_menu(tab);
    update_task_table_title();
    load_task_table();
    scroll_to_task_table();
}


function sync_sidebar_menu(tab) {
    const idMap = {
        my: "#my-task-link",
        team: "#team-task-link",
        all: "#all-task-link"
    };

    const sel = idMap[tab];
    if (sel && $(sel).length) {
        set_active_menu($(sel)[0]);
    }
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
    load_my_projects();
    load_available_employees();
}


function load_dashboard_data() {
    call_task_api(
        "get_dashboard_data",
        get_dashboard_filters(),
        function (data) {
            if (!data) return;

            animate_kpi($("#total-tasks"), data.total_tasks || 0);
            animate_kpi($("#overdue-tasks"), data.overdue_tasks || 0);
            animate_kpi($("#critical-tasks"), data.critical_tasks || 0);
            animate_kpi($("#completed-tasks"), data.completed_tasks || 0);

            last_overdue_count = Number(data.overdue_tasks) || 0;
            update_upcoming_summary();
        }
    );
}


// =========================================================
// MY PROJECTS (Project Manager)
// =========================================================


function load_my_projects() {
    const show_section =
        dashboard_context.is_project_manager ||
        dashboard_context.can_view_all;

    $("#qp-my-projects").prop("hidden", !show_section);

    if (!show_section) {
        $("#my-projects-panel").prop("hidden", true);
        return;
    }

    const hint = dashboard_context.is_project_manager
        ? "Projects assigned to you as lead"
        : "Projects handled by your team";

    $("#qp-projects-hint").text(hint);

    call_task_api("get_my_projects", {}, function (projects) {
        render_my_projects(projects || []);
    });
}


function render_my_projects(projects) {
    const $grid = $("#my-projects-grid");
    const count = projects.length;

    $("#qp-projects-count").text(count);

    if (!count) {
        $grid.html(
            `<div class="my-projects-empty">
                No projects assigned to you yet. Ask an administrator
                to set you as Project Lead on a project.
            </div>`
        );
        return;
    }

    const html = projects
        .map(function (p) {
            const total = Number(p.total_tasks) || 0;
            const open = Number(p.open_tasks) || 0;
            const overdue = Number(p.overdue_tasks) || 0;
            const name = frappe.utils.escape_html(p.project_name);
            const id = frappe.utils.escape_html(p.project);

            return `
                <div class="my-project-card" role="button" tabindex="0"
                     data-project="${id}" title="${id}">
                    <div class="my-project-card-accent${overdue ? " my-project-accent-alert" : ""}"></div>
                    <div class="my-project-card-body">
                        <div class="my-project-name">${name}</div>
                        <div class="my-project-stats">
                            <span class="my-project-stat">
                                <strong>${total}</strong> total
                            </span>
                            <span class="my-project-stat">
                                <strong>${open}</strong> open
                            </span>
                            <span class="my-project-stat${overdue ? " my-project-stat-alert" : ""}">
                                <strong>${overdue}</strong> overdue
                            </span>
                        </div>
                    </div>
                </div>`;
        })
        .join("");

    $grid.html(html);
}


// =========================================================
// AVAILABLE EMPLOYEES (PM / Task Manager / Main Manager)
// =========================================================


function load_available_employees() {
    $("#qp-employees").prop(
        "hidden",
        !dashboard_context.can_view_employees
    );

    if (!dashboard_context.can_view_employees) {
        $("#employees-panel").prop("hidden", true);
        return;
    }

    call_task_api(
        "get_available_employees",
        { days: employee_days },
        function (users) {
            render_available_employees(users || []);
        }
    );
}


function render_available_employees(users) {
    const $grid = $("#employees-grid");
    const count = users.length;

    const window_end = frappe.datetime
        .add_days(frappe.datetime.get_today(), employee_days)
        .substring(0, 10);

    let window_label = window_end;

    try {
        window_label = frappe.datetime.str_to_user(window_end) || window_end;
    } catch (e) {
        // keep raw date
    }

    $("#qp-employees-count").text(count);
    $("#qp-employees-hint").text(
        `No pending tasks due till ${frappe.utils.escape_html(window_label)}`
    );

    if (!count) {
        $grid.html(
            `<div class="employees-empty">
                No available users for the next
                ${employee_days} day${employee_days === 1 ? "" : "s"}.
            </div>`
        );
        return;
    }

    const html = users
        .map(function (user) {
            const name = frappe.utils.escape_html(
                user.full_name || user.user
            );
            const email = frappe.utils.escape_html(
                user.email || user.user
            );
            const designation = frappe.utils.escape_html(
                user.designation || ""
            );
            const initial = frappe.utils.escape_html(
                (
                    String(user.full_name || user.user || "?")
                        .trim()
                        .charAt(0) || "?"
                ).toUpperCase()
            );

            return `
                <div class="employee-card" title="${email}">
                    <div class="employee-avatar" aria-hidden="true">${initial}</div>
                    <div class="employee-info">
                        <div class="employee-name">${name}</div>
                        <div class="employee-email">${email}</div>
                        ${designation
                            ? `<div class="employee-designation">${designation}</div>`
                            : ""}
                    </div>
                </div>`;
        })
        .join("");

    $grid.html(html);
}


function set_employee_days(days) {
    days = Math.max(1, Math.min(30, parseInt(days, 10) || 7));

    employee_days = days;
    $("#employee-days-input").val(days);
    $("#employee-days .employee-day-chip").removeClass("active");
    $(
        `#employee-days .employee-day-chip[data-days="${days}"]`
    ).addClass("active");

    load_available_employees();
}


function toggle_quick_panel(card) {
    const $card = $(card);
    const $panel = $("#" + $card.attr("data-panel"));
    const open = $panel.prop("hidden");

    $panel.prop("hidden", !open);
    $card.toggleClass("active", open);
    $card.attr("aria-expanded", open ? "true" : "false");
}


// =========================================================
// CHARTS
// =========================================================


const CHART_PALETTE = [
    "#6366F1", // Indigo
    "#0D9488", // Teal
    "#D97706", // Amber
    "#E11D48", // Rose
    "#7C3AED", // Violet
    "#0EA5E9", // Sky
    "#F97316", // Orange
    "#10B981"  // Emerald
];


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

            const values = labels.map(label => data[label] || 0);

            $("#delay-chart").empty();

            if (values.every(v => v === 0)) {
                $("#delay-chart").html(empty_chart_html("No delayed tasks"));
                return;
            }

            new frappe.Chart("#delay-chart", {
                data: {
                    labels: labels.map(l => l.replace(" Days", "d").replace("-", "–")),
                    datasets: [{
                        name: "Delayed Tasks",
                        values: values
                    }]
                },
                type: "bar",
                height: 280,
                colors: ["#6366F1", "#D97706", "#F97316", "#E11D48"],
                valuesOverPoints: 1,
                axisOptions: {
                    xIsSeries: true,
                    shortLabel: true
                },
                barOptions: {
                    discrete: true,
                    spaceRatio: 0.45,
                    highlightMode: "none"
                },
                tooltipOptions: {
                    formatTooltipY: y => `${y} task${y === 1 ? "" : "s"}`
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
                    empty_chart_html("No upcoming deadlines")
                );
                return;
            }

            // Show max 10 bars so labels stay readable
            const limited = tasks.slice(0, 10);
            const hidden = tasks.length - limited.length;

            const labels = limited.map(task => {
                const name = task.task_name || task.name;
                return name.length > 14 ? name.slice(0, 12) + "…" : name;
            });

            const values = limited.map(task =>
                Math.max(0, Number(task.days_remaining) || 0)
            );

            const colors = limited.map((_, i) =>
                CHART_PALETTE[i % CHART_PALETTE.length]
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
                colors: colors,
                valuesOverPoints: 1,
                axisOptions: {
                    xIsSeries: true,
                    shortLabel: true
                },
                barOptions: {
                    discrete: true,
                    spaceRatio: 0.45,
                    highlightMode: "none"
                },
                tooltipOptions: {
                    formatTooltipY: y => `${y} day${y === 1 ? "" : "s"} left`
                }
            });

            if (hidden > 0) {
                $("#deadline-chart").append(
                    `<div class="chart-footnote">+${hidden} more task${hidden === 1 ? "" : "s"} not shown</div>`
                );
            }
        }
    );
}


function empty_chart_html(message) {
    return `
        <div class="chart-empty">
            <div class="chart-empty-icon" aria-hidden="true">📊</div>
            <div class="chart-empty-text">${frappe.utils.escape_html(message)}</div>
            <div class="chart-empty-hint">Data will appear here when available</div>
        </div>
    `;
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
        "#E11D48", // Rose — Important-Urgent
        "#14B8A6", // Teal — Important-Not Urgent
        "#F59E0B", // Amber — Not Important-Urgent
        "#FB7185", // Light rose — Not Important-Not Urgent
        "#94A3B8"  // Slate — Unassigned
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
            const total = values.reduce((sum, v) => sum + v, 0);

            $("#priority-total-chip").text(
                `${total} task${total === 1 ? "" : "s"}`
            );

            $("#priority-chart").empty();
            $("#priority-legend").empty();

            const chartContainer = $("#priority-chart");

            if (total === 0) {
                chartContainer.html(empty_chart_html("No priority data"));
                $("#priority-center-value").text(0);
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
                height: 220,
                colors: colors,
                showLegend: false,
                showTitle: false,
                tooltipOptions: {
                    formatTooltipY: y => {
                        const pct = total ? Math.round((y / total) * 100) : 0;
                        return `${y} (${pct}%)`;
                    }
                }
            });

            $("#priority-center-value").text(total);

            // Percentage legend rows
            const legendHtml = labels.map((label, index) => {
                const count = values[index];
                const pct = total ? Math.round((count / total) * 100) : 0;
                const short = label
                    .replace(/Important/g, "Imp.")
                    .replace(/-/g, " · ");

                return `
                    <div class="priority-row${count === 0 ? " is-zero" : ""}">
                        <span class="priority-row-dot"
                              style="background:${colors[index]}"></span>
                        <span class="priority-row-label"
                              title="${frappe.utils.escape_html(label)}">${frappe.utils.escape_html(short)}</span>
                        <span class="priority-row-bar">
                            <span class="priority-row-bar-fill"
                                  style="width:${pct}%;background:${colors[index]}"></span>
                        </span>
                        <span class="priority-row-count">${count}</span>
                        <span class="priority-row-pct">${pct}%</span>
                    </div>
                `;
            }).join("");

            $("#priority-legend").html(legendHtml);
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

            $("#delay-count-chip").text(
                `${tasks.length} task${tasks.length === 1 ? "" : "s"}`
            );

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

            last_upcoming_count = tasks.length;
            last_upcoming_urgent = tasks.filter(task =>
                Number(task.days_remaining) <= 3
            ).length;

            animate_kpi($("#upcoming-count"), last_upcoming_count);
            animate_kpi($("#upcoming-urgent"), last_upcoming_urgent);
            update_upcoming_summary();

            const chip = `Next ${Number(days) || 7} days`;
            $("#deadline-chart-chip").text(chip);

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


function update_upcoming_summary() {
    const upcoming = last_upcoming_count;
    const urgent = last_upcoming_urgent;
    const onTrack = Math.max(0, upcoming - urgent);

    $("#upcoming-summary").text(
        `${upcoming} upcoming · ${urgent} urgent · ${onTrack} on track`
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

        // Completed view: _assign is cleared by ERPNext, so the last
        // column shows who completed the task instead.
        const show_completed_by = table_state.kpi_view === "completed";
        $("#col-assigned-to").text(
            show_completed_by ? "Completed By" : "Assigned To"
        );

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
                        ${frappe.utils.escape_html(
                            task.project_name || task.project || "—"
                        )}
                    </td>
                    <td>
                        ${frappe.utils.escape_html(
                            task.status === "Completed"
                                ? parse_user(task.completed_by)
                                : parse_assign(task._assign)
                        )}
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


function parse_user(user_id) {
    if (!user_id) return "—";
    return String(user_id).split("@")[0];
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
            $("<option>", { value: "", text: "All Status" })
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

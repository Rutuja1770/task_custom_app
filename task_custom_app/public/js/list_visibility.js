frappe.listview_settings["Task"] = {
    onload(listview) {
        restrict_list_view(listview, resolve_task_scope);
    },
};

frappe.listview_settings["Project"] = {
    onload(listview) {
        restrict_list_view(listview, resolve_project_scope);
    },
};

const TASK_MANAGER_ROLES = ["Task Manager"];
const MAIN_MANAGER_ROLES = ["Main Manager"];
const PROJECT_SCOPE_ROLES = ["Project Manager", "HR Manager", "HR User"];
const list_scope_cache = {};
const project_names_cache = {};

function has_any_role(roles) {
    const user_roles = frappe.user_roles || [];
    return roles.some((role) => user_roles.includes(role));
}

function is_unrestricted() {
    return (
        frappe.session.user === "Administrator" ||
        has_any_role(TASK_MANAGER_ROLES)
    );
}

function employee_task_scope() {
    const user = frappe.session.user;
    return {
        or_filters: [
            ["Task", "_assign", "like", `%${user}%`],
            ["Task", "completed_by", "=", user],
        ],
    };
}

function employee_project_scope() {
    const user = frappe.session.user;
    return {
        filters: [["Project", "_assign", "like", `%${user}%`]],
    };
}

function fallback_scope(doctype) {
    return doctype === "Task" ? employee_task_scope() : employee_project_scope();
}

function get_my_project_names() {
    const user = frappe.session.user;

    if (!project_names_cache[user]) {
        project_names_cache[user] = frappe
            .call({
                method:
                    "task_custom_app.task_custom_app.page.task_management.task_management.get_my_projects",
            })
            .then((r) => (r.message || []).map((row) => row.project));
    }

    return project_names_cache[user];
}

async function resolve_task_scope() {
    if (is_unrestricted()) {
        return { unrestricted: true };
    }

    const scope = employee_task_scope();

    if (has_any_role(MAIN_MANAGER_ROLES) || has_any_role(PROJECT_SCOPE_ROLES)) {
        const projects = await get_my_project_names();

        if (projects.length) {
            scope.or_filters.push(["Task", "project", "in", projects]);
        }
    }

    return scope;
}

async function resolve_project_scope() {
    if (is_unrestricted()) {
        return { unrestricted: true };
    }

    if (has_any_role(MAIN_MANAGER_ROLES) || has_any_role(PROJECT_SCOPE_ROLES)) {
        const projects = await get_my_project_names();

        if (!projects.length) {
            return { filters: [["Project", "name", "=", "__no_projects__"]] };
        }

        return { filters: [["Project", "name", "in", projects]] };
    }

    return employee_project_scope();
}

function get_cached_scope(doctype, resolver) {
    const key = `${doctype}:${frappe.session.user}`;

    if (!list_scope_cache[key]) {
        list_scope_cache[key] = resolver().catch(() => fallback_scope(doctype));
    }

    return list_scope_cache[key];
}

function restrict_list_view(listview, resolver) {
    const doctype = listview.doctype;
    let scope = null;

    const get_args = listview.get_args.bind(listview);
    listview.get_args = function () {
        const args = get_args();

        if (!scope) {
            args.filters = (args.filters || []).concat([
                [doctype, "name", "=", "__resolving__"],
            ]);
            return args;
        }

        if (scope.unrestricted) {
            return args;
        }

        args.filters = (args.filters || []).concat(scope.filters || []);

        if ((scope.or_filters || []).length) {
            args.or_filters = (args.or_filters || []).concat(scope.or_filters);
        }

        return args;
    };

    const get_count_str = listview.get_count_str.bind(listview);
    listview.get_count_str = function () {
        if (scope && scope.unrestricted) {
            return get_count_str.call(listview);
        }

        const effective = scope || {
            filters: [[doctype, "name", "=", "__resolving__"]],
            or_filters: [],
        };

        const filters = this.get_filters_for_args().concat(
            effective.filters || []
        );
        const args = {
            doctype,
            filters,
            fields: [],
            distinct: filters.some((filter) => filter[0] !== doctype),
            limit: this.count_upper_bound,
        };

        if ((effective.or_filters || []).length) {
            args.or_filters = effective.or_filters;
        }

        return frappe
            .xcall("frappe.desk.reportview.get_count", args)
            .then((total_count) => {
                this.total_count = total_count;

                const current_count = this.data.length;
                const count_without_children = this.data.uniqBy(
                    (d) => d.name
                ).length;
                this.count_without_children =
                    count_without_children !== current_count
                        ? count_without_children
                        : undefined;

                let count_str;

                if (current_count > total_count) {
                    count_str = `${format_number(total_count, null, 0)}+`;
                } else if (this.count_upper_bound && total_count === this.count_upper_bound) {
                    count_str = `${format_number(total_count - 1, null, 0)}+`;
                } else if (total_count == null) {
                    count_str = "??";
                } else {
                    count_str = format_number(total_count, null, 0);
                }

                let result = __("{0} of {1}", [
                    format_number(current_count, null, 0),
                    count_str,
                ]);

                if (this.count_without_children) {
                    result = __("{0} of {1} ({2} rows with children})", [
                        format_number(current_count, null, 0),
                        count_str,
                        this.count_without_children,
                    ]);
                }

                return result;
            });
    };

    get_cached_scope(doctype, resolver).then((result) => {
        scope = result;
        return listview.refresh();
    });
}

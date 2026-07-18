frappe.pages["tracker-org"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Tracker Org Setup"),
		single_column: true,
	});

	page.main.html(`
		<div class="tracker-org p-3">
			<p class="text-muted">${__("Set Tracker org role, reports_to, and Frappe role. Assign only flows down this tree.")}</p>
			<div class="mb-3">
				<button class="btn btn-primary btn-sm tracker-org-refresh">${__("Refresh")}</button>
				<button class="btn btn-secondary btn-sm tracker-org-seed">${__("Seed demo Top / Sub / Worker")}</button>
			</div>
			<div class="tracker-org-tree"></div>
		</div>
	`);

	const $tree = $(page.main).find(".tracker-org-tree");

	function load() {
		frappe.call({
			method: "tracker.api.v1.hierarchy.org_tree",
			freeze: true,
			callback: (r) => {
				const data = (r.message && r.message.data) || {};
				const rows = data.employees || [];
				if (!rows.length) {
					$tree.html(`<p class="text-muted">${__("No active employees.")}</p>`);
					return;
				}
				const byName = {};
				rows.forEach((e) => (byName[e.name] = e));
				const roots = rows.filter((e) => !e.reports_to || !byName[e.reports_to]);
				const renderNode = (emp, depth) => {
					const pad = depth * 18;
					const role = emp.tracker_org_role || "—";
					const roles = (emp.roles || []).join(", ") || "—";
					return `<div class="tracker-org-row" style="padding-left:${pad}px" data-emp="${frappe.utils.escape_html(emp.name)}">
						<strong>${frappe.utils.escape_html(emp.employee_name || emp.name)}</strong>
						<span class="text-muted"> · ${frappe.utils.escape_html(emp.user_id || "no user")} · org=${frappe.utils.escape_html(role)} · roles=${frappe.utils.escape_html(roles)}</span>
						<button class="btn btn-xs btn-default tracker-org-edit" data-emp="${frappe.utils.escape_html(emp.name)}">${__("Edit")}</button>
					</div>`;
				};
				const childrenOf = (parent) => rows.filter((e) => e.reports_to === parent);
				const walk = (emp, depth) => {
					let html = renderNode(emp, depth);
					childrenOf(emp.name).forEach((c) => {
						html += walk(c, depth + 1);
					});
					return html;
				};
				let html = `<p class="text-muted">${__("Company")}: ${frappe.utils.escape_html(data.company || "—")}</p>`;
				roots.forEach((r) => (html += walk(r, 0)));
				// orphans already in roots
				$tree.html(html);
				$tree.find(".tracker-org-edit").on("click", function () {
					editEmployee($(this).data("emp"), rows);
				});
			},
		});
	}

	function editEmployee(name, rows) {
		const emp = rows.find((e) => e.name === name);
		if (!emp) return;
		const d = new frappe.ui.Dialog({
			title: __("Edit org") + ": " + (emp.employee_name || name),
			fields: [
				{
					fieldname: "tracker_org_role",
					label: __("Tracker Org Role"),
					fieldtype: "Select",
					options: "\nTop\nSub\nWorker",
					default: emp.tracker_org_role || "",
				},
				{
					fieldname: "reports_to",
					label: __("Reports To"),
					fieldtype: "Link",
					options: "Employee",
					default: emp.reports_to || "",
				},
				{
					fieldname: "tracker_role",
					label: __("Frappe Role"),
					fieldtype: "Select",
					options: "\nTracker Top\nTracker Sub\nTracker Worker",
					default: (emp.roles && emp.roles[0]) || "",
				},
			],
			primary_action_label: __("Save"),
			primary_action(values) {
				frappe.call({
					method: "tracker.api.v1.hierarchy.update_employee_org",
					args: {
						employee: name,
						tracker_org_role: values.tracker_org_role || "",
						reports_to: values.reports_to || "",
						tracker_role: values.tracker_role || "",
					},
					freeze: true,
					callback: () => {
						d.hide();
						load();
					},
				});
			},
		});
		d.show();
	}

	$(page.main)
		.find(".tracker-org-refresh")
		.on("click", () => load());
	$(page.main)
		.find(".tracker-org-seed")
		.on("click", () => {
			frappe.confirm(__("Create demo Top / Sub / Worker users (password Tracker@123)?"), () => {
				frappe.call({
					method: "tracker.api.v1.hierarchy.seed_demo",
					freeze: true,
					callback: (r) => {
						frappe.show_alert({ message: __("Demo org seeded"), indicator: "green" });
						console.log(r.message);
						load();
					},
				});
			});
		});

	load();
};

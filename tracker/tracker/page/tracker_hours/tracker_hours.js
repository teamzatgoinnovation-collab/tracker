frappe.pages["tracker-hours"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Tracker Hours"),
		single_column: true,
	});

	const today = frappe.datetime.get_today();
	const monthStart = frappe.datetime.month_start();

	page.main.html(`
		<div class="tracker-hours p-2">
			<div class="flex flex-wrap mb-3" style="gap:8px;align-items:end">
				<div>
					<label class="text-muted small">${__("From")}</label>
					<input type="date" class="form-control tracker-from" value="${monthStart}" />
				</div>
				<div>
					<label class="text-muted small">${__("To")}</label>
					<input type="date" class="form-control tracker-to" value="${today}" />
				</div>
				<button class="btn btn-primary btn-sm tracker-btn-load">${__("Load")}</button>
			</div>
			<div class="row">
				<div class="col-md-6">
					<h5>${__("Hours by Project")}</h5>
					<div class="tracker-by-project"></div>
				</div>
				<div class="col-md-6">
					<h5>${__("Hours by User")}</h5>
					<div class="tracker-by-user"></div>
				</div>
			</div>
		</div>
	`);

	const $root = $(page.main);

	function table(rows, cols) {
		if (!rows.length) return `<p class="text-muted">${__("No hours in range.")}</p>`;
		const head = cols.map((c) => `<th>${c.label}</th>`).join("");
		const body = rows
			.map((r) => {
				const cells = cols
					.map((c) => {
						let v = r[c.key];
						if (c.key === "hours") v = Number(v || 0).toFixed(2);
						return `<td>${frappe.utils.escape_html(String(v ?? "—"))}</td>`;
					})
					.join("");
				return `<tr>${cells}</tr>`;
			})
			.join("");
		return `<table class="table table-bordered table-sm"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
	}

	function load() {
		const from_date = $root.find(".tracker-from").val();
		const to_date = $root.find(".tracker-to").val();
		Promise.all([
			frappe.call("tracker.api.v1.reports.hours_by_project", {
				from_date,
				to_date,
				page_size: 100,
			}),
			frappe.call("tracker.api.v1.reports.hours_by_user", {
				from_date,
				to_date,
				page_size: 100,
			}),
		]).then(([pRes, uRes]) => {
			const unwrap = (res) => {
				const m = res.message || {};
				return m.success === false ? [] : m.data || [];
			};
			$root.find(".tracker-by-project").html(
				table(unwrap(pRes), [
					{ key: "project", label: __("Project") },
					{ key: "hours", label: __("Hours") },
					{ key: "entries", label: __("Entries") },
				])
			);
			$root.find(".tracker-by-user").html(
				table(unwrap(uRes), [
					{ key: "employee_name", label: __("Employee") },
					{ key: "user", label: __("User") },
					{ key: "hours", label: __("Hours") },
					{ key: "entries", label: __("Entries") },
				])
			);
		});
	}

	$root.find(".tracker-btn-load").on("click", load);
	page.set_primary_action(__("Refresh"), load);
	load();
};

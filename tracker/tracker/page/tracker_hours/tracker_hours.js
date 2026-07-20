frappe.pages["tracker-hours"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Task Management Hours"),
		single_column: true,
	});

	const today = frappe.datetime.get_today();
	const monthStart = frappe.datetime.month_start();

	page.main.html(`
		<div class="tracker-hours tracker-page">
			<div class="tracker-brand">
				<div class="tracker-brand-left">
					<h2 class="tracker-brand-title">${__("Hours")}</h2>
				</div>
			</div>
			<p class="tracker-brand-sub">
				${__("Submitted Timesheet hours by project and person for the selected range.")}
			</p>

			<div class="tracker-toolbar">
				<div class="tracker-field">
					<label>${__("From")}</label>
					<input type="date" class="form-control tracker-from" value="${monthStart}" />
				</div>
				<div class="tracker-field">
					<label>${__("To")}</label>
					<input type="date" class="form-control tracker-to" value="${today}" />
				</div>
				<div class="tracker-field tracker-field-action">
					<button class="btn btn-primary btn-sm tracker-btn-load">${__("Load")}</button>
				</div>
			</div>

			<div class="tracker-hours-grid">
				<div class="tracker-hours-card">
					<div class="tracker-hours-card-head">
						<h5>${__("Hours by Project")}</h5>
						<span class="text-muted small tracker-project-count"></span>
					</div>
					<div class="tracker-hours-card-body tracker-by-project"></div>
				</div>
				<div class="tracker-hours-card">
					<div class="tracker-hours-card-head">
						<h5>${__("Hours by User")}</h5>
						<span class="text-muted small tracker-user-count"></span>
					</div>
					<div class="tracker-hours-card-body tracker-by-user"></div>
				</div>
			</div>
		</div>
	`);

	const $root = $(page.main);

	function emptyHtml(title, hint) {
		return `<div class="tracker-empty">
			<div class="tracker-empty-title">${frappe.utils.escape_html(title)}</div>
			<div class="tracker-empty-hint">${frappe.utils.escape_html(hint)}</div>
		</div>`;
	}

	function table(rows, cols) {
		if (!rows.length) {
			return emptyHtml(
				__("No hours in range"),
				__("Stop sessions on the Workbench or widen the date range.")
			);
		}
		const head = cols.map((c) => `<th>${frappe.utils.escape_html(c.label)}</th>`).join("");
		const body = rows
			.map((r) => {
				const cells = cols
					.map((c) => {
						let v = r[c.key];
						let cls = "";
						if (c.key === "hours") {
							v = Number(v || 0).toFixed(2);
							cls = "tracker-hours-num";
						}
						if (c.muted) cls = (cls + " tracker-hours-muted").trim();
						if (v == null || v === "") v = "—";
						return `<td class="${cls}">${frappe.utils.escape_html(String(v))}</td>`;
					})
					.join("");
				return `<tr>${cells}</tr>`;
			})
			.join("");
		return `<table class="table table-sm tracker-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
	}

	function errorHtml(message) {
		return `<p class="tracker-error">${frappe.utils.escape_html(
			message || __("Could not load hours.")
		)}</p>`;
	}

	function unwrapRows(res) {
		const m = res.message || {};
		if (m.success === false) {
			const err = (m.error && m.error.message) || __("Request failed.");
			return { rows: [], error: err };
		}
		return { rows: m.data || [], error: null };
	}

	function sumHours(rows) {
		return rows.reduce((n, r) => n + Number(r.hours || 0), 0);
	}

	function load() {
		const from_date = $root.find(".tracker-from").val();
		const to_date = $root.find(".tracker-to").val();
		if (!from_date || !to_date) {
			frappe.msgprint({
				title: __("Date range"),
				message: __("From and To dates are required."),
				indicator: "orange",
			});
			return;
		}
		if (from_date > to_date) {
			frappe.msgprint({
				title: __("Date range"),
				message: __("From date must be on or before To date."),
				indicator: "orange",
			});
			return;
		}

		$root.find(".tracker-by-project").html(
			`<div class="tracker-empty"><div class="tracker-empty-hint">${__("Loading…")}</div></div>`
		);
		$root.find(".tracker-by-user").html(
			`<div class="tracker-empty"><div class="tracker-empty-hint">${__("Loading…")}</div></div>`
		);

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
		])
			.then(([pRes, uRes]) => {
				const byProject = unwrapRows(pRes);
				const byUser = unwrapRows(uRes);

				$root.find(".tracker-project-count").text(
					byProject.error
						? ""
						: __("{0} h total", [sumHours(byProject.rows).toFixed(1)])
				);
				$root.find(".tracker-user-count").text(
					byUser.error ? "" : __("{0} h total", [sumHours(byUser.rows).toFixed(1)])
				);

				$root.find(".tracker-by-project").html(
					byProject.error
						? errorHtml(byProject.error)
						: table(byProject.rows, [
								{ key: "project", label: __("Project") },
								{ key: "hours", label: __("Hours") },
								{ key: "entries", label: __("Entries"), muted: true },
							])
				);
				$root.find(".tracker-by-user").html(
					byUser.error
						? errorHtml(byUser.error)
						: table(byUser.rows, [
								{ key: "employee_name", label: __("Employee") },
								{ key: "user", label: __("User"), muted: true },
								{ key: "hours", label: __("Hours") },
								{ key: "entries", label: __("Entries"), muted: true },
							])
				);
			})
			.catch((e) => {
				const message = e.message || e;
				$root.find(".tracker-by-project").html(errorHtml(message));
				$root.find(".tracker-by-user").html(errorHtml(message));
				frappe.msgprint({ title: __("Error"), message, indicator: "red" });
			});
	}

	$root.find(".tracker-btn-load").on("click", load);
	page.set_primary_action(__("Refresh"), load);
	load();
};

frappe.pages["tracker-workbench"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Tracker Workbench"),
		single_column: true,
	});

	page.main.html(`
		<div class="tracker-workbench">
			<div class="tracker-active card p-3 mb-3">
				<div class="flex justify-between align-center flex-wrap">
					<div>
						<div class="text-muted">${__("Active session")}</div>
						<div class="tracker-active-label font-bold">${__("None")}</div>
						<div class="tracker-elapsed text-muted small"></div>
					</div>
					<div class="tracker-btn-row">
						<button class="btn btn-primary btn-sm tracker-btn-start" disabled>${__("Start")}</button>
						<button class="btn btn-secondary btn-sm tracker-btn-pause" disabled>${__("Pause")}</button>
						<button class="btn btn-warning btn-sm tracker-btn-next" disabled>${__("Next")}</button>
						<button class="btn btn-danger btn-sm tracker-btn-stop" disabled>${__("Stop")}</button>
					</div>
				</div>
			</div>

			<div class="tracker-toolbar mb-3 flex flex-wrap" style="gap:8px;align-items:center">
				<select class="form-control tracker-scope" style="width:auto">
					<option value="mine">${__("My Work")}</option>
					<option value="team">${__("Team")}</option>
					<option value="both">${__("Mine + Team")}</option>
				</select>
				<button class="btn btn-default btn-sm tracker-btn-new-project">${__("New Project")}</button>
				<button class="btn btn-default btn-sm tracker-btn-new-task">${__("New Task")}</button>
				<button class="btn btn-default btn-sm tracker-btn-new-ticket">${__("New Ticket")}</button>
				<button class="btn btn-default btn-sm tracker-btn-assign">${__("Assign")}</button>
			</div>

			<ul class="nav nav-tabs tracker-tabs mb-2">
				<li class="nav-item"><a class="nav-link active" data-tab="tasks" href="#">${__("Tasks")}</a></li>
				<li class="nav-item"><a class="nav-link" data-tab="tickets" href="#">${__("Tickets")}</a></li>
				<li class="nav-item"><a class="nav-link" data-tab="running" href="#">${__("Who is Running")}</a></li>
			</ul>
			<div class="tracker-panel tracker-tasks"></div>
			<div class="tracker-panel tracker-tickets" style="display:none"></div>
			<div class="tracker-panel tracker-running" style="display:none"></div>
		</div>
	`);

	const state = {
		tasks: [],
		tickets: [],
		running: [],
		selected: null,
		selectedTicket: null,
		active: null,
		tab: "tasks",
		elapsedTimer: null,
	};

	const $root = $(page.main);
	const $label = $root.find(".tracker-active-label");
	const $elapsed = $root.find(".tracker-elapsed");
	const $tasks = $root.find(".tracker-tasks");
	const $tickets = $root.find(".tracker-tickets");
	const $running = $root.find(".tracker-running");
	const $start = $root.find(".tracker-btn-start");
	const $pause = $root.find(".tracker-btn-pause");
	const $next = $root.find(".tracker-btn-next");
	const $stop = $root.find(".tracker-btn-stop");

	function fmtElapsed(sec) {
		sec = Math.max(0, Math.floor(sec || 0));
		const h = Math.floor(sec / 3600);
		const m = Math.floor((sec % 3600) / 60);
		const s = sec % 60;
		return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}

	function refreshButtons() {
		const hasSel = !!state.selected;
		const running = state.active && state.active.status === "Running";
		const paused = state.active && state.active.status === "Paused";
		$start.prop("disabled", !hasSel || running);
		$pause.prop("disabled", !running);
		$next.prop("disabled", !hasSel);
		$stop.prop("disabled", !(running || paused));
	}

	function tickElapsed() {
		if (!state.active) {
			$elapsed.text("");
			return;
		}
		let sec = state.active.elapsed_seconds || state.active.duration_seconds || 0;
		if (state.active.status === "Running" && state.active._tick_base != null) {
			sec = state.active._tick_base + (Date.now() - state.active._tick_started) / 1000;
		}
		$elapsed.text(__("Elapsed") + ": " + fmtElapsed(sec));
	}

	function renderActive() {
		if (!state.active) {
			$label.text(__("None"));
			$elapsed.text("");
			if (state.elapsedTimer) {
				clearInterval(state.elapsedTimer);
				state.elapsedTimer = null;
			}
		} else {
			const t = state.active.task || state.active.project || state.active.name;
			$label.text(`${state.active.status}: ${t}`);
			state.active._tick_base = state.active.elapsed_seconds || state.active.duration_seconds || 0;
			state.active._tick_started = Date.now();
			tickElapsed();
			if (state.elapsedTimer) clearInterval(state.elapsedTimer);
			state.elapsedTimer = setInterval(tickElapsed, 1000);
		}
		refreshButtons();
	}

	function scopeArgs() {
		const scope = $root.find(".tracker-scope").val();
		return {
			mine: scope === "mine" || scope === "both" ? 1 : 0,
			team: scope === "team" || scope === "both" ? 1 : 0,
			page_size: 100,
			tree: 1,
		};
	}

	function renderTasks() {
		if (!state.tasks.length) {
			$tasks.html(`<p class="text-muted">${__("No tasks.")}</p>`);
			return;
		}
		const byParent = {};
		state.tasks.forEach((t) => {
			const p = t.parent_task || "";
			(byParent[p] = byParent[p] || []).push(t);
		});
		const render = (t, depth) => {
			const selected = state.selected === t.name ? "selected" : "";
			const pad = depth * 16;
			let html = `<div class="tracker-task-row ${selected}" data-name="${frappe.utils.escape_html(t.name)}" style="padding-left:${pad + 12}px">
				<strong>${frappe.utils.escape_html(t.subject || t.name)}</strong>
				<span class="text-muted"> · ${frappe.utils.escape_html(t.status || "")} · ${frappe.utils.escape_html(t.project || "")}</span>
			</div>`;
			(byParent[t.name] || []).forEach((c) => {
				html += render(c, depth + 1);
			});
			return html;
		};
		// Prefer roots; if tree=1 returned only roots, children may be missing — list flat then
		const roots = state.tasks.filter((t) => !t.parent_task);
		let html = "";
		if (roots.length) {
			roots.forEach((r) => (html += render(r, 0)));
		} else {
			state.tasks.forEach((t) => (html += render(t, 0)));
		}
		$tasks.html(html);
		$tasks.find(".tracker-task-row").on("click", function () {
			state.selected = $(this).data("name");
			$tasks.find(".tracker-task-row").removeClass("selected");
			$(this).addClass("selected");
			refreshButtons();
		});
	}

	function renderTickets() {
		if (!state.tickets.length) {
			$tickets.html(`<p class="text-muted">${__("No tickets.")}</p>`);
			return;
		}
		const rows = state.tickets
			.map((t) => {
				const selected = state.selectedTicket === t.name ? "selected" : "";
				return `<div class="tracker-task-row ${selected}" data-name="${frappe.utils.escape_html(t.name)}">
					<strong>${frappe.utils.escape_html(t.subject || t.name)}</strong>
					<span class="text-muted"> · ${frappe.utils.escape_html(t.status || "")} · ${frappe.utils.escape_html(t.project || "")}</span>
				</div>`;
			})
			.join("");
		$tickets.html(rows);
		$tickets.find(".tracker-task-row").on("click", function () {
			state.selectedTicket = $(this).data("name");
			$tickets.find(".tracker-task-row").removeClass("selected");
			$(this).addClass("selected");
		});
	}

	function renderRunning() {
		if (!state.running.length) {
			$running.html(`<p class="text-muted">${__("Nobody is running a timer.")}</p>`);
			return;
		}
		const rows = state.running
			.map((s) => {
				return `<div class="tracker-task-row">
					<strong>${frappe.utils.escape_html(s.user || "")}</strong>
					<span class="text-muted"> · ${frappe.utils.escape_html(s.task || s.project || s.name)} · ${fmtElapsed(s.elapsed_seconds)}</span>
				</div>`;
			})
			.join("");
		$running.html(rows);
	}

	function showTab(tab) {
		state.tab = tab;
		$root.find(".tracker-tabs .nav-link").removeClass("active");
		$root.find(`.tracker-tabs .nav-link[data-tab="${tab}"]`).addClass("active");
		$root.find(".tracker-panel").hide();
		if (tab === "tasks") $tasks.show();
		if (tab === "tickets") $tickets.show();
		if (tab === "running") $running.show();
	}

	function load() {
		const args = scopeArgs();
		return Promise.all([
			frappe.call("tracker.api.v1.tasks.list_tasks", args),
			frappe.call("tracker.api.v1.activity.active"),
			frappe.call("tracker.api.v1.tickets.list_tickets", { page_size: 100 }),
			frappe.call("tracker.api.v1.activity.running_now"),
		]).then(([tasksRes, activeRes, ticketsRes, runningRes]) => {
			const unwrap = (res) => {
				const m = res.message || {};
				return m.success === false ? null : m.data;
			};
			state.tasks = unwrap(tasksRes) || [];
			state.active = unwrap(activeRes);
			state.tickets = unwrap(ticketsRes) || [];
			state.running = unwrap(runningRes) || [];
			renderTasks();
			renderTickets();
			renderRunning();
			renderActive();
		}).catch((e) => {
			frappe.msgprint({ title: __("Error"), message: e.message || e, indicator: "red" });
		});
	}

	function callActivity(method, args) {
		frappe.call({
			method,
			args: args || {},
			freeze: true,
			callback: (r) => {
				if (r.message && r.message.success === false) {
					frappe.msgprint({
						title: __("Activity"),
						message: (r.message.error && r.message.error.message) || __("Failed"),
						indicator: "red",
					});
				}
				load();
			},
			error: () => load(),
		});
	}

	$start.on("click", () => {
		if (!state.selected) return;
		callActivity("tracker.api.v1.activity.start", { task: state.selected });
	});
	$pause.on("click", () => callActivity("tracker.api.v1.activity.pause"));
	$stop.on("click", () => callActivity("tracker.api.v1.activity.stop"));
	$next.on("click", () => {
		if (!state.selected) return;
		callActivity("tracker.api.v1.activity.next", { task: state.selected });
	});

	$root.find(".tracker-scope").on("change", () => load());
	$root.find(".tracker-tabs .nav-link").on("click", function (e) {
		e.preventDefault();
		showTab($(this).data("tab"));
	});

	$root.find(".tracker-btn-new-project").on("click", () => {
		const d = new frappe.ui.Dialog({
			title: __("New Project"),
			fields: [{ fieldname: "project_name", label: __("Project Name"), fieldtype: "Data", reqd: 1 }],
			primary_action_label: __("Create"),
			primary_action(values) {
				frappe.call({
					method: "tracker.api.v1.projects.create_project",
					args: { project_name: values.project_name },
					freeze: true,
					callback: () => {
						d.hide();
						load();
					},
				});
			},
		});
		d.show();
	});

	$root.find(".tracker-btn-new-task").on("click", () => {
		const d = new frappe.ui.Dialog({
			title: __("New Task"),
			fields: [
				{ fieldname: "subject", label: __("Subject"), fieldtype: "Data", reqd: 1 },
				{ fieldname: "project", label: __("Project"), fieldtype: "Link", options: "Project" },
				{ fieldname: "parent_task", label: __("Parent Task"), fieldtype: "Link", options: "Task" },
				{ fieldname: "assign_to", label: __("Assign To"), fieldtype: "Link", options: "User" },
			],
			primary_action_label: __("Create"),
			primary_action(values) {
				frappe.call({
					method: "tracker.api.v1.tasks.create_task",
					args: values,
					freeze: true,
					callback: () => {
						d.hide();
						load();
					},
				});
			},
		});
		d.show();
	});

	$root.find(".tracker-btn-new-ticket").on("click", () => {
		const d = new frappe.ui.Dialog({
			title: __("New Ticket"),
			fields: [
				{ fieldname: "subject", label: __("Subject"), fieldtype: "Data", reqd: 1 },
				{ fieldname: "project", label: __("Project"), fieldtype: "Link", options: "Project" },
				{ fieldname: "description", label: __("Description"), fieldtype: "Small Text" },
				{ fieldname: "assign_to", label: __("Assign To"), fieldtype: "Link", options: "User" },
			],
			primary_action_label: __("Create"),
			primary_action(values) {
				frappe.call({
					method: "tracker.api.v1.tickets.create_ticket",
					args: values,
					freeze: true,
					callback: () => {
						d.hide();
						showTab("tickets");
						load();
					},
				});
			},
		});
		d.show();
	});

	$root.find(".tracker-btn-assign").on("click", () => {
		const isTicket = state.tab === "tickets";
		const name = isTicket ? state.selectedTicket : state.selected;
		const doctype = isTicket ? "Issue" : "Task";
		if (!name) {
			frappe.msgprint(__("Select a task or ticket first."));
			return;
		}
		const d = new frappe.ui.Dialog({
			title: __("Assign") + " " + doctype,
			fields: [{ fieldname: "user", label: __("User"), fieldtype: "Link", options: "User", reqd: 1 }],
			primary_action_label: __("Assign"),
			primary_action(values) {
				frappe.call({
					method: "tracker.api.v1.hierarchy.assign",
					args: { doctype, name, user: values.user },
					freeze: true,
					callback: (r) => {
						if (r.message && r.message.success === false) {
							frappe.msgprint({
								title: __("Assign failed"),
								message: (r.message.error && r.message.error.message) || __("Not allowed"),
								indicator: "red",
							});
						} else {
							frappe.show_alert({ message: __("Assigned"), indicator: "green" });
							d.hide();
							load();
						}
					},
				});
			},
		});
		d.show();
	});

	page.set_primary_action(__("Refresh"), () => load());
	load();
};

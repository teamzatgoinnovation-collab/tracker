frappe.pages["tracker-workbench"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Tracker Workbench"),
		single_column: true,
	});

	page.main.html(`
		<div class="tracker-workbench">
			<div class="tracker-active card p-3 mb-3">
				<div class="flex justify-between align-center">
					<div>
						<div class="text-muted">${__("Active session")}</div>
						<div class="tracker-active-label font-bold">${__("None")}</div>
					</div>
					<div class="tracker-btn-row">
						<button class="btn btn-primary btn-sm tracker-btn-start" disabled>${__("Start")}</button>
						<button class="btn btn-secondary btn-sm tracker-btn-pause" disabled>${__("Pause")}</button>
						<button class="btn btn-warning btn-sm tracker-btn-next" disabled>${__("Next")}</button>
					</div>
				</div>
			</div>
			<div class="tracker-tasks"></div>
		</div>
	`);

	const state = {
		tasks: [],
		selected: null,
		active: null,
	};

	const $root = $(page.main);
	const $label = $root.find(".tracker-active-label");
	const $tasks = $root.find(".tracker-tasks");
	const $start = $root.find(".tracker-btn-start");
	const $pause = $root.find(".tracker-btn-pause");
	const $next = $root.find(".tracker-btn-next");

	function refreshButtons() {
		const hasSel = !!state.selected;
		const running = state.active && state.active.status === "Running";
		const paused = state.active && state.active.status === "Paused";
		$start.prop("disabled", !hasSel || running);
		$pause.prop("disabled", !running);
		$next.prop("disabled", !hasSel);
	}

	function renderActive() {
		if (!state.active) {
			$label.text(__("None"));
		} else {
			const t = state.active.task || state.active.project || state.active.name;
			$label.text(`${state.active.status}: ${t}`);
		}
		refreshButtons();
	}

	function renderTasks() {
		if (!state.tasks.length) {
			$tasks.html(`<p class="text-muted">${__("No tasks assigned to you.")}</p>`);
			return;
		}
		const rows = state.tasks
			.map((t) => {
				const selected = state.selected === t.name ? "selected" : "";
				const sub = t.parent_task ? ` · sub of ${t.parent_task}` : "";
				return `<div class="tracker-task-row ${selected}" data-name="${frappe.utils.escape_html(t.name)}">
					<strong>${frappe.utils.escape_html(t.subject || t.name)}</strong>
					<span class="text-muted"> · ${frappe.utils.escape_html(t.status || "")}${frappe.utils.escape_html(sub)}</span>
				</div>`;
			})
			.join("");
		$tasks.html(rows);
		$tasks.find(".tracker-task-row").on("click", function () {
			state.selected = $(this).data("name");
			$tasks.find(".tracker-task-row").removeClass("selected");
			$(this).addClass("selected");
			refreshButtons();
		});
	}

	function load() {
		return Promise.all([
			frappe.call("tracker.api.v1.tasks.list_tasks", { mine: 1, page_size: 100 }),
			frappe.call("tracker.api.v1.activity.active"),
		]).then(([tasksRes, activeRes]) => {
			const tdata = tasksRes.message || {};
			state.tasks = tdata.success === false ? [] : tdata.data || [];
			const adata = activeRes.message || {};
			state.active = adata.success === false ? null : adata.data;
			renderTasks();
			renderActive();
		});
	}

	$start.on("click", () => {
		if (!state.selected) return;
		frappe.call({
			method: "tracker.api.v1.activity.start",
			args: { task: state.selected },
			freeze: true,
			callback: () => load(),
		});
	});

	$pause.on("click", () => {
		frappe.call({
			method: "tracker.api.v1.activity.pause",
			freeze: true,
			callback: () => load(),
		});
	});

	$next.on("click", () => {
		if (!state.selected) return;
		frappe.call({
			method: "tracker.api.v1.activity.next",
			args: { task: state.selected },
			freeze: true,
			callback: () => load(),
		});
	});

	page.set_primary_action(__("Refresh"), () => load());
	load();
};

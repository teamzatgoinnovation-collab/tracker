frappe.pages["tracker-workbench"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Task Management"),
		single_column: true,
	});

	page.main.html('<div class="tracker-workbench-root"></div>');
	const el = page.main.find(".tracker-workbench-root")[0];

	const emptyCaps = () => ({
		can_manage_work: false,
		can_review: false,
		can_submit_timesheets: false,
		can_approve_timesheets: false,
		can_close_project: false,
		can_create_top: false,
		can_assign_org: false,
		can_create_sub: false,
		can_create_worker: false,
		is_worker_only: false,
		is_top: false,
		is_lead_or_above: false,
	});

	const WorkbenchApp = {
		data() {
			return {
				caps: emptyCaps(),
				roleLabel: "",
				tab: "tasks",
				tasks: [],
				tickets: [],
				running: [],
				review: [],
				overview: { counts: {}, status: "Pending Review", items: [], running: 0, timesheet_drafts: 0 },
				selected: null,
				active: null,
				scope: "mine",
				projectFilter: "",
				statusFilter: "",
				people: [],
				busy: false,
				elapsedTimer: null,
				tick: 0,
			};
		},
		computed: {
			showOverview() {
				return !!(this.caps.can_review || this.caps.is_top);
			},
			activeLabel() {
				if (!this.active) return __("None");
				const t = this.active.task || this.active.project || this.active.name;
				return `${this.active.status}: ${t}`;
			},
			elapsedText() {
				void this.tick;
				if (!this.active) return "";
				let sec = Number(this.active.elapsed_seconds || this.active.duration_seconds || 0);
				if (this.active.status === "Running" && this.active._tick_at) {
					sec += (Date.now() - this.active._tick_at) / 1000;
				}
				const h = Math.floor(sec / 3600);
				const m = Math.floor((sec % 3600) / 60);
				const s = Math.floor(sec % 60);
				return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
			},
			canStart() {
				return !!this.selected && !(this.active && this.active.status === "Running" && this.active.task === this.selected);
			},
			canPause() {
				return !!(this.active && this.active.status === "Running");
			},
			canStop() {
				return !!(this.active && (this.active.status === "Running" || this.active.status === "Paused"));
			},
			statusChips() {
				const order = ["Open", "Working", "Pending Review", "Completed", "Cancelled", "Overdue"];
				const counts = this.overview.counts || {};
				const keys = [...order.filter((k) => counts[k] != null), ...Object.keys(counts).filter((k) => !order.includes(k))];
				return keys.map((k) => ({ status: k, count: counts[k] || 0 }));
			},
		},
		mounted() {
			this.boot();
			this.elapsedTimer = setInterval(() => {
				if (this.active && this.active.status === "Running") this.tick++;
			}, 1000);
		},
		unmounted() {
			if (this.elapsedTimer) clearInterval(this.elapsedTimer);
		},
		methods: {
			statusClass(status) {
				const s = (status || "").toLowerCase().replace(/\s+/g, "-");
				return `tracker-status tracker-status-${s}`;
			},
			call(method, args) {
				return new Promise((resolve, reject) => {
					frappe.call({
						method,
						args: args || {},
						callback: (r) => {
							const msg = r.message;
							if (msg && msg.success === false) {
								const err = (msg.error && msg.error.message) || "Request failed";
								reject(new Error(err));
								return;
							}
							resolve(msg);
						},
						error: (err) => reject(err),
					});
				});
			},
			unwrap(msg) {
				if (!msg) return null;
				if (msg.data !== undefined) return msg.data;
				return msg;
			},
			async boot() {
				try {
					await this.loadCaps();
					if (this.showOverview) this.tab = "overview";
					await Promise.all([this.refreshActive(), this.refreshTab()]);
				} catch (e) {
					frappe.msgprint({ title: __("Task Management"), message: String(e.message || e), indicator: "red" });
				}
			},
			async loadCaps() {
				try {
					const msg = await this.call("tracker.api.v1.hierarchy.my_tree");
					const data = this.unwrap(msg) || {};
					this.caps = { ...emptyCaps(), ...data };
					this.people = data.people || [];
					if (data.is_top) this.roleLabel = __("Manager");
					else if (data.is_lead_or_above) this.roleLabel = __("Lead");
					else if (data.is_worker_only) this.roleLabel = __("Worker");
					else this.roleLabel = "";
				} catch (e) {
					this.caps = emptyCaps();
					frappe.show_alert({ message: __("Could not load role capabilities"), indicator: "orange" });
				}
			},
			async refreshActive() {
				const msg = await this.call("tracker.api.v1.activity.active");
				const data = this.unwrap(msg);
				this.active = data || null;
				if (this.active && this.active.status === "Running") {
					this.active._tick_at = Date.now();
				}
			},
			async refreshTab() {
				if (this.tab === "overview") return this.loadOverview();
				if (this.tab === "tasks") return this.loadTasks();
				if (this.tab === "tickets") return this.loadTickets();
				if (this.tab === "running") return this.loadRunning();
				if (this.tab === "review") return this.loadReview();
			},
			async loadOverview(status) {
				const st = status || this.overview.status || "Pending Review";
				const msg = await this.call("tracker.api.v1.reports.overview", { status: st });
				const data = this.unwrap(msg) || {};
				this.overview = {
					counts: data.counts || {},
					status: data.status || st,
					items: data.items || [],
					running: data.running || 0,
					timesheet_drafts: data.timesheet_drafts || 0,
				};
			},
			async loadTasks() {
				const args = { page: 1, page_size: 50 };
				if (this.scope === "mine") args.mine = 1;
				else if (this.scope === "team") args.team = 1;
				else {
					args.mine = 1;
					args.team = 1;
				}
				if (this.projectFilter) args.project = this.projectFilter;
				if (this.statusFilter) args.status = this.statusFilter;
				const msg = await this.call("tracker.api.v1.tasks.list_tasks", args);
				const data = this.unwrap(msg);
				this.tasks = (data && data.items) || data || [];
			},
			async loadTickets() {
				const msg = await this.call("tracker.api.v1.tickets.list_tickets", { page: 1, page_size: 50 });
				const data = this.unwrap(msg);
				this.tickets = (data && data.items) || data || [];
			},
			async loadRunning() {
				const msg = await this.call("tracker.api.v1.activity.running_now");
				this.running = this.unwrap(msg) || [];
			},
			async loadReview() {
				const msg = await this.call("tracker.api.v1.tasks.list_tasks", {
					review_queue: 1,
					page: 1,
					page_size: 50,
				});
				const data = this.unwrap(msg);
				this.review = (data && data.items) || data || [];
			},
			setTab(tab) {
				this.tab = tab;
				this.refreshTab();
			},
			selectTask(name) {
				this.selected = name;
			},
			async actStart() {
				if (!this.selected) return;
				this.busy = true;
				try {
					await this.call("tracker.api.v1.activity.start", { task: this.selected });
					await this.refreshActive();
					await this.refreshTab();
				} catch (e) {
					frappe.msgprint({ title: __("Start"), message: String(e.message || e), indicator: "red" });
				} finally {
					this.busy = false;
				}
			},
			async actPause() {
				this.busy = true;
				try {
					await this.call("tracker.api.v1.activity.pause");
					await this.refreshActive();
				} catch (e) {
					frappe.msgprint({ title: __("Pause"), message: String(e.message || e), indicator: "red" });
				} finally {
					this.busy = false;
				}
			},
			async actStop() {
				this.busy = true;
				try {
					const msg = await this.call("tracker.api.v1.activity.stop");
					const data = this.unwrap(msg) || {};
					await this.refreshActive();
					await this.refreshTab();
					if (data.timesheet) {
						frappe.show_alert({
							message: __("Timesheet {0}", [data.timesheet]),
							indicator: "green",
						});
					} else {
						frappe.show_alert({ message: __("Session stopped"), indicator: "blue" });
					}
				} catch (e) {
					frappe.msgprint({ title: __("Stop"), message: String(e.message || e), indicator: "red" });
				} finally {
					this.busy = false;
				}
			},
			async submitReview(name) {
				try {
					await this.call("tracker.api.v1.tasks.submit_for_review", { name });
					frappe.show_alert({ message: __("Submitted for review"), indicator: "green" });
					await this.refreshTab();
				} catch (e) {
					frappe.msgprint(String(e.message || e));
				}
			},
			async approve(name) {
				try {
					await this.call("tracker.api.v1.tasks.approve", { name });
					frappe.show_alert({ message: __("Approved"), indicator: "green" });
					await this.refreshTab();
				} catch (e) {
					frappe.msgprint(String(e.message || e));
				}
			},
			async rework(name) {
				const note = await new Promise((resolve) => {
					frappe.prompt(
						[{ fieldname: "note", fieldtype: "Small Text", label: __("Rework note"), reqd: 1 }],
						(v) => resolve(v.note),
						__("Request rework")
					);
				});
				if (!note) return;
				try {
					await this.call("tracker.api.v1.tasks.request_rework", { name, note });
					frappe.show_alert({ message: __("Sent for rework"), indicator: "orange" });
					await this.refreshTab();
				} catch (e) {
					frappe.msgprint(String(e.message || e));
				}
			},
			async newProject() {
				const values = await new Promise((resolve) => {
					frappe.prompt(
						[
							{ fieldname: "project_name", fieldtype: "Data", label: __("Project Name"), reqd: 1 },
						],
						(v) => resolve(v),
						__("New Project")
					);
				});
				if (!values) return;
				try {
					await this.call("tracker.api.v1.projects.create_project", values);
					frappe.show_alert({ message: __("Project created"), indicator: "green" });
					await this.refreshTab();
				} catch (e) {
					frappe.msgprint(String(e.message || e));
				}
			},
			async newTask() {
				const values = await new Promise((resolve) => {
					frappe.prompt(
						[
							{ fieldname: "subject", fieldtype: "Data", label: __("Subject"), reqd: 1 },
							{ fieldname: "project", fieldtype: "Link", options: "Project", label: __("Project") },
						],
						(v) => resolve(v),
						__("New Task")
					);
				});
				if (!values) return;
				try {
					await this.call("tracker.api.v1.tasks.create_task", values);
					frappe.show_alert({ message: __("Task created"), indicator: "green" });
					await this.refreshTab();
				} catch (e) {
					frappe.msgprint(String(e.message || e));
				}
			},
			async submitTimesheets() {
				try {
					const msg = await this.call("tracker.api.v1.timesheets.submit_team");
					const data = this.unwrap(msg) || {};
					frappe.msgprint(
						__("Submitted: {0}. Errors: {1}", [
							(data.submitted || []).length,
							(data.errors || []).length,
						])
					);
				} catch (e) {
					frappe.msgprint(String(e.message || e));
				}
			},
			taskActions(row) {
				const status = row.status || "";
				const btns = [];
				if (status === "Working") {
					btns.push({ key: "ready", label: __("Pending Review"), fn: () => this.submitReview(row.name) });
				}
				if (status === "Pending Review" && this.caps.can_review) {
					btns.push({ key: "approve", label: __("Approve"), fn: () => this.approve(row.name) });
					btns.push({ key: "rework", label: __("Rework"), fn: () => this.rework(row.name) });
				}
				return btns;
			},
		},
		template: `
		<div class="tracker-workbench">
			<div class="tracker-role-strip" v-if="roleLabel">
				<span class="text-muted">{{ __("Role") }}:</span> <strong>{{ roleLabel }}</strong>
			</div>

			<div class="tracker-active card p-3 mb-3">
				<div class="flex justify-between align-center flex-wrap" style="gap:12px">
					<div>
						<div class="text-muted">{{ __("Active session") }}</div>
						<div class="tracker-active-label font-bold">{{ activeLabel }}</div>
						<div class="tracker-elapsed text-muted small" v-if="active">{{ elapsedText }}</div>
					</div>
					<div class="tracker-btn-row">
						<button class="btn btn-primary btn-sm" :disabled="!canStart || busy" @click="actStart">{{ __("Start") }}</button>
						<button class="btn btn-secondary btn-sm" :disabled="!canPause || busy" @click="actPause">{{ __("Pause") }}</button>
						<button class="btn btn-danger btn-sm" :disabled="!canStop || busy" @click="actStop">{{ __("Stop") }}</button>
					</div>
				</div>
			</div>

			<div class="tracker-toolbar mb-3 flex flex-wrap" style="gap:8px;align-items:center">
				<select class="form-control" style="width:auto" v-model="scope" @change="loadTasks" v-if="tab==='tasks'">
					<option value="mine">{{ __("My Work") }}</option>
					<option value="team" v-if="caps.is_lead_or_above">{{ __("Team") }}</option>
					<option value="both" v-if="caps.is_lead_or_above">{{ __("Mine + Team") }}</option>
				</select>
				<input class="form-control" style="width:10rem" v-model="projectFilter" :placeholder="__('Project')" v-if="tab==='tasks'" @change="loadTasks" />
				<input class="form-control" style="width:8rem" v-model="statusFilter" :placeholder="__('Status')" v-if="tab==='tasks'" @change="loadTasks" />
				<button class="btn btn-default btn-sm" v-if="caps.can_manage_work" @click="newProject">{{ __("New Project") }}</button>
				<button class="btn btn-default btn-sm" v-if="caps.can_manage_work" @click="newTask">{{ __("New Task") }}</button>
				<button class="btn btn-default btn-sm" v-if="caps.can_submit_timesheets" @click="submitTimesheets">{{ __("Submit team timesheets") }}</button>
			</div>

			<ul class="nav nav-tabs tracker-tabs mb-2">
				<li class="nav-item" v-if="showOverview">
					<a class="nav-link" :class="{active: tab==='overview'}" href="#" @click.prevent="setTab('overview')">{{ __("Overview") }}</a>
				</li>
				<li class="nav-item">
					<a class="nav-link" :class="{active: tab==='tasks'}" href="#" @click.prevent="setTab('tasks')">{{ __("Tasks") }}</a>
				</li>
				<li class="nav-item">
					<a class="nav-link" :class="{active: tab==='tickets'}" href="#" @click.prevent="setTab('tickets')">{{ __("Tickets") }}</a>
				</li>
				<li class="nav-item">
					<a class="nav-link" :class="{active: tab==='running'}" href="#" @click.prevent="setTab('running')">{{ __("Who is Running") }}</a>
				</li>
				<li class="nav-item" v-if="caps.can_review">
					<a class="nav-link" :class="{active: tab==='review'}" href="#" @click.prevent="setTab('review')">{{ __("Review") }}</a>
				</li>
			</ul>

			<div v-if="tab==='overview'" class="tracker-panel">
				<div class="tracker-chip-row mb-3">
					<button
						v-for="chip in statusChips"
						:key="chip.status"
						class="btn btn-sm tracker-chip"
						:class="[statusClass(chip.status), {active: overview.status===chip.status}]"
						@click="loadOverview(chip.status)"
					>
						{{ chip.status }} <span class="badge">{{ chip.count }}</span>
					</button>
					<span class="tracker-chip tracker-status-running btn btn-sm disabled">
						{{ __("Running") }} <span class="badge">{{ overview.running }}</span>
					</span>
					<span class="tracker-chip tracker-status-draft-ts btn btn-sm disabled" v-if="caps.can_submit_timesheets">
						{{ __("Draft Timesheets") }} <span class="badge">{{ overview.timesheet_drafts }}</span>
					</span>
				</div>
				<div v-if="!(overview.items||[]).length" class="text-muted p-3">{{ __("Nothing in this status") }}</div>
				<div
					v-for="row in overview.items"
					:key="row.name"
					class="tracker-task-row"
					:class="{selected: selected===row.name}"
					@click="selectTask(row.name)"
				>
					<div class="flex justify-between align-center flex-wrap" style="gap:8px">
						<div>
							<strong>{{ row.subject || row.name }}</strong>
							<span :class="statusClass(row.status)">{{ row.status }}</span>
							<div class="text-muted small">{{ row.project || "" }} · {{ row.name }}</div>
						</div>
						<div class="tracker-btn-row">
							<button
								v-for="b in taskActions(row)"
								:key="b.key"
								class="btn btn-xs"
								:class="b.key==='approve' ? 'btn-success' : (b.key==='rework' ? 'btn-warning' : 'btn-primary')"
								@click.stop="b.fn()"
							>{{ b.label }}</button>
						</div>
					</div>
				</div>
			</div>

			<div v-if="tab==='tasks'" class="tracker-panel">
				<div v-if="!tasks.length" class="text-muted p-3">{{ __("No tasks") }}</div>
				<div
					v-for="row in tasks"
					:key="row.name"
					class="tracker-task-row"
					:class="{selected: selected===row.name}"
					@click="selectTask(row.name)"
				>
					<div class="flex justify-between align-center flex-wrap" style="gap:8px">
						<div>
							<strong>{{ row.subject || row.name }}</strong>
							<span :class="statusClass(row.status)">{{ row.status }}</span>
							<div class="text-muted small">{{ row.project || "" }} · {{ row.name }}</div>
						</div>
						<div class="tracker-btn-row">
							<button
								v-for="b in taskActions(row)"
								:key="b.key"
								class="btn btn-xs"
								:class="b.key==='approve' ? 'btn-success' : (b.key==='rework' ? 'btn-warning' : 'btn-primary')"
								@click.stop="b.fn()"
							>{{ b.label }}</button>
						</div>
					</div>
				</div>
			</div>

			<div v-if="tab==='tickets'" class="tracker-panel">
				<div v-if="!tickets.length" class="text-muted p-3">{{ __("No tickets") }}</div>
				<div v-for="row in tickets" :key="row.name" class="tracker-task-row">
					<strong>{{ row.subject || row.name }}</strong>
					<span :class="statusClass(row.status)">{{ row.status }}</span>
				</div>
			</div>

			<div v-if="tab==='running'" class="tracker-panel">
				<div v-if="!running.length" class="text-muted p-3">{{ __("Nobody running") }}</div>
				<div v-for="row in running" :key="row.name" class="tracker-task-row">
					<strong>{{ row.user }}</strong>
					<span class="tracker-status tracker-status-running">{{ row.status }}</span>
					<div class="text-muted small">{{ row.task || row.project || row.name }}</div>
				</div>
			</div>

			<div v-if="tab==='review'" class="tracker-panel">
				<div v-if="!review.length" class="text-muted p-3">{{ __("Nothing pending review") }}</div>
				<div v-for="row in review" :key="row.name" class="tracker-task-row">
					<div class="flex justify-between align-center flex-wrap" style="gap:8px">
						<div>
							<strong>{{ row.subject || row.name }}</strong>
							<span :class="statusClass(row.status)">{{ row.status }}</span>
						</div>
						<div class="tracker-btn-row" v-if="caps.can_review">
							<button class="btn btn-xs btn-success" @click="approve(row.name)">{{ __("Approve") }}</button>
							<button class="btn btn-xs btn-warning" @click="rework(row.name)">{{ __("Rework") }}</button>
						</div>
					</div>
				</div>
			</div>
		</div>
		`,
	};

	let appInstance = null;
	tracker.vue.mount(el, WorkbenchApp).then((app) => {
		appInstance = app;
		wrapper.tracker_vue_app = app;
	});

	frappe.pages["tracker-workbench"].on_page_show = function () {
		const root = page.main.find(".tracker-workbench-root")[0];
		const vm = root && root.__vue_app__ && root.__vue_app__._instance && root.__vue_app__._instance.proxy;
		// refresh via stored app
		if (wrapper.tracker_vue_app && wrapper.tracker_vue_app._instance) {
			const proxy = wrapper.tracker_vue_app._instance.proxy;
			if (proxy && proxy.refreshTab) proxy.refreshTab();
			if (proxy && proxy.refreshActive) proxy.refreshActive();
		}
	};
};

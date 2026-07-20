frappe.pages["tracker-org"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Task Management Org"),
		single_column: true,
	});

	page.main.html('<div class="tracker-org-root"></div>');
	const el = page.main.find(".tracker-org-root")[0];

	const OrgApp = {
		data() {
			return {
				company: "",
				employees: [],
				caps: {
					can_create_top: false,
					can_assign_org: false,
					can_create_sub: false,
					can_create_worker: false,
				},
				hasBranch: false,
				assignForm: {
					email: "",
					full_name: "",
					company: "",
					branch: "",
					role: "Worker",
				},
				topForm: {
					email: "",
					full_name: "",
					company: "",
					branch: "",
				},
				busy: false,
			};
		},
		computed: {
			roleOptions() {
				const opts = [];
				if (this.caps.can_create_sub) opts.push("Sub");
				if (this.caps.can_create_worker) opts.push("Worker");
				return opts.length ? opts : ["Sub", "Worker"];
			},
		},
		mounted() {
			this.refresh();
		},
		methods: {
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
							resolve(msg && msg.data !== undefined ? msg.data : msg);
						},
						error: (e) => reject(e),
					});
				});
			},
			async refresh() {
				try {
					const [tree, caps] = await Promise.all([
						this.call("tracker.api.v1.hierarchy.org_tree"),
						this.call("tracker.api.v1.hierarchy.my_tree"),
					]);
					this.company = (tree && tree.company) || "";
					this.employees = (tree && tree.employees) || [];
					this.hasBranch = this.employees.some((e) => e.branch != null && e.branch !== undefined) ||
						this.employees.some((e) => "branch" in (e || {}));
					this.caps = {
						can_create_top: !!caps.can_create_top,
						can_assign_org: !!caps.can_assign_org,
						can_create_sub: !!caps.can_create_sub,
						can_create_worker: !!caps.can_create_worker,
					};
					if (!this.assignForm.company) this.assignForm.company = this.company;
					if (!this.topForm.company) this.topForm.company = this.company;
					if (this.roleOptions.length && !this.roleOptions.includes(this.assignForm.role)) {
						this.assignForm.role = this.roleOptions[0];
					}
				} catch (e) {
					frappe.msgprint({ title: __("Org"), message: String(e.message || e), indicator: "red" });
				}
			},
			showPassword(pwd, email) {
				if (!pwd) return;
				frappe.msgprint({
					title: __("Temporary password"),
					message: __("User {0} temporary password: <code>{1}</code>", [email, pwd]),
					indicator: "green",
				});
			},
			async assignMember() {
				if (!this.caps.can_assign_org) return;
				this.busy = true;
				try {
					const args = { ...this.assignForm };
					if (!args.branch) delete args.branch;
					const data = await this.call("tracker.api.v1.hierarchy.assign_org_member", args);
					this.showPassword(data && data.temporary_password, args.email);
					frappe.show_alert({ message: __("Member assigned"), indicator: "green" });
					this.assignForm.email = "";
					this.assignForm.full_name = "";
					await this.refresh();
				} catch (e) {
					frappe.msgprint(String(e.message || e));
				} finally {
					this.busy = false;
				}
			},
			async createTop() {
				if (!this.caps.can_create_top) return;
				this.busy = true;
				try {
					const args = { ...this.topForm };
					if (!args.branch) delete args.branch;
					const data = await this.call("tracker.api.v1.hierarchy.create_top_member", args);
					this.showPassword(data && data.temporary_password, args.email);
					frappe.show_alert({ message: __("Top created"), indicator: "green" });
					this.topForm.email = "";
					this.topForm.full_name = "";
					await this.refresh();
				} catch (e) {
					frappe.msgprint(String(e.message || e));
				} finally {
					this.busy = false;
				}
			},
			async seedDemo() {
				frappe.confirm(__("Seed demo org users? Password Tracker@123."), async () => {
					try {
						await this.call("tracker.api.v1.hierarchy.seed_demo");
						frappe.show_alert({ message: __("Demo org seeded"), indicator: "green" });
						await this.refresh();
					} catch (e) {
						frappe.msgprint(String(e.message || e));
					}
				});
			},
			async seedWork() {
				frappe.confirm(
					__("Seed full demo: org, project, tasks, tickets, timesheets?"),
					async () => {
						try {
							await this.call("tracker.api.v1.hierarchy.seed_demo_work");
							frappe.show_alert({ message: __("Demo work seeded"), indicator: "green" });
							await this.refresh();
						} catch (e) {
							frappe.msgprint(String(e.message || e));
						}
					}
				);
			},
		},
		template: `
		<div class="tracker-org">
			<p class="text-muted">
				{{ __("Company") }}: <strong>{{ company || "—" }}</strong>
			</p>

			<div class="mb-3" v-if="caps.can_create_top">
				<button class="btn btn-default btn-sm" @click="seedDemo">{{ __("Seed demo org") }}</button>
				<button class="btn btn-default btn-sm" @click="seedWork">{{ __("Seed demo work") }}</button>
			</div>

			<div class="card p-3 mb-3" v-if="caps.can_assign_org">
				<h5>{{ __("Assign person") }}</h5>
				<div class="tracker-form-grid">
					<input class="form-control" v-model="assignForm.email" :placeholder="__('Email')" />
					<input class="form-control" v-model="assignForm.full_name" :placeholder="__('Full name')" />
					<input class="form-control" v-model="assignForm.company" :placeholder="__('Company')" />
					<input class="form-control" v-if="hasBranch" v-model="assignForm.branch" :placeholder="__('Branch')" />
					<select class="form-control" v-model="assignForm.role">
						<option v-for="r in roleOptions" :key="r" :value="r">{{ r }}</option>
					</select>
					<button class="btn btn-primary btn-sm" :disabled="busy" @click="assignMember">{{ __("Assign") }}</button>
				</div>
			</div>

			<div class="card p-3 mb-3" v-if="caps.can_create_top">
				<h5>{{ __("Create Top") }} <span class="text-muted small">({{ __("System Manager") }})</span></h5>
				<div class="tracker-form-grid">
					<input class="form-control" v-model="topForm.email" :placeholder="__('Email')" />
					<input class="form-control" v-model="topForm.full_name" :placeholder="__('Full name')" />
					<input class="form-control" v-model="topForm.company" :placeholder="__('Company')" />
					<input class="form-control" v-if="hasBranch" v-model="topForm.branch" :placeholder="__('Branch')" />
					<button class="btn btn-primary btn-sm" :disabled="busy" @click="createTop">{{ __("Create Top") }}</button>
				</div>
			</div>

			<h5>{{ __("Employees") }}</h5>
			<div v-if="!employees.length" class="text-muted">{{ __("No employees") }}</div>
			<div v-for="emp in employees" :key="emp.name" class="tracker-org-row">
				<strong>{{ emp.employee_name || emp.name }}</strong>
				<span class="text-muted">{{ emp.user_id || "" }}</span>
				<span class="badge">{{ emp.tracker_org_role || "—" }}</span>
				<span class="text-muted small" v-if="emp.branch">{{ emp.branch }}</span>
				<span class="text-muted small">{{ (emp.roles || []).join(", ") }}</span>
				<span class="text-muted small" v-if="emp.reports_to">→ {{ emp.reports_to }}</span>
			</div>
		</div>
		`,
	};

	tracker.vue.mount(el, OrgApp).then((app) => {
		wrapper.tracker_org_vue = app;
	});
};

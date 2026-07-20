frappe.pages["tracker-org"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Task Management Org Setup"),
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
			treeRows() {
				const rows = this.employees || [];
				const byName = {};
				rows.forEach((e) => (byName[e.name] = e));
				const roots = rows.filter((e) => !e.reports_to || !byName[e.reports_to]);
				const childrenOf = (parent) => rows.filter((e) => e.reports_to === parent);
				const out = [];
				const walk = (emp, depth) => {
					out.push({ emp, depth });
					childrenOf(emp.name).forEach((c) => walk(c, depth + 1));
				};
				roots.forEach((r) => walk(r, 0));
				return out;
			},
			isSystemManager() {
				return (
					frappe.session.user === "Administrator" ||
					(frappe.user_roles || []).includes("System Manager") ||
					!!this.caps.can_create_top
				);
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
								const err =
									(msg.error && msg.error.message) ||
									msg.message ||
									"Request failed";
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
					this.hasBranch = this.employees.some((e) =>
						Object.prototype.hasOwnProperty.call(e || {}, "branch")
					);
					this.caps = {
						can_create_top: !!(caps && caps.can_create_top),
						can_assign_org: !!(caps && caps.can_assign_org),
						can_create_sub: !!(caps && caps.can_create_sub),
						can_create_worker: !!(caps && caps.can_create_worker),
					};
					if (!this.assignForm.company) this.assignForm.company = this.company;
					if (!this.topForm.company) this.topForm.company = this.company;
					if (this.roleOptions.length && !this.roleOptions.includes(this.assignForm.role)) {
						this.assignForm.role = this.roleOptions[0];
					}
				} catch (e) {
					frappe.msgprint({
						title: __("Org"),
						message: String(e.message || e),
						indicator: "red",
					});
				}
			},
			showPassword(pwd, email) {
				if (!pwd) return;
				frappe.msgprint({
					title: __("Temporary password"),
					message: __(
						"Copy this password now — it will not be shown again.<br>User {0}: <code>{1}</code>",
						[frappe.utils.escape_html(email || ""), frappe.utils.escape_html(String(pwd))]
					),
					indicator: "orange",
				});
			},
			async assignMember() {
				if (!this.caps.can_assign_org) return;
				if (!this.assignForm.email || !this.assignForm.full_name || !this.assignForm.company) {
					frappe.msgprint(__("Email, full name, and company are required."));
					return;
				}
				this.busy = true;
				try {
					const args = { ...this.assignForm };
					if (!args.branch) delete args.branch;
					const data = await this.call(
						"tracker.api.v1.hierarchy.assign_org_member",
						args
					);
					this.showPassword(data && data.temporary_password, args.email);
					frappe.show_alert({ message: __("Member assigned"), indicator: "green" });
					this.assignForm.email = "";
					this.assignForm.full_name = "";
					await this.refresh();
				} catch (e) {
					frappe.msgprint({
						title: __("Assign failed"),
						message: String(e.message || e),
						indicator: "red",
					});
				} finally {
					this.busy = false;
				}
			},
			async createTop() {
				if (!this.caps.can_create_top && !this.isSystemManager) return;
				if (!this.topForm.email || !this.topForm.full_name || !this.topForm.company) {
					frappe.msgprint(__("Email, full name, and company are required."));
					return;
				}
				this.busy = true;
				try {
					const args = { ...this.topForm };
					if (!args.branch) delete args.branch;
					const data = await this.call(
						"tracker.api.v1.hierarchy.create_top_member",
						args
					);
					this.showPassword(data && data.temporary_password, args.email);
					frappe.show_alert({ message: __("Top created"), indicator: "green" });
					this.topForm.email = "";
					this.topForm.full_name = "";
					await this.refresh();
				} catch (e) {
					frappe.msgprint({
						title: __("Create Top failed"),
						message: String(e.message || e),
						indicator: "red",
					});
				} finally {
					this.busy = false;
				}
			},
			editEmployee(name) {
				const emp = (this.employees || []).find((e) => e.name === name);
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
					primary_action: async (values) => {
						try {
							await this.call("tracker.api.v1.hierarchy.update_employee_org", {
								employee: name,
								tracker_org_role: values.tracker_org_role || "",
								reports_to: values.reports_to || "",
								tracker_role: values.tracker_role || "",
							});
							d.hide();
							await this.refresh();
						} catch (e) {
							frappe.msgprint({
								title: __("Save failed"),
								message: String(e.message || e),
								indicator: "red",
							});
						}
					},
				});
				d.show();
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
							frappe.show_alert({
								message: __("Demo work seeded"),
								indicator: "green",
							});
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
			<div class="tracker-brand">
				<span class="tracker-brand-title">{{ __("Task Management Org Setup") }}</span>
			</div>
			<p class="text-muted">
				{{ __("Set Tracker org role, reports_to, and Frappe role. Assign only flows down this tree.") }}
			</p>
			<p class="text-muted">
				{{ __("Company") }}: <strong>{{ company || "—" }}</strong>
			</p>

			<div class="mb-3" v-if="isSystemManager" style="display:flex;gap:8px;flex-wrap:wrap">
				<button class="btn btn-secondary btn-sm" @click="seedDemo">{{ __("Seed demo Top / Sub / Worker") }}</button>
				<button class="btn btn-warning btn-sm" @click="seedWork">{{ __("Seed demo work data") }}</button>
			</div>

			<div class="tracker-org-card mb-3" v-if="caps.can_assign_org">
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

			<div class="tracker-org-card mb-3" v-if="caps.can_create_top || isSystemManager">
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
			<div v-if="!treeRows.length" class="text-muted">{{ __("No active employees.") }}</div>
			<div
				v-for="row in treeRows"
				:key="row.emp.name"
				class="tracker-org-row"
				:style="{paddingLeft: (row.depth * 18) + 'px'}"
			>
				<strong>{{ row.emp.employee_name || row.emp.name }}</strong>
				<span class="text-muted">{{ row.emp.user_id || __("no user") }}</span>
				<span class="badge">{{ row.emp.tracker_org_role || "—" }}</span>
				<span class="text-muted small" v-if="row.emp.branch">{{ row.emp.branch }}</span>
				<span class="text-muted small">{{ (row.emp.roles || []).join(", ") || "—" }}</span>
				<button class="btn btn-xs btn-default" @click="editEmployee(row.emp.name)">{{ __("Edit") }}</button>
			</div>
		</div>
		`,
	};

	tracker.vue.mount(el, OrgApp).then((app) => {
		wrapper.tracker_org_vue = app;
	});

	page.set_primary_action(__("Refresh"), () => {
		const proxy =
			wrapper.tracker_org_vue &&
			wrapper.tracker_org_vue._instance &&
			wrapper.tracker_org_vue._instance.proxy;
		if (proxy && proxy.refresh) proxy.refresh();
	});
};

frappe.pages["tracker-org"].on_page_show = function (wrapper) {
	const now = Date.now();
	if (wrapper._tracker_org_show && now - wrapper._tracker_org_show < 1000) return;
	wrapper._tracker_org_show = now;
	const proxy =
		wrapper.tracker_org_vue &&
		wrapper.tracker_org_vue._instance &&
		wrapper.tracker_org_vue._instance.proxy;
	if (proxy && proxy.refresh) proxy.refresh();
};

frappe.pages["tracker-workbench"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Task Management"),
		single_column: true,
	});

	$(wrapper).find(".layout-main-section").html(
		'<div id="tracker-workbench-app" class="tracker-workbench"></div>'
	);
	wrapper._tracker_page = page;
	tracker.workbench.mount(wrapper);
};

frappe.pages["tracker-workbench"].on_page_show = function (wrapper) {
	const api = wrapper && wrapper._tracker_vue;
	if (!api || !api.refresh) return;
	const now = Date.now();
	if (wrapper._tracker_last_show && now - wrapper._tracker_last_show < 1000) return;
	wrapper._tracker_last_show = now;
	api.refresh();
};

frappe.provide("tracker.workbench");

tracker.workbench.mount = async function (wrapper) {
	const root = wrapper.querySelector("#tracker-workbench-app");
	if (!root) return;

	if (wrapper._tracker_app) {
		tracker.vue.unmount(wrapper._tracker_app);
		wrapper._tracker_app = null;
	}

	const SAFE_CAPS = {
		can_manage_work: false,
		can_review: false,
		can_submit_timesheets: false,
		can_approve_timesheets: false,
		can_close_project: false,
		is_worker_only: false,
		is_top: false,
		is_lead_or_above: false,
	};

	const STATUS_CHIP_ORDER = ["Open", "Working", "Pending Review", "Completed"];

	function statusBadgeClass(status) {
		const s = (status || "").toLowerCase().replace(/\s+/g, "-");
		if (s === "open") return "tracker-status-badge--open";
		if (s === "working") return "tracker-status-badge--working";
		if (s === "pending-review") return "tracker-status-badge--pending-review";
		if (s === "completed") return "tracker-status-badge--completed";
		return "tracker-status-badge--other";
	}

	function chipClass(status) {
		const s = (status || "").toLowerCase().replace(/\s+/g, "-");
		return `tracker-chip tracker-chip--${s || "other"}`;
	}

	function unwrap(res) {
		const m = (res && res.message) || {};
		if (m.success === false) {
			frappe.msgprint({
				title: __("Error"),
				indicator: "red",
				message: (m.error && m.error.message) || __("Request failed"),
			});
			return null;
		}
		return m.data;
	}

	function apiCall(method, args) {
		return frappe.call({ method, args: args || {} }).then((r) => unwrap(r));
	}

	function fmtElapsed(sec) {
		sec = Math.max(0, Math.floor(sec || 0));
		const h = Math.floor(sec / 3600);
		const m = Math.floor((sec % 3600) / 60);
		const s = sec % 60;
		return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}

	function roleLabel(caps) {
		if (caps.is_top) return __("Manager");
		if (caps.is_lead_or_above) return __("Lead");
		if (caps.is_worker_only) return __("Worker");
		return "";
	}

	const app = await tracker.vue.mount(root, {
		setup() {
			const Vue = window.Vue;
			const { ref, computed, onMounted, onBeforeUnmount } = Vue;

			const loading = ref(false);
			const caps = ref({ ...SAFE_CAPS });
			const tasks = ref([]);
			const tickets = ref([]);
			const running = ref([]);
			const review = ref([]);
			const overview = ref({ counts: {}, pending_review: [] });
			const active = ref(null);
			const selected = ref(null);
			const selectedTicket = ref(null);
			const assignPeople = ref([]);
			const presets = ref([]);
			const tab = ref("tasks");
			const scope = ref("mine");
			const projectFilter = ref("");
			const statusFilter = ref("");
			const elapsedText = ref("");
			let elapsedTimer = null;
			let tickBase = 0;
			let tickStarted = 0;

			const showOverview = computed(
				() => !!(caps.value.can_review || caps.value.is_top)
			);
			const showReview = computed(() => !!caps.value.can_review);
			const canManage = computed(() => !!caps.value.can_manage_work);
			const canSubmitTs = computed(() => !!caps.value.can_submit_timesheets);
			const roleChrome = computed(() => roleLabel(caps.value));

			const statusChips = computed(() => {
				const counts = overview.value.counts || {};
				return STATUS_CHIP_ORDER.map((name) => ({
					status: name,
					count: Number(counts[name] || 0),
					cls: chipClass(name),
				}));
			});

			const taskTreeRows = computed(() => {
				const list = tasks.value || [];
				const byParent = {};
				list.forEach((t) => {
					const p = t.parent_task || "";
					(byParent[p] = byParent[p] || []).push(t);
				});
				const out = [];
				const walk = (t, depth) => {
					out.push({ task: t, depth });
					(byParent[t.name] || []).forEach((c) => walk(c, depth + 1));
				};
				const roots = list.filter((t) => !t.parent_task);
				if (roots.length) {
					roots.forEach((r) => walk(r, 0));
				} else {
					list.forEach((t) => out.push({ task: t, depth: 0 }));
				}
				return out;
			});

			const activeLabel = computed(() => {
				if (!active.value) return __("None");
				const t = active.value.task || active.value.project || active.value.name;
				return `${active.value.status}: ${t}`;
			});

			const canStart = computed(() => {
				const runningNow = active.value && active.value.status === "Running";
				return !!selected.value && !runningNow;
			});
			const canPause = computed(
				() => !!(active.value && active.value.status === "Running")
			);
			const canStop = computed(() => {
				const s = active.value && active.value.status;
				return s === "Running" || s === "Paused";
			});

			const clearElapsed = () => {
				if (elapsedTimer) {
					clearInterval(elapsedTimer);
					elapsedTimer = null;
				}
				elapsedText.value = "";
			};

			const tickElapsed = () => {
				if (!active.value) {
					elapsedText.value = "";
					return;
				}
				let sec = active.value.elapsed_seconds || active.value.duration_seconds || 0;
				if (active.value.status === "Running") {
					sec = tickBase + (Date.now() - tickStarted) / 1000;
				}
				elapsedText.value = __("Elapsed") + ": " + fmtElapsed(sec);
			};

			const syncActiveClock = () => {
				clearElapsed();
				if (!active.value) return;
				tickBase = active.value.elapsed_seconds || active.value.duration_seconds || 0;
				tickStarted = Date.now();
				tickElapsed();
				elapsedTimer = setInterval(tickElapsed, 1000);
			};

			const scopeArgs = () => {
				const args = {
					mine: scope.value === "mine" || scope.value === "both" ? 1 : 0,
					team: scope.value === "team" || scope.value === "both" ? 1 : 0,
					page_size: 100,
					tree: 1,
				};
				const project = (projectFilter.value || "").trim();
				const status = (statusFilter.value || "").trim();
				if (project) args.project = project;
				if (status) args.status = status;
				return args;
			};

			const syncRoute = () => {
				const opts = { scope: scope.value || "mine" };
				const project = (projectFilter.value || "").trim();
				const status = (statusFilter.value || "").trim();
				if (project) opts.project = project;
				if (status) opts.status = status;
				frappe.route_options = opts;
				try {
					const q = Object.keys(opts)
						.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(opts[k])}`)
						.join("&");
					if (window.history && window.history.replaceState) {
						const base = window.location.pathname + window.location.hash.split("?")[0];
						window.history.replaceState(null, "", `${base}?${q}`);
					}
				} catch (e) {
					/* ignore */
				}
				frappe.call({
					method: "tracker.api.v1.filters.set_last",
					args: {
						scope: opts.scope,
						project: project || null,
						status: status || null,
					},
				});
			};

			const applyCaps = (tree) => {
				caps.value = {
					...SAFE_CAPS,
					can_manage_work: !!tree.can_manage_work,
					can_review: !!tree.can_review,
					can_submit_timesheets: !!tree.can_submit_timesheets,
					can_approve_timesheets: !!tree.can_approve_timesheets,
					can_close_project: !!tree.can_close_project,
					is_worker_only: !!tree.is_worker_only,
					is_top: !!tree.is_top,
					is_lead_or_above: !!tree.is_lead_or_above,
				};
				if (!showOverview.value && tab.value === "overview") {
					tab.value = "tasks";
				}
				if (!showReview.value && tab.value === "review") {
					tab.value = "tasks";
				}
				if (showOverview.value && !tab.value) {
					tab.value = "overview";
				}
			};

			const loadOverview = async () => {
				if (!(caps.value.can_review || caps.value.is_top)) {
					overview.value = { counts: {}, pending_review: [] };
					return;
				}
				try {
					const data = await apiCall("tracker.api.v1.reports.overview", {});
					if (!data) return;
					const counts = data.counts || data.status_counts || {};
					const pending =
						data.pending_review || data.pending_review_tasks || data.review || [];
					overview.value = { counts, pending_review: pending };
				} catch (e) {
					frappe.msgprint({
						title: __("Overview"),
						indicator: "red",
						message: (e && e.message) || __("Failed to load overview"),
					});
				}
			};

			const refresh = async () => {
				loading.value = true;
				try {
					const args = scopeArgs();
					const ticketArgs = {
						page_size: 100,
						mine: args.mine,
						team: args.team,
					};
					if (args.project) ticketArgs.project = args.project;
					if (args.status) ticketArgs.status = args.status;

					const [tasksData, activeData, ticketsData, runningData, tree] = await Promise.all([
						apiCall("tracker.api.v1.tasks.list_tasks", args),
						apiCall("tracker.api.v1.activity.active"),
						apiCall("tracker.api.v1.tickets.list_tickets", ticketArgs),
						apiCall("tracker.api.v1.activity.running_now"),
						apiCall("tracker.api.v1.hierarchy.my_tree"),
					]);

					tasks.value = tasksData || [];
					active.value = activeData;
					tickets.value = ticketsData || [];
					running.value = runningData || [];

					const treeData = tree || {};
					applyCaps(treeData);
					assignPeople.value = treeData.people || [];
					if (!assignPeople.value.length && treeData.user) {
						assignPeople.value = [
							{ user: treeData.user, full_name: treeData.user, is_self: true },
						];
						(treeData.subordinates || []).forEach((u) => {
							assignPeople.value.push({ user: u, full_name: u, is_self: false });
						});
					}

					if (caps.value.can_review) {
						const reviewData = await apiCall("tracker.api.v1.tasks.list_tasks", {
							review_queue: 1,
							page_size: 100,
						});
						review.value = reviewData || [];
					} else {
						review.value = [];
					}

					await loadOverview();
					syncActiveClock();
				} catch (e) {
					frappe.msgprint({
						title: __("Error"),
						message: (e && e.message) || e,
						indicator: "red",
					});
				} finally {
					loading.value = false;
				}
			};

			const selectTab = (name) => {
				tab.value = name;
			};

			const selectTask = (name) => {
				selected.value = name;
			};

			const selectTicket = (name) => {
				selectedTicket.value = name;
			};

			const filterByStatus = (status) => {
				if (statusFilter.value === status) {
					statusFilter.value = "";
				} else {
					statusFilter.value = status;
				}
				syncRoute();
				tab.value = "tasks";
				refresh();
			};

			const callActivity = async (method, args) => {
				try {
					const data = await frappe
						.call({
							method,
							args: args || {},
							freeze: true,
						})
						.then((r) => {
							const m = r.message || {};
							if (m.success === false) {
								frappe.msgprint({
									title: __("Activity"),
									message: (m.error && m.error.message) || __("Failed"),
									indicator: "red",
								});
								return null;
							}
							return m.data;
						});
					if (method === "tracker.api.v1.activity.stop" && data) {
						const ts = data.timesheet;
						frappe.show_alert({
							message: ts
								? __("Stopped — timesheet {0}", [ts])
								: __("Session stopped"),
							indicator: "green",
						});
					}
				} catch (err) {
					frappe.msgprint({
						title: __("Activity"),
						message: (err && err.message) || __("Failed"),
						indicator: "red",
					});
				}
				await refresh();
			};

			const startActivity = () => {
				if (!selected.value) return;
				callActivity("tracker.api.v1.activity.start", { task: selected.value });
			};
			const pauseActivity = () => callActivity("tracker.api.v1.activity.pause");
			const stopActivity = () => callActivity("tracker.api.v1.activity.stop");

			const submitForReview = (name) => {
				frappe.call({
					method: "tracker.api.v1.tasks.submit_for_review",
					args: { name },
					freeze: true,
					callback: (r) => {
						if (r.message && r.message.success === false) {
							frappe.msgprint(
								(r.message.error && r.message.error.message) || __("Failed")
							);
							return;
						}
						refresh();
					},
				});
			};

			const approveTask = (name) => {
				frappe.call({
					method: "tracker.api.v1.tasks.approve",
					args: { name },
					freeze: true,
					callback: (r) => {
						if (r.message && r.message.success === false) {
							frappe.msgprint(
								(r.message.error && r.message.error.message) || __("Failed")
							);
							return;
						}
						frappe.show_alert({ message: __("Approved"), indicator: "green" });
						refresh();
					},
				});
			};

			const reworkTask = (name) => {
				frappe.prompt(
					[
						{
							fieldname: "note",
							label: __("Rework note"),
							fieldtype: "Small Text",
							reqd: 1,
						},
					],
					(values) => {
						frappe.call({
							method: "tracker.api.v1.tasks.request_rework",
							args: { name, note: values.note },
							freeze: true,
							callback: (r) => {
								if (r.message && r.message.success === false) {
									frappe.msgprint(
										(r.message.error && r.message.error.message) || __("Failed")
									);
									return;
								}
								refresh();
							},
						});
					},
					__("Request rework")
				);
			};

			const assignSelectField = (fieldname, label) => {
				const opts = (assignPeople.value || []).map((p) => p.user).join("\n");
				const hint = (assignPeople.value || [])
					.map((p) => `${p.full_name || p.user}${p.is_self ? " (you)" : ""}`)
					.join(", ");
				return {
					fieldname,
					label: label || __("Assign To"),
					fieldtype: "Select",
					options: "\n" + opts,
					description: hint
						? __("Self or people below you") + ": " + hint
						: __("Self or people below you in the org tree"),
				};
			};

			const openAssign = (forcedName, forcedDoctype) => {
				const isTicket = forcedDoctype
					? forcedDoctype === "Issue"
					: tab.value === "tickets";
				const name = forcedName || (isTicket ? selectedTicket.value : selected.value);
				const doctype = forcedDoctype || (isTicket ? "Issue" : "Task");
				if (!name) {
					frappe.msgprint(__("Select a task or ticket first."));
					return;
				}
				if (!(assignPeople.value || []).length) {
					frappe.msgprint(
						__("No assignable people in your org tree. Set Employee reports_to first.")
					);
					return;
				}
				const d = new frappe.ui.Dialog({
					title: __("Assign") + " " + doctype,
					fields: [Object.assign(assignSelectField("user", __("Assignee")), { reqd: 1 })],
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
										message:
											(r.message.error && r.message.error.message) ||
											__("Not allowed"),
										indicator: "red",
									});
								} else {
									frappe.show_alert({
										message: __("Assigned"),
										indicator: "green",
									});
									d.hide();
									refresh();
								}
							},
						});
					},
				});
				d.show();
			};

			const newProject = () => {
				const d = new frappe.ui.Dialog({
					title: __("New Project"),
					fields: [
						{
							fieldname: "project_name",
							label: __("Project Name"),
							fieldtype: "Data",
							reqd: 1,
						},
					],
					primary_action_label: __("Create"),
					primary_action(values) {
						frappe.call({
							method: "tracker.api.v1.projects.create_project",
							args: { project_name: values.project_name },
							freeze: true,
							callback: (r) => {
								if (r.message && r.message.success === false) {
									frappe.msgprint({
										title: __("Create failed"),
										message:
											(r.message.error && r.message.error.message) ||
											__("Failed"),
										indicator: "red",
									});
									return;
								}
								d.hide();
								refresh();
							},
						});
					},
				});
				d.show();
			};

			const newTask = () => {
				const d = new frappe.ui.Dialog({
					title: __("New Task"),
					fields: [
						{ fieldname: "subject", label: __("Subject"), fieldtype: "Data", reqd: 1 },
						{
							fieldname: "project",
							label: __("Project"),
							fieldtype: "Link",
							options: "Project",
						},
						{
							fieldname: "parent_task",
							label: __("Parent Task"),
							fieldtype: "Link",
							options: "Task",
						},
						assignSelectField("assign_to"),
					],
					primary_action_label: __("Create"),
					primary_action(values) {
						frappe.call({
							method: "tracker.api.v1.tasks.create_task",
							args: values,
							freeze: true,
							callback: (r) => {
								if (r.message && r.message.success === false) {
									frappe.msgprint({
										title: __("Create failed"),
										message:
											(r.message.error && r.message.error.message) ||
											__("Failed"),
										indicator: "red",
									});
									return;
								}
								d.hide();
								refresh();
							},
						});
					},
				});
				d.show();
			};

			const newTicket = () => {
				const d = new frappe.ui.Dialog({
					title: __("New Ticket"),
					fields: [
						{ fieldname: "subject", label: __("Subject"), fieldtype: "Data", reqd: 1 },
						{
							fieldname: "project",
							label: __("Project"),
							fieldtype: "Link",
							options: "Project",
						},
						{
							fieldname: "description",
							label: __("Description"),
							fieldtype: "Small Text",
						},
						assignSelectField("assign_to"),
					],
					primary_action_label: __("Create"),
					primary_action(values) {
						frappe.call({
							method: "tracker.api.v1.tickets.create_ticket",
							args: values,
							freeze: true,
							callback: (r) => {
								if (r.message && r.message.success === false) {
									frappe.msgprint({
										title: __("Create failed"),
										message:
											(r.message.error && r.message.error.message) ||
											__("Failed"),
										indicator: "red",
									});
									return;
								}
								d.hide();
								tab.value = "tickets";
								refresh();
							},
						});
					},
				});
				d.show();
			};

			const submitTeamTimesheets = () => {
				frappe.prompt(
					[
						{
							fieldname: "from_date",
							label: __("From"),
							fieldtype: "Date",
							reqd: 1,
							default: frappe.datetime.month_start(),
						},
						{
							fieldname: "to_date",
							label: __("To"),
							fieldtype: "Date",
							reqd: 1,
							default: frappe.datetime.get_today(),
						},
					],
					(values) => {
						frappe.call({
							method: "tracker.api.v1.timesheets.submit_team",
							args: values,
							freeze: true,
							callback: (r) => {
								const m = r.message || {};
								if (m.success === false) {
									frappe.msgprint(
										(m.error && m.error.message) || __("Failed")
									);
									return;
								}
								const data = m.data || {};
								const n = (data.submitted || []).length;
								const err = (data.errors || []).length;
								frappe.msgprint(
									__("Submitted {0} timesheet(s). {1} error(s).", [n, err]) +
										(err
											? "<br>" +
											  (data.errors || [])
													.map((e) =>
														frappe.utils.escape_html(
															e.name + ": " + e.error
														)
													)
													.join("<br>")
											: "")
								);
							},
						});
					},
					__("Submit team timesheets")
				);
			};

			const onFiltersChange = () => {
				syncRoute();
				refresh();
			};

			const loadPresets = () =>
				apiCall("tracker.api.v1.filters.get_presets").then((data) => {
					presets.value = (data && data.presets) || [];
					return data || {};
				});

			const applyPreset = (id) => {
				const p = (presets.value || []).find((x) => x.id === id || x.name === id);
				if (!p) return;
				scope.value = p.scope || "mine";
				projectFilter.value = p.project || "";
				statusFilter.value = p.status || "";
				syncRoute();
				refresh();
			};

			const saveFilter = () => {
				frappe.prompt(
					[{ fieldname: "name", label: __("Filter name"), fieldtype: "Data", reqd: 1 }],
					(values) => {
						frappe.call({
							method: "tracker.api.v1.filters.save_preset",
							args: {
								name: values.name,
								scope: scope.value || "mine",
								project: (projectFilter.value || "").trim() || null,
								status: (statusFilter.value || "").trim() || null,
							},
							callback: (r) => {
								const m = r.message || {};
								if (m.success === false) {
									frappe.msgprint(
										(m.error && m.error.message) || __("Save failed")
									);
									return;
								}
								presets.value = (m.data && m.data.presets) || [];
								frappe.show_alert({
									message: __("Filter saved"),
									indicator: "green",
								});
							},
						});
					},
					__("Save filter")
				);
			};

			const taskStatus = (t) => t.status || t.stage || "";

			const showReadyBtn = (t) =>
				(t.status || "") === "Working" || (t.stage || "") === "In Progress";
			const showReviewBtns = (t) =>
				caps.value.can_review &&
				((t.status || "") === "Pending Review" ||
					(t.stage || "") === "Ready for Review");
			const showAssignBtn = (t) =>
				caps.value.can_manage_work &&
				((t.status || "") === "Open" ||
					(t.stage || "") === "Draft" ||
					(t.stage || "") === "Assigned");

			onMounted(async () => {
				const fromRoute = frappe.route_options || {};
				const params = new URLSearchParams(
					(window.location.hash.split("?")[1] || window.location.search || "").replace(
						/^\?/,
						""
					)
				);
				const initial = {
					scope: fromRoute.scope || params.get("scope") || null,
					project: fromRoute.project || params.get("project") || null,
					status: fromRoute.status || params.get("status") || null,
				};
				const data = await loadPresets();
				if (initial.scope || initial.project || initial.status) {
					scope.value = initial.scope || "mine";
					projectFilter.value = initial.project || "";
					statusFilter.value = initial.status || "";
				} else if (data.last) {
					scope.value = data.last.scope || "mine";
					projectFilter.value = data.last.project || "";
					statusFilter.value = data.last.status || "";
				}
				await refresh();
				if (showOverview.value) {
					tab.value = "overview";
				}
			});

			onBeforeUnmount(() => clearElapsed());

			const page = wrapper._tracker_page;
			if (page) {
				page.set_primary_action(__("Refresh"), () => refresh());
			}

			wrapper._tracker_vue = { refresh };

			return {
				loading,
				caps,
				tasks,
				tickets,
				running,
				review,
				overview,
				active,
				selected,
				selectedTicket,
				tab,
				scope,
				projectFilter,
				statusFilter,
				presets,
				elapsedText,
				showOverview,
				showReview,
				canManage,
				canSubmitTs,
				roleChrome,
				statusChips,
				taskTreeRows,
				activeLabel,
				canStart,
				canPause,
				canStop,
				statusBadgeClass,
				fmtElapsed,
				taskStatus,
				showReadyBtn,
				showReviewBtns,
				showAssignBtn,
				selectTab,
				selectTask,
				selectTicket,
				filterByStatus,
				startActivity,
				pauseActivity,
				stopActivity,
				submitForReview,
				approveTask,
				reworkTask,
				openAssign,
				newProject,
				newTask,
				newTicket,
				submitTeamTimesheets,
				onFiltersChange,
				applyPreset,
				saveFilter,
				refresh,
			};
		},
		template: `
		<div class="tracker-workbench">
			<div class="tracker-brand">
				<span class="tracker-brand-title">{{ __('Task Management') }}</span>
				<span v-if="roleChrome" class="tracker-role-chrome">{{ roleChrome }}</span>
			</div>

			<div class="tracker-active">
				<div class="flex justify-between align-center flex-wrap" style="gap:12px">
					<div>
						<div class="text-muted">{{ __('Active session') }}</div>
						<div class="tracker-active-label">{{ activeLabel }}</div>
						<div class="text-muted small">{{ elapsedText }}</div>
					</div>
					<div class="tracker-btn-row">
						<button class="btn btn-primary btn-sm" :disabled="!canStart" @click="startActivity">{{ __('Start') }}</button>
						<button class="btn btn-secondary btn-sm" :disabled="!canPause" @click="pauseActivity">{{ __('Pause') }}</button>
						<button class="btn btn-danger btn-sm" :disabled="!canStop" @click="stopActivity">{{ __('Stop') }}</button>
					</div>
				</div>
			</div>

			<div class="tracker-toolbar">
				<select class="form-control" style="width:auto" v-model="scope" @change="onFiltersChange">
					<option value="mine">{{ __('My Work') }}</option>
					<option value="team">{{ __('Team') }}</option>
					<option value="both">{{ __('Mine + Team') }}</option>
				</select>
				<input class="form-control" style="width:10rem" v-model="projectFilter" :placeholder="__('Project')"
					@change="onFiltersChange" @keydown.enter="onFiltersChange" />
				<input class="form-control" style="width:8rem" v-model="statusFilter" :placeholder="__('Status')"
					@change="onFiltersChange" @keydown.enter="onFiltersChange" />
				<select class="form-control" style="width:auto" @change="applyPreset($event.target.value)">
					<option value="">{{ __('Presets…') }}</option>
					<option v-for="p in presets" :key="p.id || p.name" :value="p.id || p.name">{{ p.name || p.id }}</option>
				</select>
				<button class="btn btn-default btn-sm" @click="saveFilter">{{ __('Save filter') }}</button>
				<button v-if="canManage" class="btn btn-default btn-sm" @click="newProject">{{ __('New Project') }}</button>
				<button v-if="canManage" class="btn btn-default btn-sm" @click="newTask">{{ __('New Task') }}</button>
				<button v-if="canManage" class="btn btn-default btn-sm" @click="newTicket">{{ __('New Ticket') }}</button>
				<button v-if="canManage" class="btn btn-default btn-sm" @click="openAssign()">{{ __('Assign') }}</button>
				<button v-if="canSubmitTs" class="btn btn-default btn-sm" @click="submitTeamTimesheets">{{ __('Submit team timesheets') }}</button>
			</div>

			<ul class="nav nav-tabs tracker-tabs">
				<li v-if="showOverview" class="nav-item">
					<a class="nav-link" :class="{active: tab==='overview'}" href="#" @click.prevent="selectTab('overview')">{{ __('Overview') }}</a>
				</li>
				<li class="nav-item">
					<a class="nav-link" :class="{active: tab==='tasks'}" href="#" @click.prevent="selectTab('tasks')">{{ __('Tasks') }}</a>
				</li>
				<li class="nav-item">
					<a class="nav-link" :class="{active: tab==='tickets'}" href="#" @click.prevent="selectTab('tickets')">{{ __('Tickets') }}</a>
				</li>
				<li class="nav-item">
					<a class="nav-link" :class="{active: tab==='running'}" href="#" @click.prevent="selectTab('running')">{{ __('Who is Running') }}</a>
				</li>
				<li v-if="showReview" class="nav-item">
					<a class="nav-link" :class="{active: tab==='review'}" href="#" @click.prevent="selectTab('review')">{{ __('Review') }}</a>
				</li>
			</ul>

			<div v-if="loading" class="text-muted p-2">{{ __('Loading…') }}</div>

			<div v-show="tab==='overview'" class="tracker-panel">
				<div class="tracker-overview-chips">
					<button
						v-for="chip in statusChips"
						:key="chip.status"
						:class="[chip.cls, {active: statusFilter === chip.status}]"
						type="button"
						@click="filterByStatus(chip.status)"
					>
						{{ chip.status }}
						<span class="tracker-chip-count">{{ chip.count }}</span>
					</button>
				</div>
				<h5>{{ __('Pending Review') }}</h5>
				<div v-if="!(overview.pending_review || []).length" class="text-muted">{{ __('No tasks waiting for review.') }}</div>
				<div
					v-for="t in (overview.pending_review || [])"
					:key="t.name"
					class="tracker-task-row"
					@click="selectTask(t.name)"
				>
					<strong>{{ t.subject || t.name }}</strong>
					<span class="tracker-status-badge" :class="statusBadgeClass(taskStatus(t))">{{ taskStatus(t) || 'Pending Review' }}</span>
					<span class="text-muted"> · {{ t.project || '' }}</span>
					<span class="tracker-row-actions" @click.stop>
						<button v-if="caps.can_review" class="btn btn-xs btn-success" @click="approveTask(t.name)">{{ __('Approve') }}</button>
						<button v-if="caps.can_review" class="btn btn-xs btn-warning" @click="reworkTask(t.name)">{{ __('Rework') }}</button>
					</span>
				</div>
			</div>

			<div v-show="tab==='tasks'" class="tracker-panel">
				<div v-if="!taskTreeRows.length" class="text-muted">{{ __('No tasks.') }}</div>
				<div
					v-for="row in taskTreeRows"
					:key="row.task.name"
					class="tracker-task-row"
					:class="{selected: selected === row.task.name}"
					:style="{paddingLeft: (row.depth * 16 + 12) + 'px'}"
					@click="selectTask(row.task.name)"
				>
					<strong>{{ row.task.subject || row.task.name }}</strong>
					<span class="tracker-status-badge" :class="statusBadgeClass(taskStatus(row.task))">{{ taskStatus(row.task) }}</span>
					<span class="text-muted"> · {{ row.task.project || '' }}</span>
					<span class="tracker-row-actions" @click.stop>
						<button v-if="showReadyBtn(row.task)" class="btn btn-xs btn-primary" @click="submitForReview(row.task.name)">{{ __('Ready for Review') }}</button>
						<button v-if="showReviewBtns(row.task)" class="btn btn-xs btn-success" @click="approveTask(row.task.name)">{{ __('Approve') }}</button>
						<button v-if="showReviewBtns(row.task)" class="btn btn-xs btn-warning" @click="reworkTask(row.task.name)">{{ __('Rework') }}</button>
						<button v-if="showAssignBtn(row.task)" class="btn btn-xs btn-default" @click="openAssign(row.task.name, 'Task')">{{ __('Assign') }}</button>
					</span>
				</div>
			</div>

			<div v-show="tab==='tickets'" class="tracker-panel">
				<div v-if="!tickets.length" class="text-muted">{{ __('No tickets.') }}</div>
				<div
					v-for="t in tickets"
					:key="t.name"
					class="tracker-task-row"
					:class="{selected: selectedTicket === t.name}"
					@click="selectTicket(t.name)"
				>
					<strong>{{ t.subject || t.name }}</strong>
					<span class="text-muted"> · {{ t.status || '' }} · {{ t.project || '' }}</span>
				</div>
			</div>

			<div v-show="tab==='running'" class="tracker-panel">
				<div v-if="!running.length" class="text-muted">{{ __('Nobody is running a timer.') }}</div>
				<div v-for="s in running" :key="s.name" class="tracker-task-row">
					<strong>{{ s.user || '' }}</strong>
					<span class="text-muted"> · {{ s.task || s.project || s.name }} · {{ fmtElapsed(s.elapsed_seconds) }}</span>
				</div>
			</div>

			<div v-show="tab==='review'" class="tracker-panel">
				<div v-if="!review.length" class="text-muted">{{ __('No tasks waiting for review.') }}</div>
				<div
					v-for="t in review"
					:key="t.name"
					class="tracker-task-row"
					:class="{selected: selected === t.name}"
					@click="selectTask(t.name)"
				>
					<strong>{{ t.subject || t.name }}</strong>
					<span class="tracker-status-badge" :class="statusBadgeClass(taskStatus(t))">{{ taskStatus(t) || 'Pending Review' }}</span>
					<span class="text-muted"> · {{ t.project || '' }}</span>
					<span class="tracker-row-actions" @click.stop>
						<button class="btn btn-xs btn-success" @click="approveTask(t.name)">{{ __('Approve') }}</button>
						<button class="btn btn-xs btn-warning" @click="reworkTask(t.name)">{{ __('Rework') }}</button>
					</span>
				</div>
			</div>
		</div>
		`,
	});

	wrapper._tracker_app = app;
};

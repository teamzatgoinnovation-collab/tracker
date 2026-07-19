"""Install / migrate hooks for Tracker."""

from __future__ import annotations

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from tracker.permissions.roles import ensure_role_permissions, ensure_roles

SIDEBAR_ITEMS = [
	{"label": "Workbench", "link_type": "Page", "link_to": "tracker-workbench", "type": "Link", "icon": "list"},
	{"label": "Hours", "link_type": "Page", "link_to": "tracker-hours", "type": "Link", "icon": "chart"},
	{"label": "Org Setup", "link_type": "Page", "link_to": "tracker-org", "type": "Link", "icon": "organization"},
	{"label": "Project", "link_type": "DocType", "link_to": "Project", "type": "Link", "icon": "project"},
	{"label": "Task", "link_type": "DocType", "link_to": "Task", "type": "Link", "icon": "list-checks"},
	{"label": "Issue", "link_type": "DocType", "link_to": "Issue", "type": "Link", "icon": "ticket"},
	{"label": "Employee", "link_type": "DocType", "link_to": "Employee", "type": "Link", "icon": "users"},
	{
		"label": "Activity Session",
		"link_type": "DocType",
		"link_to": "Tracker Activity Session",
		"type": "Link",
		"icon": "timer",
	},
	{
		"label": "Settings",
		"link_type": "DocType",
		"link_to": "Tracker Settings",
		"type": "Link",
		"icon": "setting",
	},
]


def after_install() -> None:
	ensure_roles()
	_ensure_employee_custom_fields()
	ensure_role_permissions()
	_ensure_activity_type("Execution")
	_ensure_desk_entry()
	frappe.clear_cache()


def after_migrate() -> None:
	ensure_roles()
	_ensure_employee_custom_fields()
	ensure_role_permissions()
	_ensure_activity_type("Execution")
	_ensure_desk_entry()
	_unsubmit_live_activity_sessions()


def _unsubmit_live_activity_sessions() -> None:
	"""Keep Running/Paused timers editable (never stay submitted)."""
	if not frappe.db.exists("DocType", "Tracker Activity Session"):
		return
	frappe.db.sql(
		"""
		UPDATE `tabTracker Activity Session`
		SET docstatus = 0
		WHERE docstatus = 1 AND status IN ('Running', 'Paused')
		"""
	)
	frappe.db.set_value(
		"DocType",
		"Tracker Activity Session",
		"is_submittable",
		0,
		update_modified=False,
	)


def _ensure_employee_custom_fields() -> None:
	create_custom_fields(
		{
			"Employee": [
				{
					"fieldname": "tracker_org_role",
					"label": "Tracker Org Role",
					"fieldtype": "Select",
					"options": "\nTop\nSub\nWorker",
					"insert_after": "reports_to",
					"description": "Top → Sub → Worker hierarchy for Tracker assignment",
				},
			]
		},
		update=True,
	)


def _ensure_activity_type(name: str) -> None:
	if not name or not frappe.db.exists("DocType", "Activity Type"):
		return
	if frappe.db.exists("Activity Type", name):
		return
	try:
		frappe.get_doc({"doctype": "Activity Type", "activity_type": name}).insert(
			ignore_permissions=True
		)
	except Exception:
		pass


def _ensure_desk_entry() -> None:
	"""Frappe v16 Desk uses Workspace Sidebar + Desktop Icon (not Workspace alone)."""
	# Drop retired Project Tracker leftovers that hide the real app
	for doctype in ("Desktop Icon", "Workspace Sidebar", "Module Def", "Workspace"):
		for name in frappe.get_all(
			doctype,
			filters={"name": ["in", ["Project Tracker", "project_tracker"]]},
			pluck="name",
		):
			try:
				frappe.delete_doc(doctype, name, force=1, ignore_permissions=True)
			except Exception:
				pass

	if frappe.db.exists("Module Def", "Tracker"):
		if frappe.db.exists("Workspace Sidebar", "Tracker"):
			sb = frappe.get_doc("Workspace Sidebar", "Tracker")
			# Keep app/module wired; refill items if empty
			changed = False
			if sb.app != "tracker":
				sb.app = "tracker"
				changed = True
			if sb.module != "Tracker":
				sb.module = "Tracker"
				changed = True
			if not sb.items:
				for item in SIDEBAR_ITEMS:
					sb.append("items", item)
				changed = True
			if changed:
				sb.save(ignore_permissions=True)
		else:
			sb = frappe.get_doc(
				{
					"doctype": "Workspace Sidebar",
					"name": "Tracker",
					"title": "Tracker",
					"header_icon": "project",
					"module": "Tracker",
					"app": "tracker",
					"standard": 1,
					"items": SIDEBAR_ITEMS,
				}
			)
			sb.insert(ignore_permissions=True)

	icons = frappe.get_all("Desktop Icon", filters={"app": "tracker"}, pluck="name")
	if not icons:
		if frappe.db.exists("Workspace Sidebar", "Tracker"):
			frappe.get_doc(
				{
					"doctype": "Desktop Icon",
					"label": "Tracker",
					"app": "tracker",
					"icon_type": "Link",
					"link_type": "Workspace Sidebar",
					"link_to": "Tracker",
					"icon": "project",
					"standard": 1,
					"hidden": 0,
				}
			).insert(ignore_permissions=True)
	else:
		for name in icons:
			doc = frappe.get_doc("Desktop Icon", name)
			changed = False
			if doc.link_type != "Workspace Sidebar":
				doc.link_type = "Workspace Sidebar"
				changed = True
			if doc.link_to != "Tracker" and frappe.db.exists("Workspace Sidebar", "Tracker"):
				doc.link_to = "Tracker"
				changed = True
			if doc.hidden:
				doc.hidden = 0
				changed = True
			if changed:
				doc.save(ignore_permissions=True)

	frappe.db.commit()

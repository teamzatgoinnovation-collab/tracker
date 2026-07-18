"""Install / migrate hooks for Tracker."""

from __future__ import annotations

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from tracker.permissions.roles import ensure_role_permissions, ensure_roles


def after_install() -> None:
	ensure_roles()
	_ensure_employee_custom_fields()
	ensure_role_permissions()
	_ensure_desk_entry()
	frappe.clear_cache()


def after_migrate() -> None:
	ensure_roles()
	_ensure_employee_custom_fields()
	ensure_role_permissions()
	_ensure_desk_entry()


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

	if not frappe.db.exists("Workspace Sidebar", "Tracker") and frappe.db.exists(
		"Module Def", "Tracker"
	):
		# Sidebar JSON sync normally handles this; create a minimal fallback
		sb = frappe.get_doc(
			{
				"doctype": "Workspace Sidebar",
				"name": "Tracker",
				"title": "Tracker",
				"header_icon": "project",
				"module": "Tracker",
				"app": "tracker",
				"standard": 1,
				"items": [
					{
						"label": "Workbench",
						"link_type": "Page",
						"link_to": "tracker-workbench",
						"type": "Link",
						"icon": "list",
					}
				],
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

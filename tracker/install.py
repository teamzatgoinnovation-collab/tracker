"""Install / migrate hooks for Tracker."""

from __future__ import annotations

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from tracker.permissions.roles import ensure_role_permissions, ensure_roles


def after_install() -> None:
	ensure_roles()
	_ensure_employee_custom_fields()
	ensure_role_permissions()
	frappe.clear_cache()


def after_migrate() -> None:
	ensure_roles()
	_ensure_employee_custom_fields()
	ensure_role_permissions()


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

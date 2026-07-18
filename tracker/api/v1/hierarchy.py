"""Hierarchy + assign-down-tree API."""

from __future__ import annotations

import frappe

from tracker.api.response import fail, ok
from tracker.permissions.hierarchy import (
	can_assign_to,
	get_employee_for_user,
	get_org_role,
	get_subordinate_users,
)
from tracker.services.assign import assign_project_member, assign_task, parse_users


@frappe.whitelist()
def my_tree():
	user = frappe.session.user
	emp = get_employee_for_user(user)
	subs = sorted(get_subordinate_users(user))
	return ok(
		{
			"user": user,
			"employee": emp,
			"org_role": get_org_role(emp),
			"subordinates": subs,
		}
	)


@frappe.whitelist()
def can_assign(assignee: str):
	return ok({"assignee": assignee, "allowed": can_assign_to(frappe.session.user, assignee)})


@frappe.whitelist()
def assign(doctype: str, name: str, users: str | None = None, user: str | None = None):
	targets = parse_users(users) or parse_users(user)
	if not doctype or not name or not targets:
		return fail("bad_request", "doctype, name, and user(s) required")
	if doctype == "Task":
		assign_task(name, targets)
	elif doctype == "Project":
		for u in targets:
			assign_project_member(name, u)
	elif doctype == "Issue":
		from frappe.desk.form.assign_to import add as assign_add
		from tracker.permissions.hierarchy import assert_can_assign

		for u in targets:
			assert_can_assign(frappe.session.user, u)
			assign_add(
				{
					"assign_to": [u],
					"doctype": "Issue",
					"name": name,
					"description": "Assigned via Tracker",
				}
			)
	else:
		return fail("unsupported", f"Cannot assign {doctype}")
	return ok({"doctype": doctype, "name": name, "users": targets})

"""Hierarchy + assign-down-tree API + org setup."""

from __future__ import annotations

import frappe
from frappe import _

from tracker.api.response import fail, ok
from tracker.permissions.hierarchy import (
	can_assign_to,
	get_employee_for_user,
	get_org_role,
	get_subordinate_users,
)
from tracker.permissions.roles import TRACKER_ROLES
from tracker.services.assign import assign_project_member, assign_task, parse_users
from tracker.setup.demo_org import seed_demo_org
from tracker.setup.demo_data import seed_demo_data


@frappe.whitelist()
def my_tree():
	"""Assignable people: self + subordinates (for assign pickers)."""
	user = frappe.session.user
	emp = get_employee_for_user(user)
	subs = sorted(get_subordinate_users(user))
	people = []
	seen = set()
	for u in [user, *subs]:
		if not u or u in seen:
			continue
		seen.add(u)
		full_name = frappe.db.get_value("User", u, "full_name") or u
		people.append({"user": u, "full_name": full_name, "is_self": u == user})
	return ok(
		{
			"user": user,
			"employee": emp,
			"org_role": get_org_role(emp),
			"subordinates": subs,
			"people": people,
		}
	)


@frappe.whitelist()
def org_tree():
	"""Full active Employee tree for Org Setup (company-scoped)."""
	from tracker.permissions.hierarchy import get_company_for_user

	company = get_company_for_user()
	filters: dict = {"status": "Active"}
	if company:
		filters["company"] = company
	fields = ["name", "employee_name", "user_id", "reports_to", "company"]
	if frappe.get_meta("Employee").has_field("tracker_org_role"):
		fields.append("tracker_org_role")
	rows = frappe.get_all("Employee", filters=filters, fields=fields, order_by="employee_name asc")
	# attach roles for users
	for row in rows:
		row["roles"] = []
		if row.get("user_id"):
			user_roles = set(frappe.get_roles(row.user_id))
			row["roles"] = [r for r in TRACKER_ROLES if r in user_roles]
	return ok({"company": company, "employees": rows})


@frappe.whitelist()
def update_employee_org(
	employee: str,
	tracker_org_role: str | None = None,
	reports_to: str | None = None,
	tracker_role: str | None = None,
):
	"""Set org role / reports_to / Frappe Tracker role on Employee+User."""
	if not employee:
		return fail("bad_request", "employee required")
	if not (
		frappe.session.user == "Administrator"
		or "System Manager" in frappe.get_roles()
		or "Tracker Top" in frappe.get_roles()
	):
		frappe.throw(_("Not permitted to update org setup."), frappe.PermissionError)

	doc = frappe.get_doc("Employee", employee)
	if tracker_org_role is not None and frappe.get_meta("Employee").has_field("tracker_org_role"):
		doc.tracker_org_role = tracker_org_role or None
	if reports_to is not None:
		doc.reports_to = reports_to or None
	doc.save(ignore_permissions=True)

	if tracker_role is not None and doc.user_id:
		user = frappe.get_doc("User", doc.user_id)
		# remove other Tracker roles then add selected (empty clears all)
		user.roles = [r for r in user.roles if r.role not in TRACKER_ROLES]
		if tracker_role in TRACKER_ROLES:
			user.append_roles(tracker_role)
		user.save(ignore_permissions=True)

	return ok(frappe.get_doc("Employee", employee).as_dict())


@frappe.whitelist()
def seed_demo(company: str | None = None):
	"""Org tree only (Top / Sub / Worker)."""
	return ok(seed_demo_org(company=company))


@frappe.whitelist()
def seed_demo_work(company: str | None = None):
	"""Full demo: org + project/tasks/tickets + timesheets + live sessions."""
	return ok(seed_demo_data(company=company))


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
		from tracker.services.notify import notify_assigned

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
		notify_assigned(doctype="Issue", name=name, users=targets)
	else:
		return fail("unsupported", f"Cannot assign {doctype}")
	return ok({"doctype": doctype, "name": name, "users": targets})

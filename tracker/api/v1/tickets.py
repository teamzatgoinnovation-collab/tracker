"""Issue (ticket) wrappers."""

from __future__ import annotations

import frappe

from frappe.desk.form.assign_to import add as assign_add

from tracker.api.response import fail, ok, paginated
from tracker.permissions.hierarchy import assert_can_assign, get_company_for_user
from tracker.services.assign import parse_users


@frappe.whitelist()
def list_tickets(
	page: int = 1,
	page_size: int = 50,
	project: str | None = None,
	status: str | None = None,
):
	page = int(page or 1)
	page_size = min(int(page_size or 50), 200)
	filters: dict = {}
	company = get_company_for_user()
	if company:
		filters["company"] = company
	if project:
		filters["project"] = project
	if status:
		filters["status"] = status
	total = frappe.db.count("Issue", filters)
	rows = frappe.get_all(
		"Issue",
		filters=filters,
		fields=["name", "subject", "status", "priority", "project", "raised_by", "modified"],
		order_by="modified desc",
		start=(page - 1) * page_size,
		page_length=page_size,
	)
	return paginated(rows, page=page, page_size=page_size, total=total)


@frappe.whitelist()
def get_ticket(name: str):
	if not name:
		return fail("missing_name", "Issue name is required")
	doc = frappe.get_doc("Issue", name)
	doc.check_permission("read")
	return ok(doc.as_dict())


@frappe.whitelist()
def create_ticket(
	subject: str,
	project: str | None = None,
	description: str | None = None,
	priority: str | None = None,
	assign_to: str | None = None,
):
	if not subject:
		return fail("missing_subject", "subject is required")
	company = None
	if project:
		company = frappe.db.get_value("Project", project, "company")
	company = company or get_company_for_user()
	doc = frappe.get_doc(
		{
			"doctype": "Issue",
			"subject": subject,
			"project": project,
			"description": description,
			"priority": priority or "Medium",
			"company": company,
			"raised_by": frappe.session.user,
		}
	)
	doc.insert()
	for user in parse_users(assign_to):
		assert_can_assign(frappe.session.user, user)
		assign_add(
			{
				"assign_to": [user],
				"doctype": "Issue",
				"name": doc.name,
				"description": f"Ticket assigned via Tracker",
			}
		)
	return ok(frappe.get_doc("Issue", doc.name).as_dict())


@frappe.whitelist()
def assign(name: str, users: str | None = None, user: str | None = None):
	targets = parse_users(users) or parse_users(user)
	if not name or not targets:
		return fail("bad_request", "name and user(s) required")
	for u in targets:
		assert_can_assign(frappe.session.user, u)
		assign_add(
			{
				"assign_to": [u],
				"doctype": "Issue",
				"name": name,
				"description": "Ticket assigned via Tracker",
			}
		)
	return ok({"issue": name, "users": targets})

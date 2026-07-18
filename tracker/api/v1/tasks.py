"""Task list/create + subtask via parent_task."""

from __future__ import annotations

import frappe
from frappe import _

from tracker.api.response import fail, ok, paginated
from tracker.permissions.hierarchy import get_company_for_user
from tracker.services.assign import assign_task, parse_users


@frappe.whitelist()
def list_tasks(
	page: int = 1,
	page_size: int = 50,
	project: str | None = None,
	status: str | None = None,
	mine: int = 0,
	parent_task: str | None = None,
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
	if parent_task:
		filters["parent_task"] = parent_task
	if int(mine or 0):
		filters["_assign"] = ("like", f"%{frappe.session.user}%")

	total = frappe.db.count("Task", filters)
	rows = frappe.get_all(
		"Task",
		filters=filters,
		fields=[
			"name",
			"subject",
			"status",
			"priority",
			"project",
			"parent_task",
			"is_group",
			"exp_start_date",
			"exp_end_date",
			"_assign",
			"modified",
		],
		order_by="modified desc",
		start=(page - 1) * page_size,
		page_length=page_size,
	)
	return paginated(rows, page=page, page_size=page_size, total=total)


@frappe.whitelist()
def get_task(name: str):
	if not name:
		return fail("missing_name", "Task name is required")
	doc = frappe.get_doc("Task", name)
	doc.check_permission("read")
	children = frappe.get_all(
		"Task",
		filters={"parent_task": name},
		fields=["name", "subject", "status", "priority", "_assign"],
		order_by="creation asc",
	)
	data = doc.as_dict()
	data["subtasks"] = children
	return ok(data)


@frappe.whitelist()
def create_task(
	subject: str,
	project: str | None = None,
	parent_task: str | None = None,
	priority: str | None = None,
	description: str | None = None,
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
			"doctype": "Task",
			"subject": subject,
			"project": project,
			"parent_task": parent_task,
			"priority": priority or "Medium",
			"description": description,
			"company": company,
			"status": "Open",
			"is_group": 1 if not parent_task else 0,
		}
	)
	doc.insert()
	users = parse_users(assign_to)
	if users:
		assign_task(doc.name, users)
	elif frappe.session.user:
		assign_task(doc.name, [frappe.session.user])
	return ok(frappe.get_doc("Task", doc.name).as_dict())


@frappe.whitelist()
def update_status(name: str, status: str):
	if not name or not status:
		return fail("bad_request", "name and status required")
	doc = frappe.get_doc("Task", name)
	doc.check_permission("write")
	doc.status = status
	doc.save()
	return ok(doc.as_dict())


@frappe.whitelist()
def assign(name: str, users: str | None = None, user: str | None = None):
	targets = parse_users(users) or parse_users(user)
	if not name or not targets:
		return fail("bad_request", "name and user(s) required")
	assign_task(name, targets)
	return ok({"task": name, "users": targets})

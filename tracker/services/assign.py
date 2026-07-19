"""Assignment helpers with down-tree validation."""

from __future__ import annotations

import json

import frappe
from frappe.desk.form.assign_to import add as assign_add

from tracker.permissions.hierarchy import assert_can_assign


def assign_task(task: str, users: list[str], assigner: str | None = None) -> None:
	from tracker.services.notify import notify_assigned

	assigner = assigner or frappe.session.user
	for user in users:
		assert_can_assign(assigner, user)
		assign_add(
			{
				"assign_to": [user],
				"doctype": "Task",
				"name": task,
				"description": f"Assigned via Tracker by {assigner}",
			}
		)
	notify_assigned(doctype="Task", name=task, users=users, assigner=assigner)


def assign_project_member(project: str, user: str, assigner: str | None = None) -> None:
	assigner = assigner or frappe.session.user
	assert_can_assign(assigner, user)
	doc = frappe.get_doc("Project", project)
	existing = {row.user for row in doc.get("users") or []}
	if user not in existing:
		doc.append("users", {"user": user})
		doc.save(ignore_permissions=True)


def parse_users(value) -> list[str]:
	if value is None:
		return []
	if isinstance(value, list):
		return [str(v) for v in value]
	if isinstance(value, str):
		value = value.strip()
		if not value:
			return []
		if value.startswith("["):
			return [str(v) for v in json.loads(value)]
		return [u.strip() for u in value.split(",") if u.strip()]
	return [str(value)]

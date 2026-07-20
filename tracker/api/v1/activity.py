"""Activity start / pause / stop / active."""

from __future__ import annotations

import frappe

from tracker.api.response import fail, ok
from tracker.services import activity as activity_service


@frappe.whitelist()
def active():
	return ok(activity_service.get_active_session())


@frappe.whitelist()
def start(task: str | None = None, project: str | None = None, activity_type: str | None = None):
	if not task and not project:
		return fail("bad_request", "task or project required")
	return ok(
		activity_service.start_session(
			task=task, project=project, activity_type=activity_type
		)
	)


@frappe.whitelist()
def pause(name: str | None = None):
	return ok(activity_service.pause_session(name))


@frappe.whitelist()
def stop(name: str | None = None):
	return ok(activity_service.stop_session(name, flush=True))


@frappe.whitelist()
def running_now(company: str | None = None):
	"""Who is Running right now (company-scoped)."""
	return ok(activity_service.list_running_sessions(company=company))

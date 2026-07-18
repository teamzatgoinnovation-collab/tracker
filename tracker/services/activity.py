"""Live activity session: start / pause / next with single-running invariant."""

from __future__ import annotations

from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime, time_diff_in_seconds

from tracker.permissions.hierarchy import get_company_for_user, get_employee_for_user
from tracker.tracker.doctype.tracker_settings.tracker_settings import get_default_activity_type

DOCTYPE = "Tracker Activity Session"


def get_active_session(user: str | None = None) -> dict | None:
	user = user or frappe.session.user
	name = frappe.db.get_value(
		DOCTYPE,
		{"user": user, "status": ("in", ("Running", "Paused"))},
		"name",
		order_by="modified desc",
	)
	if not name:
		return None
	return _session_payload(frappe.get_doc(DOCTYPE, name))


def list_running_sessions(company: str | None = None) -> list[dict]:
	"""Sessions currently Running (manager view)."""
	filters: dict = {"status": "Running"}
	if company:
		filters["company"] = company
	else:
		company = get_company_for_user()
		if company:
			filters["company"] = company
	rows = frappe.get_all(
		DOCTYPE,
		filters=filters,
		fields=[
			"name",
			"user",
			"employee",
			"project",
			"task",
			"activity_type",
			"status",
			"started_on",
			"duration_seconds",
			"company",
		],
		order_by="started_on desc",
		limit_page_length=200,
	)
	out = []
	for row in rows:
		doc = frappe._dict(row)
		payload = dict(row)
		payload["elapsed_seconds"] = _live_elapsed(doc)
		out.append(payload)
	return out


def _session_payload(doc) -> dict:
	data = doc.as_dict()
	data["elapsed_seconds"] = _live_elapsed(doc)
	return data


def _live_elapsed(doc) -> float:
	base = float(doc.duration_seconds or 0)
	if getattr(doc, "status", None) == "Running" and getattr(doc, "started_on", None):
		base += _elapsed(doc.started_on, now_datetime())
	return base


def start_session(
	*,
	task: str | None = None,
	project: str | None = None,
	activity_type: str | None = None,
	user: str | None = None,
) -> dict:
	user = user or frappe.session.user
	existing = get_active_session(user)
	if existing and existing.get("status") == "Running":
		if task and existing.get("task") == task:
			return existing
		frappe.throw(_("You already have a running session. Pause or Next first."))

	if existing and existing.get("status") == "Paused" and task and existing.get("task") == task:
		return resume_session(existing["name"])

	# if paused on different task, stop it first (flush)
	if existing and existing.get("status") == "Paused":
		stop_session(existing["name"], flush=True)

	now = now_datetime()
	emp = get_employee_for_user(user)
	company = None
	if task:
		project = project or frappe.db.get_value("Task", task, "project")
		company = frappe.db.get_value("Task", task, "company")
	if project and not company:
		company = frappe.db.get_value("Project", project, "company")
	company = company or get_company_for_user(user)
	activity_type = activity_type or get_default_activity_type()

	doc = frappe.get_doc(
		{
			"doctype": DOCTYPE,
			"user": user,
			"employee": emp,
			"company": company,
			"project": project,
			"task": task,
			"activity_type": activity_type,
			"status": "Running",
			"started_on": now,
			"duration_seconds": 0,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return _session_payload(doc)


def pause_session(name: str | None = None, user: str | None = None) -> dict:
	user = user or frappe.session.user
	doc = _get_owned_session(name, user)
	if doc.status != "Running":
		frappe.throw(_("Only a Running session can be paused."))
	now = now_datetime()
	doc.duration_seconds = (doc.duration_seconds or 0) + _elapsed(doc.started_on, now)
	doc.paused_on = now
	doc.status = "Paused"
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _session_payload(doc)


def resume_session(name: str, user: str | None = None) -> dict:
	user = user or frappe.session.user
	# ensure no other running
	other = frappe.db.get_value(
		DOCTYPE,
		{"user": user, "status": "Running", "name": ("!=", name)},
		"name",
	)
	if other:
		frappe.throw(_("Another session is already Running."))
	doc = _get_owned_session(name, user)
	if doc.status != "Paused":
		frappe.throw(_("Only a Paused session can be resumed."))
	doc.started_on = now_datetime()
	doc.paused_on = None
	doc.status = "Running"
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _session_payload(doc)


def stop_session(name: str | None = None, *, flush: bool = True, user: str | None = None) -> dict:
	user = user or frappe.session.user
	doc = _get_owned_session(name, user)
	now = now_datetime()
	if doc.status == "Running":
		doc.duration_seconds = (doc.duration_seconds or 0) + _elapsed(doc.started_on, now)
	doc.ended_on = now
	doc.status = "Stopped"
	doc.save(ignore_permissions=True)
	if flush:
		_flush_to_timesheet(doc)
	frappe.db.commit()
	return _session_payload(doc)


def next_session(
	*,
	task: str,
	project: str | None = None,
	activity_type: str | None = None,
	user: str | None = None,
) -> dict:
	"""Stop current (flush) and start the next task — previous never stays Running."""
	user = user or frappe.session.user
	active = get_active_session(user)
	if active:
		stop_session(active["name"], flush=True, user=user)
	return start_session(task=task, project=project, activity_type=activity_type, user=user)


def _get_owned_session(name: str | None, user: str):
	if not name:
		active = get_active_session(user)
		if not active:
			frappe.throw(_("No active session."))
		name = active["name"]
	doc = frappe.get_doc(DOCTYPE, name)
	if doc.user != user and "System Manager" not in frappe.get_roles(user) and user != "Administrator":
		frappe.throw(_("Not your session."), frappe.PermissionError)
	return doc


def _elapsed(started_on, ended_on) -> float:
	if not started_on:
		return 0.0
	start = get_datetime(started_on)
	end = get_datetime(ended_on) if not isinstance(ended_on, datetime) else ended_on
	return max(0.0, float(time_diff_in_seconds(end, start)))


def _flush_to_timesheet(doc) -> None:
	hours = float(doc.duration_seconds or 0) / 3600.0
	if hours < 0.01:
		return
	employee = doc.employee or get_employee_for_user(doc.user)
	if not employee:
		frappe.log_error("Tracker: no Employee for timesheet flush", doc.name)
		return
	company = doc.company or get_company_for_user(doc.user)
	activity_type = doc.activity_type or get_default_activity_type()
	_ensure_activity_type(activity_type)

	to_time = get_datetime(doc.ended_on) if doc.ended_on else now_datetime()
	# Window matches accumulated duration (pause/resume safe)
	from_time = to_time - timedelta(seconds=float(doc.duration_seconds or 0))

	ts = frappe.get_doc(
		{
			"doctype": "Timesheet",
			"employee": employee,
			"company": company,
			"parent_project": doc.project,
			"time_logs": [
				{
					"activity_type": activity_type,
					"from_time": from_time,
					"to_time": to_time,
					"hours": hours,
					"project": doc.project,
					"task": doc.task,
					"completed": 1,
					"description": f"Tracker session {doc.name}",
				}
			],
		}
	)
	ts.insert(ignore_permissions=True)
	doc.db_set("timesheet", ts.name, update_modified=False)


def _ensure_activity_type(name: str) -> None:
	if not name:
		return
	if frappe.db.exists("Activity Type", name):
		return
	try:
		frappe.get_doc({"doctype": "Activity Type", "activity_type": name}).insert(
			ignore_permissions=True
		)
	except Exception:
		pass

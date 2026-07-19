"""Light Timesheet hour reports for Tracker."""

from __future__ import annotations

import frappe
from frappe.utils import getdate

from tracker.api.response import fail, ok, paginated
from tracker.permissions.hierarchy import (
	get_company_for_user,
	get_employee_for_user,
	get_subordinate_employees,
)


def _allowed_employees(user: str | None = None) -> list[str] | None:
	"""None = unrestricted (System Manager); else self + subordinates."""
	user = user or frappe.session.user
	if user in ("Administrator",) or "System Manager" in frappe.get_roles(user):
		return None
	emp = get_employee_for_user(user)
	if not emp:
		return []
	subs = get_subordinate_employees(emp)
	return [emp, *sorted(subs)]


def _parse_dates(from_date, to_date):
	if not from_date or not to_date:
		return None, None, fail("bad_request", "from_date and to_date required")
	try:
		return getdate(from_date), getdate(to_date), None
	except Exception:
		return None, None, fail("bad_request", "invalid date")


@frappe.whitelist()
def hours_by_project(
	from_date: str | None = None,
	to_date: str | None = None,
	company: str | None = None,
	page: int = 1,
	page_size: int = 50,
):
	fd, td, err = _parse_dates(from_date, to_date)
	if err:
		return err
	page = int(page or 1)
	page_size = min(int(page_size or 50), 200)
	company = company or get_company_for_user()
	employees = _allowed_employees()
	if employees is not None and not employees:
		return paginated([], page=page, page_size=page_size, total=0)

	conds = ["ts.docstatus < 2", "td.hours > 0", "DATE(td.from_time) BETWEEN %(fd)s AND %(td)s"]
	vals: dict = {"fd": fd, "td": td}
	if company:
		conds.append("ts.company = %(company)s")
		vals["company"] = company
	if employees is not None:
		conds.append("ts.employee IN %(employees)s")
		vals["employees"] = employees

	where = " AND ".join(conds)
	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(td.project, ts.parent_project, '') AS project,
			SUM(td.hours) AS hours,
			COUNT(*) AS entries
		FROM `tabTimesheet Detail` td
		INNER JOIN `tabTimesheet` ts ON ts.name = td.parent
		WHERE {where}
		GROUP BY COALESCE(td.project, ts.parent_project, '')
		ORDER BY hours DESC
		""",
		vals,
		as_dict=True,
	)
	total = len(rows)
	start = (page - 1) * page_size
	slice_rows = rows[start : start + page_size]
	for r in slice_rows:
		r["hours"] = float(r.get("hours") or 0)
		r["entries"] = int(r.get("entries") or 0)
		r["project"] = r.get("project") or None
	return paginated(slice_rows, page=page, page_size=page_size, total=total)


@frappe.whitelist()
def hours_by_user(
	from_date: str | None = None,
	to_date: str | None = None,
	company: str | None = None,
	page: int = 1,
	page_size: int = 50,
):
	fd, td, err = _parse_dates(from_date, to_date)
	if err:
		return err
	page = int(page or 1)
	page_size = min(int(page_size or 50), 200)
	company = company or get_company_for_user()
	employees = _allowed_employees()
	if employees is not None and not employees:
		return paginated([], page=page, page_size=page_size, total=0)

	conds = ["ts.docstatus < 2", "td.hours > 0", "DATE(td.from_time) BETWEEN %(fd)s AND %(td)s"]
	vals: dict = {"fd": fd, "td": td}
	if company:
		conds.append("ts.company = %(company)s")
		vals["company"] = company
	if employees is not None:
		conds.append("ts.employee IN %(employees)s")
		vals["employees"] = employees

	where = " AND ".join(conds)
	rows = frappe.db.sql(
		f"""
		SELECT
			ts.employee AS employee,
			emp.user_id AS user,
			emp.employee_name AS employee_name,
			SUM(td.hours) AS hours,
			COUNT(*) AS entries
		FROM `tabTimesheet Detail` td
		INNER JOIN `tabTimesheet` ts ON ts.name = td.parent
		LEFT JOIN `tabEmployee` emp ON emp.name = ts.employee
		WHERE {where}
		GROUP BY ts.employee, emp.user_id, emp.employee_name
		ORDER BY hours DESC
		""",
		vals,
		as_dict=True,
	)
	total = len(rows)
	start = (page - 1) * page_size
	slice_rows = rows[start : start + page_size]
	for r in slice_rows:
		r["hours"] = float(r.get("hours") or 0)
		r["entries"] = int(r.get("entries") or 0)
	return paginated(slice_rows, page=page, page_size=page_size, total=total)

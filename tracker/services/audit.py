"""Comment-based Tracker audit trail ([tracker] prefix)."""

from __future__ import annotations

import frappe
from frappe.utils import escape_html

PREFIX = "[tracker]"


def log_event(
	doctype: str,
	name: str,
	*,
	action: str,
	from_stage: str | None = None,
	to_stage: str | None = None,
	note: str | None = None,
	extra: str | None = None,
) -> None:
	"""Append an Info comment on the document."""
	if not doctype or not name:
		return
	user = frappe.session.user
	parts = [PREFIX, f"action={action}", f"by={user}"]
	if from_stage:
		parts.append(f"from={from_stage}")
	if to_stage:
		parts.append(f"to={to_stage}")
	if note:
		parts.append(f"note={note}")
	if extra:
		parts.append(extra)
	content = " ".join(parts)
	try:
		doc = frappe.get_doc(doctype, name)
		doc.add_comment("Info", text=escape_html(content))
	except Exception:
		frappe.log_error(title=f"Tracker audit failed {doctype} {name}", message=frappe.get_traceback())


def list_for(doctype: str, name: str, limit: int = 50) -> list[dict]:
	if not doctype or not name:
		return []
	limit = min(int(limit or 50), 200)
	rows = frappe.get_all(
		"Comment",
		filters={
			"reference_doctype": doctype,
			"reference_name": name,
			"comment_type": "Info",
		},
		fields=["name", "content", "comment_email", "owner", "creation"],
		order_by="creation desc",
		limit_page_length=limit,
	)
	out = []
	for row in rows:
		content = row.get("content") or ""
		# strip HTML wrappers from add_comment
		plain = frappe.utils.strip_html(content) if content else ""
		if PREFIX not in plain and PREFIX not in content:
			continue
		out.append(
			{
				"name": row.name,
				"content": plain or content,
				"owner": row.owner,
				"creation": row.creation,
			}
		)
	return out

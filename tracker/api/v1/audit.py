"""Audit list API."""

from __future__ import annotations

import frappe

from tracker.api.response import fail, ok
from tracker.services.audit import list_for


@frappe.whitelist()
def list_for_doc(doctype: str, name: str, limit: int = 50):
	if not doctype or not name:
		return fail("bad_request", "doctype and name required")
	return ok(list_for(doctype, name, limit=limit))

"""Frappe hooks for Tracker."""

app_name = "tracker"
app_title = "Tracker"
app_publisher = "ZatGo Innovation"
app_description = "Simple project, task, and ticket tracking on ERPNext"
app_email = "engineering@zatgo.local"
app_license = "mit"
app_version = "0.1.0"

app_home = "/desk/tracker-workbench"
add_to_apps_screen = [
	{
		"name": app_name,
		"title": app_title,
		"route": app_home,
	}
]

required_apps = ["erpnext"]

after_install = "tracker.install.after_install"
after_migrate = "tracker.install.after_migrate"

app_include_js = ["/assets/tracker/js/tracker.js"]
app_include_css = ["/assets/tracker/css/tracker.css"]

permission_query_conditions = {
	"Project": "tracker.permissions.queries.project_permission_query",
	"Task": "tracker.permissions.queries.task_permission_query",
	"Issue": "tracker.permissions.queries.issue_permission_query",
	"Timesheet": "tracker.permissions.queries.timesheet_permission_query",
	"Tracker Activity Session": "tracker.permissions.queries.activity_session_permission_query",
}

has_permission = {
	"Project": "tracker.permissions.queries.project_has_permission",
	"Task": "tracker.permissions.queries.task_has_permission",
	"Issue": "tracker.permissions.queries.issue_has_permission",
	"Timesheet": "tracker.permissions.queries.timesheet_has_permission",
	"Tracker Activity Session": "tracker.permissions.queries.activity_session_has_permission",
}

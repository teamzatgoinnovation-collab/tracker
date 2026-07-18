# Tracker

Minimal ERPNext domain app for company-scoped projects, tasks (with subtasks via `parent_task`), tickets (Issue), and live Start / Pause / Next activity sessions.

## Package

| | |
|--|--|
| Folder | `CustomApps/erpnext/Tracker` |
| Package | `tracker` |
| Remote | https://github.com/teamzatgoinnovation-collab/tracker.git |

## ERPNext reuse

- **Company**, **User**, **Employee** (`reports_to` + CF `tracker_org_role`)
- **Project** / **Project User**, **Task** (`parent_task`), **Issue**, **Timesheet**
- Custom only: **Tracker Activity Session**, **Tracker Settings**

## Roles

`Tracker Top` → `Tracker Sub` → `Tracker Worker` (assign only down the Employee tree).

## Install

```bash
bench get-app https://github.com/teamzatgoinnovation-collab/tracker.git
bench --site <site> install-app tracker
bench --site <site> migrate
bench --site <site> clear-cache
```

### Docker / frappe_docker important

After `install-app` (or `get-app`), ensure the Python package is visible to Gunicorn workers:

```bash
# inside backend container
cd /home/frappe/frappe-bench
./env/bin/pip install -e apps/tracker
# then restart backend (and optionally queue/websocket)
docker restart <backend-container>
bench --site <site> clear-cache
```

Without the editable install + restart, Desk may return **Internal Server Error** with `ModuleNotFoundError: No module named 'tracker'`.

## Desk

| Route | Purpose |
|-------|---------|
| `/desk/tracker-workbench` | My/Team tasks, tickets, Start/Pause/Next/Stop, create/assign, who is running |
| `/desk/tracker-org` | Org tree, roles, reports_to, demo seed |
| Workspace **Tracker** | Shortcuts to Workbench, Org, Project, Task, Issue, Activity, Settings |

## Smoke checklist

1. Desk login → Workspace **Tracker** visible  
2. Org Setup → Seed demo (or set `reports_to` + roles)  
3. Workbench → New Task → Assign (down-tree only)  
4. Start → Pause → Next → Stop; Timesheet row created on stop/next  
5. Tickets tab → New Ticket  
6. Who is Running shows active timers  

## Clients

Flutter / web / desktop thin shells call `tracker.api.v1.*` (auth + tasks + activity + create/assign).

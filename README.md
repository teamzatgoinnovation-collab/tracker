# Task Management (`tracker`)

ERPNext domain app for company-scoped projects, tasks, tickets (Issue), and live Start / Pause / Stop activity → Timesheet.

**Display name:** Task Management · **Package:** `tracker` (APIs `tracker.api.v1.*`)

## Package

| | |
|--|--|
| Folder | `CustomApps/erpnext/Tracker` |
| Package | `tracker` |
| Remote | https://github.com/teamzatgoinnovation-collab/tracker.git |

## ERPNext reuse

- **Company**, **User**, **Employee** (`reports_to` + CF `tracker_org_role`), **Branch** when present
- **Project** / **Project User**, **Task** (`parent_task`, native `status`), **Issue**, **Timesheet**
- Custom only: **Tracker Activity Session**, **Tracker Settings**

## Roles

`Tracker Top` (Manager) → `Tracker Sub` (Team Lead) → `Tracker Worker`

| Role | Can |
|------|-----|
| Worker | Start/Pause/Stop; submit Pending Review; cannot create/assign/approve |
| Sub | Create/assign down-tree; Approve / Rework; submit team draft Timesheets; assign Sub/Worker (company, branch, role) |
| Top | Everything Sub can; close projects; approve Timesheets on Desk (native) |
| System Manager | Create Top (company, branch) |

## Task status (ERPNext inbuilt)

UI badges/filters use `Task.status`: `Open`, `Working`, `Pending Review`, `Completed` (+ Cancelled/Overdue if configured).

Lifecycle APIs write those same statuses.

## Site

**Always** use site: **`erp.zatgo.online`**

| Env | Backend container |
|-----|-------------------|
| Local | `erpnext-backend-1` |
| Cloud | `frappe_docker-backend-1` |

## Install / update

```bash
cd /home/frappe/frappe-bench/apps/tracker && git pull
cd /home/frappe/frappe-bench
./env/bin/pip install -e apps/tracker
bench build --app tracker
bench --site erp.zatgo.online migrate
bench --site erp.zatgo.online clear-cache
# restart backend if ModuleNotFoundError
```

## Desk

| Route | Purpose |
|-------|---------|
| `/desk/tracker-workbench` | Vue Overview (status chips), Tasks, Review, Start/Pause/Stop, timesheet submit |
| `/desk/tracker-hours` | Hours by project / user |
| `/desk/tracker-org` | Org tree; Assign person; Admin Create Top; demo seed |

## Smoke

1. System Manager: Org → Create Top (company, branch)
2. Top: Assign Sub/Worker; Overview → Pending Review → Approve
3. Worker: Start → Pause → Stop (day draft Timesheet); submit Pending Review
4. No Next control; Desk icon label **Task Management**

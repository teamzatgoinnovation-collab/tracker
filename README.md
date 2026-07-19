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

`Tracker Top` (Manager) → `Tracker Sub` (Team Lead) → `Tracker Worker`

| Role | Can |
|------|-----|
| Worker | Start/Pause/Next/Stop; Ready for Review; cannot create/assign/approve |
| Sub | Create/assign down-tree; Approve / Rework; submit team draft Timesheets |
| Top | Everything Sub can; close projects; approve Timesheets on Desk (native) |

## Task workflow

```text
Draft → Assigned → In Progress → Ready for Review
  ├── Approve → Completed
  └── Rework  → In Progress
```

Stored on ERPNext Task: Draft = `Open` without assignee; Assigned = `Open` + assignee; In Progress = `Working`; Ready = `Pending Review`; Completed = `Completed`.

## Site (local + cloud)

**Always** use site name: **`erp.zatgo.online`** (never `frontend`).

| Env | Backend container | Desk |
|-----|-------------------|------|
| Local | `erpnext-backend-1` | local frontend port |
| Cloud | `frappe_docker-backend-1` | https://erp.zatgo.online |

## Install

```bash
bench get-app https://github.com/teamzatgoinnovation-collab/tracker.git
bench --site erp.zatgo.online install-app tracker
bench --site erp.zatgo.online migrate
bench --site erp.zatgo.online clear-cache
```

### Docker deploy / update (locked path)

```bash
# inside backend container
cd /home/frappe/frappe-bench/apps/tracker && git pull
cd /home/frappe/frappe-bench
./env/bin/pip install -e apps/tracker
bench --site erp.zatgo.online migrate
bench --site erp.zatgo.online clear-cache
# then restart backend so Gunicorn picks up the package
docker restart <backend-container>
```

Without `pip install -e` + restart, Desk may return **Internal Server Error** with `ModuleNotFoundError: No module named 'tracker'`.

Hub push also needs **zatgo_core** installed and migrated (ZG Device Token + devices API).

## Desk

| Route | Purpose |
|-------|---------|
| `/desk/tracker-workbench` | Stage labels, Review tab, Ready/Approve/Rework, My/Team filters, Start/Pause/Next/Stop, assign (leads), submit team timesheets |
| `/desk/tracker-hours` | Hours by project / user from Timesheet (date range) |
| `/desk/tracker-org` | Org tree, roles, reports_to, demo seed |
| Workspace Sidebar **Tracker** | Shortcuts + Desktop Icon (ensured on migrate) |
| **Tracker Settings** | Default company + default activity type |

## Smoke checklist

1. Desk login → **Tracker** icon / sidebar visible  
2. Org Setup → **Seed demo work data** (or Top/Sub/Worker only) — password `Tracker@123`  
3. As Top/Sub: New Task (Draft) → Assign → Worker sees Assigned  
4. As Worker: Start → task becomes In Progress; Pause/Next/Stop; Timesheet draft on stop/next  
5. As Worker: **Ready for Review** → Sub/Top **Approve** or **Rework** (note required)  
6. Review tab shows Pending Review queue for leads  
7. Submit team timesheets (Workbench / Hours) for Sub/Top; Top approves on Timesheet Desk if workflow enabled  
8. Worker cannot see New Project / Assign / Approve buttons  
9. Workbench filters → `?scope=&project=&status=` deep link + Save filter preset  
10. Hours page → date range shows Timesheet aggregates  
11. Assign → Notification Log for assignee (FCM if ZG Notification Settings `push_enabled` + `fcm_server_key`)  

## Clients

Flutter / web / desktop: role-aware create/assign; stage actions (Ready / Approve / Rework); Start/Pause/Next/Stop; who-is-running; filters; Hours + submit team timesheets. Flutter registers FCM via `zatgo_core.api.v1.devices.register_token`.

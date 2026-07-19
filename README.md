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
| `/desk/tracker-workbench` | My/Team filters, deep links, presets, tickets, Start/Pause/Next/Stop, assign, who is running |
| `/desk/tracker-hours` | Hours by project / user from Timesheet (date range) |
| `/desk/tracker-org` | Org tree, roles, reports_to, demo seed |
| Workspace Sidebar **Tracker** | Shortcuts + Desktop Icon (ensured on migrate) |
| **Tracker Settings** | Default company + default activity type |

## Smoke checklist

1. Desk login → **Tracker** icon / sidebar visible  
2. Org Setup → **Seed demo work data** (or Top/Sub/Worker only) — password `Tracker@123`  
3. Workbench → see demo tasks / who is running; Hours → see Timesheet rows  
4. Workbench → New Task → Assign from org picker (down-tree only)  
5. Start → Pause → Next → Stop; Timesheet row created on stop/next  
6. Tickets tab → New Ticket + assign  
7. Who is Running shows active timers + elapsed  
8. Tracker Settings → set company / activity type; new Start uses them  
9. Workbench filters → `?scope=&project=&status=` deep link + Save filter preset  
10. Hours page → date range shows Timesheet aggregates  
11. Assign → Notification Log for assignee (FCM if ZG Notification Settings `push_enabled` + `fcm_server_key`)  

## Clients

Flutter / web / desktop: create/assign from `hierarchy.my_tree`, tickets assign, Start/Pause/Next/Stop + elapsed, who-is-running, `/tasks` query filters + presets, `/reports` Hours page. Flutter registers FCM via `zatgo_core.api.v1.devices.register_token`.

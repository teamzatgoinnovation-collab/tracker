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

Desk: **/desk/tracker-workbench**

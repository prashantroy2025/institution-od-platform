# College ERP Completion Checklist

Audit date: 2026-10-09

## Existing and preserved

- [x] Stabilization/security and JWT/RBAC foundations
- [x] Responsive shared UI styles
- [x] Academic sessions, semesters, courses, subjects, batches, sections, profiles
- [x] Timetable and classroom scheduling
- [x] Student class attendance
- [x] Faculty attendance and timetable-derived workload
- [x] Assignments, submissions, learning materials, private downloads
- [x] Examinations, registration, seating, marks, publication, results
- [x] OD, events, participants, QR attendance, notifications, audit logs, exports

## Remaining modules

| Area | Status | Evidence / next dependency |
|---|---|---|
| Fees & Finance | PARTIAL | Core invoice/line-item, paise accounting, adjustments, offline payment verification, statements, audit, RBAC, and gateway-not-configured behavior implemented. Added responsive `public/finance.html` for authorized invoice listing, statements, and student offline-payment submission. Budgets/expenses/reconciliation/receipts/CSV/PDF UI and configured gateway remain. |
| Library | PARTIAL | Catalog/search, copies, issue/return, configurable baseline fine calculation, reservations, private digital download, audit, RBAC, and tests implemented. Added responsive `public/library.html` for catalog, student loans, reservations, and private downloads. Renewals/waitlists, admin UI, fine policy configuration, and richer reports remain. |
| Shared ERP UI shell | PARTIAL | Existing login/dashboard shell preserved and extended with responsive `profile.html`, `attendance.html`, `messages.html`, and campus-feed-enabled `dashboard.html`. Mobile bottom navigation uses Home, Messages, Attendance, Profile. Browser automation is not configured in this repository. |
| Student Profile | PARTIAL | Added `/api/profile` read/update, private document upload/download, emergency-contact/privacy updates, and `public/profile.html`. Academic fields remain read-only where no secure edit policy/endpoint exists. Sensitive identity documents are not collected. |
| Student Attendance | PARTIAL | Added `/api/attendance/summary` and `public/attendance.html` using class-attendance records and timetable relationships. Present/Late/Excused count as attended per existing service rules; students are self-scoped. Today's schedule and faculty/HOD operational views still rely on legacy attendance/timetable pages. |
| Home / Campus Feed | PARTIAL | Added additive persistent feed/follow/like/save/comment/report/block tables and `/api/community`; `public/dashboard.html` includes College Updates, Following, Classmates, official-post labels, text/media posting, pagination contract, and honest unavailable states. Search, full moderation UI, sharing, and People You May Know UI remain. |
| Messages / Academic Groups | PARTIAL | Added persistent groups, direct conversations, membership, message history, unread/read state, replies, reactions, pins, attachments, authorization, and authenticated Socket.IO delivery hooks under `/api/messages`; `public/messages.html` supports conversations, eligible groups, join/open flow, messages, and attachments. Browser realtime/reconnect behavior remains manually unverified. |
| Demo people import | PARTIAL | Added `data/demo/college_erp_demo_people_100.csv` and guarded `scripts/seedDemoPeople.js`; development/test-only, transactional, idempotent conflict-skipping, bcrypt-hashed random passwords, academic-ID resolution, registry cleanup. It does not seed attendance, marks, payments, documents, or announcements. |
| Admissions & Enrollment | NOT IMPLEMENTED | No admissions/application/document-vault workflow found. |
| Academic administration extensions | PARTIAL | Core academic foundation exists; calendar/holidays/policies/faculty-assignment administration are not implemented. |
| Certificates & student services | NOT IMPLEMENTED | No certificate, document-request, helpdesk, or grievance workflow found. |
| HR & payroll | NOT IMPLEMENTED | No authoritative employment, leave, salary, or payroll policy exists. |
| Campus operations | NOT IMPLEMENTED | No hostel, transport, facility-booking, laboratory, visitor, or incident modules found. |
| Student life | PARTIAL | Events/OD/QR exist; clubs, feed, messaging, alumni, mentoring, and donations are absent. |
| Placement & career | NOT IMPLEMENTED | No career, employer, job, internship, or placement schema/routes found. |
| Communication & feedback | PARTIAL | Existing notifications exist; no targeted notices, preferences, surveys, or reliable reminder jobs. |
| Administration & governance | PARTIAL | Existing RBAC/audit/export foundations exist; no granular permission/settings/retention/recovery controls. |
| Public college portal | PARTIAL | Basic public landing page exists; configurable public content portal is not implemented. |
| Integrations & reliability | PARTIAL | Health check, rate limiting, audit, and notifications exist; provider settings/webhooks/API docs/backups are absent. |

## Progress evidence

- Finance migration: `db/migrations/008_finance_core.sql`; API: `/api/finance`; service/controller/routes and `test/financeIntegration.test.js`.
- Library migration: `db/migrations/009_library_core.sql`; API: `/api/library`; service/controller/routes and `test/libraryIntegration.test.js`.
- Profile/community/messaging migration: `db/migrations/010_profile_feed_messages.sql`; APIs: `/api/profile`, `/api/attendance/summary`, `/api/community`, `/api/messages`; UI: `public/profile.html`, `public/attendance.html`, `public/dashboard.html`, `public/messages.html`.
- Focused structural verification: `test/profileFeedMessages.test.js`. Integration tests for the new MySQL endpoints, Socket.IO delivery, and private uploads are still required.
- Focused verification: finance and library tests pass; migration/additive checks pass.
- Final verification: focused profile/feed/message suite passed 5/5; full repository suite passed 34/34 with exit code 0. Node syntax checks and `git diff --check` passed. Browser automation and live MySQL/Socket.IO integration tests were not performed in this environment.

## Policy and external prerequisites

- Payment provider credentials, webhook secret, settlement/reconciliation rules, and refund authority are not configured.
- Institutional grading, fee, admission eligibility, leave, payroll, fine, hostel, transport, and certificate policies require authoritative decisions before automation.
- Email/SMS provider credentials and delivery semantics are not configured.
- Backup storage, retention period, recovery objective, and deployment ownership are not configured.
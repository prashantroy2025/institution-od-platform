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
| Student Attendance | PARTIAL (code COMPLETE; demo data seeded) | Dedicated dashboard `public/attendance.html` + 8 shortcut views in `public/attendance-view.html` (mark, history, subjects, monthly, leave, od, analytics, compensatory), all wired to `/api/attendance/*`, `/api/timetable`, `/api/student/my-od`. Migration `016_attendance_leave.sql` applied. **Demo data (2026-10-13):** added guarded seeder `scripts/seedAttendanceDemoData.js` (Milestone option c) that seeds a small, internally-consistent dataset for demo student id=22 (Tara Saxena) in her service-resolved current semester (Semester 1 / EE033 Control Systems): 2 timetable slots (Tue 11:00, Thu 14:00) + 4 class sessions/records in Sep 2026 (2 Present, 1 Late, 1 Absent → 75%). Verified via authenticated APIs (19/19 checks): analytics total=4/attended=3/75%/eligible, records=4 (all EE033), timetable shows EE033 sem1, Leave & OD unaffected, cross-student isolation holds (other student sees 0). Idempotent via `erp_college_demo_registry` (entity_type attendance_timetable/attendance_session); transactional; only INSERT-if-missing; targets `institution_od_demo` only. Compensatory Classes has no policy/schema (documented blocker, not a defect). HOD leave-decision **API** exists; no dedicated HOD UI screen. See "Attendance module continuation" below. |
| Home / Campus Feed | PARTIAL | Added additive persistent feed/follow/like/save/comment/report/block tables and `/api/community`; `public/dashboard.html` includes College Updates, Following, Classmates, official-post labels, text/media posting, pagination contract, and honest unavailable states. Search, full moderation UI, sharing, and People You May Know UI remain. |
| Messages / Academic Groups | PARTIAL (code COMPLETE; inbox empty by data) | Added persistent groups, direct conversations, membership, message history, unread/read state, replies, reactions, pins, attachments, authorization, and authenticated Socket.IO delivery hooks under `/api/messages`; `public/messages.html` supports conversations, eligible groups, join/open flow, messages, and attachments. **Contract verified (2026-10-13):** the failing `profileFeedMessages` `c.is_member` assertion was an outdated expectation — conversation membership is enforced by server-side scoping (`WHERE cm.user_id=?` in `INBOX_SELECT`), not a per-row flag; verified live that a student gets 403 "Conversation access denied" for a conversation they don't belong to, 200 for their own, and the inbox never leaks other members' conversations. The groups `g.is_member` flag (join eligibility) is genuinely used and preserved. Migration 018 applied in `institution_od_demo`. Browser realtime/reconnect behavior remains manually unverified. |
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
- Fees dashboard: `public/fees.html` and `public/fees.js` are linked from the student home Fees tile, quick card, and drawer. Fee Status, semester selector (by fee-structure academic year), Upcoming Payment, Fee Details, Payment History, Scholarships/Concessions/Refund views, and offline payment submission use existing `/api/finance` endpoints. Invoice list rows include `structure_name` and `academic_year`; statements include `adjustments`.
- Fees gaps: Pay Fee Online gateway (provider credentials and webhook secret not configured), Download Receipt (no receipt endpoint), Installment Plan (no schema), Scholarship/Concession application and approval workflows, Refund request workflow, Financial Notices. Browser verification of `fees.html` was not performed.
- Final verification: focused profile/feed/message suite passed 5/5; full repository suite passed 34/34 with exit code 0. Node syntax checks and `git diff --check` passed. Browser automation and live MySQL/Socket.IO integration tests were not performed in this environment.

## Policy and external prerequisites

- Payment provider credentials, webhook secret, settlement/reconciliation rules, and refund authority are not configured.
- Institutional grading, fee, admission eligibility, leave, payroll, fine, hostel, transport, and certificate policies require authoritative decisions before automation.
- Email/SMS provider credentials and delivery semantics are not configured.
- Backup storage, retention period, recovery objective, and deployment ownership are not configured.

## Events module continuation checklist

Audit date: 2026-10-09. Statuses below reflect source inspection; runtime/browser/database verification is tracked separately.

| Requirement | Status | Evidence / remaining work |
|---|---|---|
| Student Home → dedicated Events route | PARTIALLY IMPLEMENTED | `home.js` service/drawer, event banner, OD quick card, and `dashboard.html` Events shortcut now target `events.html`; browser login-to-click test remains. |
| Events layout isolation, header, tabs, responsive cards | PARTIALLY IMPLEMENTED | Existing `events.html` remains a separate page; header, search, tabs, filters, chips, empty/error/retry states and shared bottom navigation exist. Browser/responsive checks remain; event imagery and full event metadata are unavailable in the current schema. |
| Upcoming published events | PARTIALLY IMPLEMENTED | Uses authenticated `/api/student/events`, limited to approved/non-deleted rows; list/search response now includes consistent organizer/time data and avoids duplicate cards from multiple OD rows. Live MySQL data and pagination remain unverified. |
| My Participation | PARTIALLY IMPLEMENTED | Reads the authenticated student's event roster and OD records. The existing participant table represents organizer/QR attendance, not student registrations; registration lifecycle statuses are unavailable. |
| Past Events | PARTIALLY IMPLEMENTED | Derived from actual event end dates in the browser with date-only parsing; institutional timezone is not configured and browser verification remains. |
| Search and filters | PARTIALLY IMPLEMENTED | Title search calls real `/api/student/search-events`; participation filter Apply/Reset is local to real records. Category chips send `category=` to `/api/student/events` and `/api/student/search-events` (validated against `utils/eventCategories.js`). Events created without a category keep NULL and appear only under All. Date/status filters beyond the Upcoming/Past tabs are not implemented. |
| Event details | PARTIALLY IMPLEMENTED | Added student-authorized `GET /api/student/events/:id` and a safe detail dialog for currently stored title/date/time/organizer/participation/OD values. Descriptions, banner images, venue, eligibility, capacity, registration dates, rules and category are absent from the existing schema. |
| Student registration and cancellation | NOT IMPLEMENTED | No self-registration endpoint or registration-state schema exists. Do not repurpose `event_participants`: it is attendance/OD evidence. A separately authorized registration design and institutional eligibility/cancellation rules are still required. |
| Organizer event management and participant records | PARTIALLY IMPLEMENTED | Existing organizer create/list, participant/CSV, QR and reporting flows are preserved. HOD assignment now validates active same-department HODs; end-to-end workflow is unverified. |
| HOD approvals and OD workflow | PARTIALLY IMPLEMENTED | Active HOD approval predicates now enforce target assignment; OD requests require an approved published event, in-range date, recorded participant and active event-department HOD. HOD review/attendance automation remains existing; transaction and live-DB tests remain. |
| QR attendance and audit integration | PARTIALLY IMPLEMENTED | Existing QR/attendance and audit tables/workflows retained. This work did not change attendance authorization or add audit records to all workflow actions; broader integration/security gaps remain. |
| Authentication and private data | PARTIALLY IMPLEMENTED | Student detail/OD APIs remain role-protected and student-scoped. Organizer history is limited to that organizer's events; database-backed student/HOD/organizer event text is escaped at updated HTML sinks. Authorization regressions require runtime tests. |

### Events work recorded for this continuation

- Modified: `public/home.js`, `public/dashboard.html`, `public/events.html`, `public/events.js`, `public/events.css`, `public/organizer.html`, `controllers/studentController.js`, `controllers/eventController.js`, `controllers/hodController.js`, `routes/studentRoutes.js`, `public/student.html`, `public/hod.html`.
- Added: `test/eventsModule.test.js`, `utils/eventCategories.js`, `db/migrations/015_event_categories.sql` (additive, nullable `events.category`).
- Database/API changes: authenticated student event-detail route; optional event category on create, returned by student list/search/detail, and filterable via `category=`. No data changes.
- Tests executed: `node --test test/eventsModule.test.js test/runMigrationsSafety.test.js` passed 22/22. Node syntax checks passed for changed controllers and `public/events.js`.
- Not executed: migration 015 against a live MySQL database; browser checks of the Events page at mobile and desktop widths; full repository suite.
- Outstanding blockers: no screenshot supplied for comparison; no authorized database access to apply migration 015 or run integration tests; existing schema has no registration table/fields, event image/description/venue/eligibility/capacity/rules; self-registration and cancellation need a product/policy decision (capacity, deadlines, cancellation window) before implementation; institutional timezone is unspecified.
- Exact next incomplete task: apply migration 015 in a development database, run the full suite, and browser-check Home → Events, tabs, search, chips, and details; then decide the registration policy before building self-registration.

## Attendance module continuation checklist

Audit date: 2026-10-12. Statuses reflect source inspection plus the focused tests listed below.

| Requirement | Status | Evidence / remaining work |
|---|---|---|
| Home shortcut → dedicated dashboard | COMPLETE (code) | `home.js` links to `attendance.html`; dashboard renders header, semester selector, overview, eight shortcuts, recent list, and bottom nav independently of API results. Browser click-through not verified. |
| Semester selector | COMPLETE (code) | `GET /api/attendance/semesters` lists the student's batch-session semesters and the current one; selection drives all analytics, records, and today's classes. |
| Present/Absent/Total and percentage | COMPLETE (code) | `GET /api/attendance/analytics`. Present/Late/Excused count as attended (existing rule); zero sessions return null percentage. |
| Eligibility warning | COMPLETE (code) | Uses `attendance_settings.shortage_threshold` (default 75, super_admin-configurable). Reports classes needed or classes that can be missed, computed from real records. |
| Mark Attendance (QR/Manual) | PARTIAL | Students cannot self-mark class attendance; today's classes show faculty-marked status. Event QR check-in links to `scan.html` (existing `/api/qr/scan`, server-validated). No class-session QR workflow exists; building one is a faculty-workflow design decision. |
| Attendance History | COMPLETE (code) | `GET /api/attendance/records` with semester, subject, status, date filters, pagination. |
| Subject-wise Attendance | COMPLETE (code) | Subject totals/percentages from analytics, with classes needed or can-miss. |
| Monthly Report | COMPLETE (code) | Month-wise totals with subject breakdowns from analytics; CSV download generated client-side from the same data. |
| Leave Application | PARTIAL | `POST/GET /api/attendance/leave`, document download, overlap prevention, audit logs, migration `016_attendance_leave.sql`. Approved leave does not alter attendance (no existing rule defines otherwise). HOD decision endpoint `POST /api/attendance/leave/:id/decision` exists; no HOD UI yet. |
| OD Application | PARTIAL | Shows real `/api/student/my-od` status and links to Events; reuses existing approval. Attachments/supporting info are not in the existing OD schema, so none are shown. |
| Attendance Analytics | COMPLETE (code) | Monthly trend, subject comparison, eligibility warnings from real records. |
| Compensatory Classes | BLOCKED | No compensatory-class schema or institutional policy exists. The screen states this and shows no fabricated items. |
| Permissions and audit | COMPLETE (code) | Student identity from token; student-only routes; HOD decisions restricted to assigned HOD; leave create/decision audited. |
| Tests | PARTIAL | `test/attendanceStudent.test.js` (mocked DB: math, zero sessions, semester scope, roles, validation, overlap, decision guard). Full suite: 88 passed, 1 skipped (guarded live DB suite). |
| Browser, responsive, live DB | NOT VERIFIED | No database access in this session; migration 016 not applied. Preview iframe was not mounted and a headless browser run was blocked by sandbox policy, so the dashboard and all eight views are unrendered. |

### Attendance work recorded for this continuation

- Added: `services/attendanceStudentService.js`, `controllers/attendanceStudentController.js`, `routes/attendanceStudentRoutes.js`, `public/attendance-view.html`, `public/attendance.js`, `public/attendance.css`, `db/migrations/016_attendance_leave.sql`, `test/attendanceStudent.test.js`.
- Modified: `public/attendance.html` (rebuilt as dashboard), `server.js` (mount).
- Frontend continuation (2026-10-12): all eight shortcuts now carry static `attendance-view.html?view=` hrefs so they work before the script runs; Recent Attendance rows show the ✓/✕ status markers from the reference screenshot. Verified by source inspection that every field the dashboard and views read matches the service responses, and that `/api/notifications/unread-count`, `/api/student/my-od`, and student-scoped `/api/timetable` exist. `test/attendanceStudent.test.js` passes 10/10.
- Known differences from the reference screenshot: the eligibility copy reports classes needed (from real records) rather than a percentage-point gap; shortcut icons are text glyphs, not the colored artwork in the screenshot.
- Exact next steps: browser-check `attendance.html` at 390px and 768px+ and all eight `attendance-view.html` views once preview is available; apply migrations 015 and 016 in a development database; run the live-DB suite with a disposable database; build the HOD leave-decision screen; decide the compensatory-class policy and schema.

## Examinations dashboard continuation checklist

Audit date: 2026-10-12. Statuses reflect source inspection and automated tests. Browser verification was not performed.

| Requirement | Status | Evidence / remaining work |
|---|---|---|
| Student Home → Examinations | COMPLETE (code) | Existing `home.js` shortcut and quick card link to `examinations.html`, which is now the dashboard. |
| Dashboard layout, 12 shortcuts, Upcoming section | COMPLETE (code) | `examinations.html` and `examinations.css`; shortcuts are static links so the grid renders without APIs. Upcoming shows up to 3 future exams from `/api/examinations` with countdowns from `scheduled_start`; View All opens the schedule. |
| Exam Schedule | COMPLETE (code) | Upcoming and Past tabs; venue from `venue_name`; undated exams are listed under Upcoming. |
| Admit Card | PARTIAL | Eligibility from registration and exam status; download uses `/api/examinations/:id/admit-card`, which checks the student's seat. Output is plain text because no PDF generator is in `package.json`. |
| Previous Question Papers | BLOCKED | No question-paper storage or publication workflow exists. The screen states this and shows no records. |
| Results | COMPLETE (code) | Published exams are loaded and each result is fetched through `/api/examinations/:id/result`; grade, pass/fail and declared status are shown. |
| Syllabus & Exam Pattern | PARTIAL | Syllabus from `/api/academic/student/syllabus`; exam pattern from scheduled exams' pass and maximum marks. Grading bands are not in the list endpoint and are not shown here. |
| Important Notices | PARTIAL | Published academic calendar events of type Examination or Registration Deadline. No separate notice feed exists. |
| Exam Registration | PARTIAL | Registers through `POST /api/examinations/:id/register`, which now enforces the opening time and rejects duplicates with 409. No cancellation endpoint exists, so none is offered. |
| Revaluation / Recheck | BLOCKED | No revaluation schema, eligibility rules or deadlines exist; academic request types do not include it. |
| Hall Ticket Downloads | PARTIAL | Lists registered exams that are eligible and downloads through the same authorized endpoint. Plain-text output only. |
| Internal Marks | BLOCKED | No internal assessment schema exists. Published end-examination marks appear under Results. |
| Performance Analysis | COMPLETE (code) | Subject-wise and semester-wise percentages from declared marks returned by the server. |
| Exam Guidelines | BLOCKED | No institution-configured guidelines store exists. |

### Examinations work recorded for this continuation

- Modified: `public/examinations.html` (replaced an incomplete page), `services/examinationService.js`.
- Added: `public/examinations-view.html`, `public/examinations.js`, `public/examinations.css`.
- Service changes: student exam list now returns subject code, venue, registration window, semester name and the student's own registration status. Registration checks the opening time and duplicates. Student seat lookups filter by the student's own registration in SQL instead of matching names.
- Times are displayed in the viewer's timezone. The institutional timezone is not configured.

### Examinations test results

- `node --test` full suite: 87 passed, 1 failed, 1 skipped.
- The failing test is `test/examinationIntegration.test.js`. Its create request returns 400 before any changed code runs. The diff leaves `create` and `normalize` untouched, so this predates this work and has not been diagnosed.
- Not verified: browser behavior of all screens, live-database behavior of the changed list, registration and seat queries.

### Examinations time-bomb test fixed (2026-10-13)

- **Root cause (test defect, not production):** `test/examinationIntegration.test.js` hardcoded `registration_open_at='2027-01-01T08:00'`. The production `register()` rule (reject when `registration_open_at` is in the future → 400 "Registration has not opened yet") is correct; because the machine date (2026-10-13) precedes 2027-01-01, the student `register` returned 400 instead of the expected 201, failing the suite.
- **Fix (test-only; production unchanged):** the exam fixture now computes `registration_open_at`/`registration_deadline`/`scheduled_start`/`scheduled_end` deterministically relative to `Date.now()` (opened 1 day ago, closes in 30 days) so the window is open regardless of the calendar date the suite runs on. Added explicit registration-window coverage: a not-yet-open exam (opens in 5 days) and a past-deadline exam (closed 1 day ago) must both be rejected with 400.
- **Verified the test is meaningful:** temporarily disabling the "not yet open" production rule made the test fail (`201 !== 400`); restoring it made the test pass. Production `examinationService.js` is unchanged (no diff after restore).
- **Frontend↔backend paths audited (match):** `examinations.js`/`examinations-view.html` call `/api/examinations`, `/api/examinations/:id/register`, `/api/examinations/:id/result`, `/api/examinations/:id/admit-card`, `/api/academic/student/calendar|syllabus`, `/api/auth/me`, `/api/notifications/unread-count` — all present in `routes/examinationRoutes.js` with `verifyToken` + `allowRoles`.
- **Live student check (institution_od_demo, student id=22):** `GET /api/examinations` → 200 with 2 published exams, `my_registration_status` correctly scoped (Registered for EE034, null for EE033); student JWT on staff-only `/api/examinations/reports/summary` → 403.

### Examinations next steps

- Browser-check the dashboard and all 12 screens at 390px and desktop width (browser environment not available in this workspace).
- Decide on the storage design for question papers, revaluation, internal marks and guidelines, and on a PDF generator for admit cards.
- Remaining suite failure is unrelated to Examinations: `test/profileFeedMessages.test.js` (Messages frontend expects `c.is_member`; `public/messages.html` only contains `g.is_member`).

### Messages frontend status

- Frontend files: `public/messages.html` (inbox), `public/messages-thread.html` (thread, `?id=`), `public/messages.css`.
- Static checks: inline scripts of both pages pass `node --check`.
- Not verified: browser rendering at 390px and desktop width. The dev server has no dev command configured, and the preview launcher never mounted.
- Database-dependent, deferred: migration `db/migrations/018_message_preferences.sql` is not applied. Until it is, the conversations list and the mute, pin, and archive updates fail, and the inbox shows its inline error with Retry. Apply it through `scripts/runMigrations.js` only after confirming the runner does not replay earlier migrations unsafely.
- Unverified backend workflows against live MySQL: conversation details and participants, preference updates, authorized message search, recipient search, unread count, and per-user Socket.IO room delivery (`user:<id>` joined in `server.js`).
- Not implemented: presence (online indicators) has no data source in the app; avatars use initials.

### Attendance data relationship (2026-10-13)

- Verified live against `institution_od_demo` with the existing seeded student (`users.id=22`, Tara Saxena, dept 13 / EE, batch 1, section 1). No new users or seed rows were created for this check; the one TEMP-VERIFY leave row created during the workflow test was deleted afterward.
- Endpoint results (all HTTP 200, student-scoped from the bearer token):
  - `/api/attendance/semesters` → 8 semesters, `current_semester_id` resolved by session date range.
  - `/api/attendance/analytics` → `overall.total=0`, `eligibility.status='no_records'`, `subjects=[]`.
  - `/api/attendance/records` → `items=0`, `pagination.total=0`.
  - `/api/attendance/leave` → `items=0` (before the workflow test).
  - `/api/student/my-od` → `items=0`.
  - `/api/timetable` → `items=1`.
- **Root cause of the reported "historical vs current semester" mismatch (this is correct-by-design, not a bug):**
  - Analytics/records join `class_attendance_records → class_attendance_sessions → timetable_entries → subjects` and filter by `timetable_entries.semester_id`. Attendance therefore belongs to the semester of the **timetable entry**, i.e. the semester in which the class was actually taught.
  - The CSV importer's `importAttendance()` (scripts/importCollegeDemoData.js:342) requires `subject.semester === person.semester` (the student's single current-semester value in `students_1000.csv`). Demo student STU0001 is recorded in semester 2, but their attendance rows reference SUB031/SUB032 which are semesters 7/8. The guard rejects these as "student, subject, and source semester do not exactly match" → 0 of 12,000 rows imported.
  - This intentionally prevents fabricating attendance or forcing multi-semester history into the current semester. Consistent with the milestone rule "Do not fabricate attendance."
- **State:** `class_attendance_sessions=0`, `class_attendance_records=0`, `timetable_entries=1`. Data-driven views render honest empty states; the service math (attended = Present+Late+Excused, threshold 75, classes-needed) is covered by `test/attendanceStudent.test.js` (mocked fixtures).

### Attendance verification test results (2026-10-13)

- `test/attendanceStudent.test.js` + `test/classAttendanceIntegration.test.js` + `test/facultyAttendanceIntegration.test.js`: **12 pass / 0 fail**.
- Full suite: **89 tests · 86 pass · 2 fail · 1 skip** — unchanged from baseline. The 2 failures are pre-existing and unrelated to Attendance: `examinationIntegration.test.js` (test hardcodes `registration_open_at=2027-01-01`, a time-bomb vs. today) and `profileFeedMessages.test.js` (Messages frontend `c.is_member` contract drift).
- Leave workflow verified end-to-end against the real server: student POST `/api/attendance/leave` → 201; student list self-scoped (sees own); HOD (id=1069, dept 13) list sees it; HOD `POST /leave/:id/decision` (Approved) → 200 and persists (student list reflects status + decision_note). TEMP-VERIFY row removed after.

### Attendance next steps (blockers / decisions, no code changed)

- **To make the data-driven views non-empty, choose ONE (not done here — needs a policy decision):**
  1. Extend the importer to import attendance into the semester of its referenced subject (per-row semester), OR
  2. Generate a full `timetable_entries` grid for each batch/section and seed matching `class_attendance_sessions`/`records` for the students' current semester via a guarded seed script (mirrors `seedAcademicDemoData.js`), OR
  3. Add a documented demo-only seeder for class attendance scoped to the student's current semester.
- Compensatory Classes: no schema/policy exists; the UI already shows an honest "not available" state. Blocked pending a compensatory-class policy decision — not a defect.
- HOD leave-decision UI: the API (`POST /api/attendance/leave/:id/decision`, `GET /api/attendance/leave` for HOD) exists and is tested; a dedicated HOD screen is still unbuilt.
- Browser verification of `attendance.html` and all 8 views at mobile/desktop widths: **not performed** (no browser/Puppeteer configured in this environment).


### Messages contract verification (2026-10-13)

- **Confirmed root cause:** the failing `profileFeedMessages` assertion `assert.match(ui, /c\.is_member/)` was an outdated expectation, not a product defect.
  - The **conversations/inbox** API (`services/messageService.js` `INBOX_SELECT`) is scoped server-side to the member (`FROM erp_message_conversation_members cm ... WHERE cm.user_id=?`). It never returns an `is_member` field — every row is, by definition, a conversation the caller belongs to, so such a flag would always be `1` (redundant).
  - The frontend `conversationRow()` never reads a conversation-level `is_member` (it uses `is_muted`, `is_pinned`, `unread_count`, peer/group names).
  - The **groups** API (`listGroups`) genuinely returns `is_member` (`g.is_member`), consumed by `joinableGroups()` to filter groups the user hasn't joined. Both `g.is_member` references are preserved and untouched.
- **Fix (test-only; no product change):** replaced the incorrect `c.is_member` UI assertion with `assert.match(messages, /WHERE cm\.user_id=\?/)`, which verifies the real conversation-membership mechanism (server-side scoping). The intent (membership boundaries enforced) is preserved and arguably strengthened.
- **Verified the test is meaningful:** temporarily removing the `WHERE cm.user_id=?` scoping made the suite fail; restoring it made it pass. `services/messageService.js` confirmed unchanged afterward (no net diff).
- **Live authorization checks (institution_od_demo, read-mostly, temp conversation cleaned up):** Tara (id=22) → `GET /api/messages/conversations/<other>` = **403 "Conversation access denied"**; Tara → `GET .../messages` of another conversation = **403**; member (id=1069) → **200**; Tara's inbox = 200 and never includes the other conversation. Migration 018 columns (`is_muted`, `is_pinned`, `is_archived`) are present.
- **Tests:** focused `profileFeedMessages.test.js` **5 pass / 0 fail**; full regression suite **89 tests · 88 pass · 0 fail · 1 skip** (baseline was 87/1/1). The single skip is the guarded live-integration suite.
- **Remaining Messages limitations:** no conversations or groups seeded in the demo DB (inbox/groups naturally empty); Socket.IO realtime/reconnect and browser rendering at mobile/desktop widths were NOT verified (no browser configured in this environment); presence (online indicators) has no data source by design.


(() => {
  if (!ERP.token()) { ERP.redirectToLogin(); return; }
  const $ = id => document.getElementById(id);
  const esc = ERP.escapeHtml;
  const services = [
    ['subjects','My Subjects','▣','tone-blue'],['assignments','Assignments','▤','tone-amber'],['materials','Study Materials','▧','tone-purple'],
    ['timetable','Timetable','▦','tone-rose'],['syllabus','Syllabus','▤','tone-purple'],['faculty','Faculty','♟','tone-blue'],
    ['calendar','Academic Calendar','▣','tone-blue'],['results','Results','▤','tone-green'],['classroom','Classroom Resources','▤','tone-yellow'],
    ['mentor','Mentor / Advisor','♟','tone-blue'],['registration','Course Registration','▤','tone-rose'],['requests','Academic Requests','▤','tone-blue']
  ];
  let subjectRows = [];
  let currentService = '';

  const serviceUrl = key => `academic.html?service=${encodeURIComponent(key)}`;
  const status = (message, error = false) => {
    const node = $('pageStatus');
    node.hidden = !message;
    node.textContent = message || '';
    node.classList.toggle('error', error);
  };
  const call = (url, options) => ERP.call(url, options);
  const state = (message, error = false) => `<div class="state${error ? ' error' : ''}" role="status">${esc(message)}</div>`;
  const panel = (title, description = '') => `<div class="service-heading"><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div>`;
  const empty = message => `<div class="empty-state">${esc(message)}</div>`;
  const table = (headers, rows) => rows.length ? `<div class="data-card"><table class="data-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : empty('No records are available yet.');
  const statusTag = value => `<span class="status-tag ${String(value || '').toLowerCase().replaceAll(' ', '-')}">${esc(value || 'Unavailable')}</span>`;
  const subjectOptions = (includeBlank = true) => `${includeBlank ? '<option value="">Select a subject (optional)</option>' : ''}${subjectRows.map(s => `<option value="${Number(s.id)}">${esc(s.code)} — ${esc(s.name)}</option>`).join('')}`;
  const loadSubjects = async search => {
    const query = new URLSearchParams({limit:'100'});
    if (search) query.set('search', search);
    const data = await call(`/api/academics/student/subjects?${query}`);
    subjectRows = data.items || [];
    return data;
  };

  function renderServices(filter = '') {
    const query = filter.trim().toLowerCase();
    const list = services.filter(([, label]) => !query || label.toLowerCase().includes(query));
    $('serviceGrid').innerHTML = list.map(([key,label,icon,tone]) => `<a class="service-card ${tone}" href="${serviceUrl(key)}" data-service="${key}"><span class="service-icon" aria-hidden="true">${icon}</span><span class="service-label">${esc(label)}</span></a>`).join('') || empty('No academic services match your search.');
  }

  function timeLabel(date) { return new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(date); }
  const localDateValue = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  function clock(value) { return String(value || '').slice(0,5); }
  function classIsCurrent(item, date, now) {
    const [hour, minute] = clock(item.start_time).split(':').map(Number);
    const [endHour, endMinute] = clock(item.end_time).split(':').map(Number);
    const start = new Date(date); start.setHours(hour, minute, 0, 0);
    const end = new Date(date); end.setHours(endHour, endMinute, 0, 0);
    return { start, end, current: now >= start && now < end };
  }
  function upcomingFrom(items) {
    const now = new Date(); const found = [];
    for (let day = 0; day < 8 && found.length < 4; day++) {
      const date = new Date(now); date.setHours(0,0,0,0); date.setDate(date.getDate() + day);
      const weekday = date.getDay() || 7;
      for (const item of items.filter(row => Number(row.weekday) === weekday).sort((a,b) => clock(a.start_time).localeCompare(clock(b.start_time)))) {
        const range = classIsCurrent(item, date, now);
        if (range.end <= now) continue;
        found.push({ ...item, date, range });
        if (found.length === 4) break;
      }
    }
    return found;
  }
  const classRow = item => `<article class="class-row"><span class="class-marker" aria-hidden="true"></span><div class="class-copy"><strong>${esc(item.subject_name || 'Class')}${item.subject_code ? ` · ${esc(item.subject_code)}` : ''}</strong><small>${timeLabel(item.date)} · ${clock(item.start_time)}–${clock(item.end_time)} · ${esc(item.classroom_code || item.classroom_name || 'Room TBA')}${item.faculty_name ? ` · ${esc(item.faculty_name)}` : ''}</small></div><span class="class-time">${item.range.current ? 'In progress' : 'Upcoming'}</span></article>`;

  async function loadUpcoming() {
    try {
      const data = await call('/api/timetable?limit=100');
      const items = upcomingFrom(data.items || []);
      $('upcomingClasses').className = items.length ? '' : 'empty-state';
      $('upcomingClasses').innerHTML = items.length ? items.map(classRow).join('') : 'No upcoming classes are scheduled for your section.';
    } catch (error) { $('upcomingClasses').innerHTML = state(error.message, true); }
  }

  async function showSubjects() {
    $('serviceContent').innerHTML = panel('My Subjects','Subjects assigned to your current course, semester, and section.') + `<div class="service-controls"><input class="field-control" id="subjectSearch" type="search" placeholder="Search by subject code or title" aria-label="Search subjects"></div><div id="subjectList">${state('Loading subjects…')}</div>`;
    const load = async () => {
      $('subjectList').innerHTML = state('Loading subjects…');
      try {
        const data = await loadSubjects($('subjectSearch').value.trim());
        const rows = data.items.map(s => `<tr><td><strong>${esc(s.code)}</strong></td><td>${esc(s.name)}</td><td>${s.credits == null ? '—' : esc(s.credits)}</td><td>${esc(s.faculty_names || 'Not assigned')}</td><td>${esc(s.semester_name || data.academic.semester)}</td></tr>`);
        $('subjectList').innerHTML = rows.length ? table(['Code','Subject','Credits','Faculty','Semester'],rows) : empty('No subjects are assigned to your academic profile.');
      } catch (error) { $('subjectList').innerHTML = state(error.message,true); }
    };
    let timer;
    $('subjectSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    await load();
  }

  async function downloadFile(path, name) {
    const response = await fetch(ERP.apiBase() + path, { headers: ERP.authHeaders() });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.message || 'Download is unavailable'); }
    const blob = await response.blob(); const href = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = href; link.download = name || 'academic-resource'; link.click(); URL.revokeObjectURL(href);
  }
  async function showAssignments() {
    $('serviceContent').innerHTML = panel('Assignments','Published assignments and your submission history.') + `<div class="service-controls"><input class="field-control" id="assignmentSearch" type="search" placeholder="Search assignments" aria-label="Search assignments"><select class="field-control" id="assignmentSubject" aria-label="Filter by subject"><option value="">All subjects</option></select></div><div id="assignmentList">${state('Loading assignments…')}</div>`;
    try { await loadSubjects(); $('assignmentSubject').innerHTML += subjectRows.map(s => `<option value="${Number(s.id)}">${esc(s.code)} — ${esc(s.name)}</option>`).join(''); } catch {}
    const load = async () => {
      $('assignmentList').innerHTML = state('Loading assignments…');
      try {
        const query = new URLSearchParams({limit:'25'}); if ($('assignmentSearch').value.trim()) query.set('search',$('assignmentSearch').value.trim()); if ($('assignmentSubject').value) query.set('subject_id',$('assignmentSubject').value);
        const data = await call(`/api/learning/assignments?${query}`);
        const items=await Promise.all(data.items.map(async a=>{try{const [detail,submission]=await Promise.all([call(`/api/learning/assignments/${Number(a.id)}`),call(`/api/learning/assignments/${Number(a.id)}/submissions`)]);return {...a,...detail,latestSubmission:submission.items?.[0]};}catch{return a;}}));
        $('assignmentList').innerHTML = items.length ? items.map(a => {const submission=a.latestSubmission;return `<article class="data-card list-row"><div class="class-copy"><strong>${esc(a.subject_code || '')} · ${esc(a.title)}</strong><small>Due ${esc(a.deadline || 'Not set')} · ${esc(a.subject_name || '')}</small>${a.instructions ? `<p>${esc(a.instructions)}</p>` : ''}${a.attachment_original_name ? `<button class="text-action" type="button" data-download-assignment="${Number(a.id)}" data-name="${esc(a.attachment_original_name)}">Download instructions</button>` : ''}<p>Submission: ${statusTag(submission?.status || a.submission_status || 'Not submitted')}${submission?.marks != null ? ` · ${esc(submission.marks)} marks` : ''}</p>${submission?.feedback ? `<small>Feedback: ${esc(submission.feedback)}</small>` : ''}<form class="submit-work" data-submit="${Number(a.id)}"><label>Upload work<input type="file" name="file" required></label><button class="primary-action" type="submit">Submit assignment</button></form></div></article>`;}).join('') : empty('No published assignments match these filters.');
      } catch (error) { $('assignmentList').innerHTML = state(error.message,true); }
    };
    $('assignmentSearch').addEventListener('input',load); $('assignmentSubject').addEventListener('change',load); await load();
  }

  async function showMaterials(title = 'Study Materials') {
    $('serviceContent').innerHTML = panel(title,'Authorized resources grouped by the subjects available to your course.') + `<div class="service-controls"><input class="field-control" id="materialSearch" type="search" placeholder="Search materials" aria-label="Search materials"><select class="field-control" id="materialSubject" aria-label="Filter by subject"><option value="">All subjects</option></select></div><div id="materialList">${state('Loading resources…')}</div>`;
    try { await loadSubjects(); $('materialSubject').innerHTML += subjectRows.map(s => `<option value="${Number(s.id)}">${esc(s.code)} — ${esc(s.name)}</option>`).join(''); } catch {}
    const load = async () => {
      $('materialList').innerHTML = state('Loading resources…');
      try {
        const query = new URLSearchParams({limit:'100'}); if ($('materialSearch').value.trim()) query.set('search',$('materialSearch').value.trim()); if ($('materialSubject').value) query.set('subject_id',$('materialSubject').value);
        const data = await call(`/api/learning/materials?${query}`);
        const rows = data.items.map(m => `<tr><td>${esc(m.subject_name)}</td><td><strong>${esc(m.title)}</strong>${m.description ? `<br><span class="muted">${esc(m.description)}</span>` : ''}</td><td>${esc(m.original_name)}</td><td><button class="primary-action" type="button" data-download-material="${Number(m.id)}" data-name="${esc(m.original_name)}">Download</button></td></tr>`);
        $('materialList').innerHTML = table(['Subject','Resource','File',''],rows);
      } catch (error) { $('materialList').innerHTML = state(error.message,true); }
    };
    $('materialSearch').addEventListener('input',load); $('materialSubject').addEventListener('change',load); await load();
  }

  async function showTimetable() {
    $('serviceContent').innerHTML = panel('Timetable','Your scheduled classes for the assigned section.') + `<div class="service-controls"><button class="subject-tab active" type="button" data-timetable-view="week">Week</button><button class="subject-tab" type="button" data-timetable-view="day">Day</button><button class="subject-tab" type="button" data-timetable-view="all">Weekly grid</button><button class="subject-tab" type="button" data-date-shift="-1" aria-label="Previous period">‹</button><label class="sr-only" for="scheduleDate">Schedule date</label><input class="field-control" id="scheduleDate" type="date"><button class="subject-tab" type="button" data-date-shift="1" aria-label="Next period">›</button></div><div id="timetableList">${state('Loading timetable…')}</div>`;
    let items = [];
    try {
      const data = await call('/api/timetable?limit=100'); items = data.items || [];
      const scheduleDate=$('scheduleDate');scheduleDate.value=localDateValue(new Date());
      let mode='week';
      const render = () => {
        const anchor=new Date(`${scheduleDate.value}T00:00:00`); const days=mode==='day'?1:7; const scheduled=[];
        if(mode==='all'){
          const rows=items.slice().sort((a,b)=>Number(a.weekday)-Number(b.weekday)||clock(a.start_time).localeCompare(clock(b.start_time))).map(i=>`<tr><td>${['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][Number(i.weekday)]}</td><td>${clock(i.start_time)}–${clock(i.end_time)}</td><td>${esc(i.subject_code)} · ${esc(i.subject_name)}</td><td>${esc(i.faculty_name||'—')}</td><td>${esc(i.classroom_code||i.classroom_name||'—')}</td></tr>`);
          $('timetableList').innerHTML=table(['Day','Time','Subject','Faculty','Room'],rows);return;
        }
        for(let offset=0;offset<days;offset++){
          const date=new Date(anchor);date.setDate(date.getDate()+offset);const weekday=date.getDay()||7;
          items.filter(item=>Number(item.weekday)===weekday).forEach(item=>{const range=classIsCurrent(item,date,new Date());scheduled.push({...item,date,range});});
        }
        scheduled.sort((a,b)=>a.date-b.date||clock(a.start_time).localeCompare(clock(b.start_time)));
        $('timetableList').innerHTML=scheduled.length?scheduled.map(item=>`<article class="class-row"><span class="class-marker"></span><div class="class-copy"><strong>${esc(item.subject_code)} · ${esc(item.subject_name)}</strong><small>${timeLabel(item.date)} · ${clock(item.start_time)}–${clock(item.end_time)} · ${esc(item.classroom_code||item.classroom_name||'Room TBA')} · ${esc(item.faculty_name||'Faculty TBA')}</small></div><span class="class-time">${item.range.current?'In progress':item.range.end<=new Date()?'Completed':'Upcoming'}</span></article>`).join(''):empty(mode==='day'?'No classes are scheduled for this date.':'No classes are scheduled during this week.');
      };
      render();
      $('serviceContent').addEventListener('click',event=>{
        const button=event.target.closest('[data-timetable-view],[data-date-shift]');if(!button)return;
        if(button.hasAttribute('data-timetable-view')){mode=button.dataset.timetableView;document.querySelectorAll('[data-timetable-view]').forEach(x=>x.classList.toggle('active',x===button));}
        if(button.hasAttribute('data-date-shift')){const date=new Date(`${scheduleDate.value}T00:00:00`);date.setDate(date.getDate()+Number(button.dataset.dateShift)*(mode==='day'?1:7));scheduleDate.value=localDateValue(date);}
        render();
      });
      scheduleDate.addEventListener('change',render);
    } catch (error) { $('timetableList').innerHTML = state(error.message,true); }
  }

  async function showSyllabus() {
    $('serviceContent').innerHTML = panel('Syllabus','Subject units, topics, and published learning outcomes.') + `<div class="service-controls"><select class="field-control" id="syllabusSubject" aria-label="Filter by subject"><option value="">All subjects</option></select></div><div id="syllabusList">${state('Loading syllabus…')}</div>`;
    try { await loadSubjects(); $('syllabusSubject').innerHTML += subjectRows.map(s=>`<option value="${Number(s.id)}">${esc(s.code)} — ${esc(s.name)}</option>`).join(''); } catch {}
    const load = async () => { $('syllabusList').innerHTML=state('Loading syllabus…'); try {
      const query = new URLSearchParams({limit:'100'}); if ($('syllabusSubject').value) query.set('subject_id',$('syllabusSubject').value);
      const data=await call(`/api/academics/student/syllabus?${query}`);
      $('syllabusList').innerHTML=data.items.length?data.items.map(unit=>`<article class="data-card"><p class="muted">${esc(unit.subject_code)} · Unit ${esc(unit.unit_number)}</p><h3>${esc(unit.title)}</h3>${unit.topics?`<p><strong>Topics</strong><br>${esc(unit.topics).replaceAll('\n','<br>')}</p>`:''}${unit.learning_outcomes?`<p><strong>Learning outcomes</strong><br>${esc(unit.learning_outcomes).replaceAll('\n','<br>')}</p>`:''}</article>`).join(''):empty('Syllabus content has not been published for your subjects.');
    }catch(error){$('syllabusList').innerHTML=state(error.message,true);}};
    $('syllabusSubject').addEventListener('change',load); await load();
  }

  async function showFaculty() {
    $('serviceContent').innerHTML=panel('Faculty','Faculty teaching subjects in your assigned section.')+`<div id="facultyList">${state('Loading faculty…')}</div>`;
    try { const data=await call('/api/academics/student/faculty'); $('facultyList').innerHTML=data.items.length?data.items.map(f=>`<article class="data-card list-row"><span class="service-icon tone-blue" aria-hidden="true">♟</span><div class="class-copy"><strong>${esc(f.name)}</strong><small>${esc(f.designation || 'Faculty')}${f.department_name?` · ${esc(f.department_name)}`:''}</small><p>${esc(f.subjects_taught || 'No subject assignments published')}</p></div></article>`).join(''):empty('No faculty are assigned to your section timetable yet.'); }
    catch(error){$('facultyList').innerHTML=state(error.message,true);}
  }

  async function showCalendar() {
    $('serviceContent').innerHTML=panel('Academic Calendar','Published sessions, holidays, examinations, and registration dates.')+`<div id="calendarList">${state('Loading calendar…')}</div>`;
    try { const data=await call('/api/academics/student/calendar?limit=100'); const items=data.items||[]; $('calendarList').innerHTML=items.length?items.map(e=>`<article class="data-card list-row"><span class="class-time">${esc(e.event_type)}</span><div class="class-copy"><strong>${esc(e.title)}</strong><small>${esc(e.starts_on)}${e.ends_on!==e.starts_on?` – ${esc(e.ends_on)}`:''}${e.semester_name?` · ${esc(e.semester_name)}`:''}</small>${e.description?`<p>${esc(e.description)}</p>`:''}</div></article>`).join(''):empty('No academic calendar events have been published.'); }
    catch(error){$('calendarList').innerHTML=state(error.message,true);}
  }

  async function showResults() {
    $('serviceContent').innerHTML=panel('Results','Only results published by your institution are shown.')+`<div id="resultList">${state('Loading published results…')}</div>`;
    try {
      const data=await call('/api/examinations?limit=100'); const published=(data.items||[]).filter(e=>e.status==='Published');
      if(!published.length){$('resultList').innerHTML=empty('No published results are available yet.');return;}
      const results=await Promise.all(published.map(async exam=>{try{return {exam,result:await call(`/api/examinations/${Number(exam.id)}/result`)}}catch{return {exam,result:null}}}));
      $('resultList').innerHTML=results.map(({exam,result})=>`<article class="data-card"><div class="panel-heading"><div><h3>${esc(exam.title)}</h3><small>${esc(exam.subject_name)} · ${esc(exam.exam_type)}</small></div>${statusTag(result?'Published':'No result')}</div>${result?`<p>${esc(result.summary.total)} / ${esc(result.summary.maximum)} · ${esc(result.summary.percentage)}% · Grade ${esc(result.summary.grade || '—')} · ${result.summary.pass?'Pass':'Review result'}</p>`:''}</article>`).join('');
    }catch(error){$('resultList').innerHTML=state(error.message,true);}
  }

  async function showMentor() {
    $('serviceContent').innerHTML=panel('Mentor / Advisor','Your section advisor and appointment requests.')+`<div id="mentorCard">${state('Loading advisor…')}</div><div class="data-card"><h3>Request guidance or an appointment</h3><form id="mentorForm" class="form-stack"><label>What would you like help with?<textarea name="details" maxlength="4000" required></textarea></label><button class="primary-action" type="submit">Send appointment request</button></form></div>`;
    try { const data=await call('/api/academics/student/mentor'); const m=data.mentor; $('mentorCard').innerHTML=m?`<article class="data-card"><strong>${esc(m.name)}</strong><p>${esc(m.designation || 'Faculty Advisor')}${m.department_name?` · ${esc(m.department_name)}`:''}</p><p class="muted">Contact details are not configured for student display.</p></article>`:empty('No advisor has been assigned to your section.'); }
    catch(error){$('mentorCard').innerHTML=state(error.message,true);}
  }

  async function showRegistration() {
    $('serviceContent').innerHTML=panel('Course Registration','Request active subjects from your current course and semester. Approval is handled by authorized academic staff.')+`<div class="data-card"><h3>Available subjects</h3><div id="eligibleSubjects">${state('Loading eligible subjects…')}</div></div><div class="data-card"><h3>My registration requests</h3><div id="registrationHistory">${state('Loading registrations…')}</div></div>`;
    try {
      const [subjectsData, registrationData]=await Promise.all([loadSubjects(),call('/api/academics/student/registrations?limit=100')]);
      const existing=new Map((registrationData.items||[]).map(r=>[Number(r.subject_id),r]));
      const eligible=subjectRows.filter(s=>!existing.has(Number(s.id)));
      $('eligibleSubjects').innerHTML=eligible.length?eligible.map(s=>`<div class="list-row"><div class="class-copy"><strong>${esc(s.code)} · ${esc(s.name)}</strong><small>${s.credits==null?'Credits not recorded':`${esc(s.credits)} credits`}</small></div><button class="primary-action" type="button" data-register-subject="${Number(s.id)}">Request</button></div>`).join(''):empty('All currently eligible subjects already have a registration request.');
      $('registrationHistory').innerHTML=registrationData.items.length?registrationData.items.map(r=>`<div class="list-row"><div class="class-copy"><strong>${esc(r.subject_code)} · ${esc(r.subject_name)}</strong><small>${esc(r.semester_name)}</small></div>${statusTag(r.status)}</div>`).join(''):empty('You have not submitted any registration requests.');
    }catch(error){$('eligibleSubjects').innerHTML=state(error.message,true);}
  }

  async function showRequests() {
    $('serviceContent').innerHTML=panel('Academic Requests','Submit a request for review and track its status.')+`<div class="data-card"><form id="requestForm" class="form-stack"><label>Request type<select class="field-control" name="request_type" required><option>Certificate</option><option>Subject Change</option><option>Academic Record Correction</option><option>Advisor Appointment</option></select></label><label>Related subject<select class="field-control" name="subject_id"><option value="">Not applicable</option></select></label><label>Details<textarea name="details" maxlength="4000" required></textarea></label><label>Supporting document (PDF, PNG, or JPEG, max 5 MB)<input type="file" name="document" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"></label><button class="primary-action" type="submit">Submit request</button></form></div><div class="data-card"><h3>Request history</h3><div id="requestHistory">${state('Loading requests…')}</div></div>`;
    try { await loadSubjects(); $('requestForm [name="subject_id"]').innerHTML+=subjectOptions(false); } catch {}
    try { const data=await call('/api/academics/student/requests?limit=100'); $('requestHistory').innerHTML=data.items.length?data.items.map(r=>`<article class="list-row"><div class="class-copy"><strong>${esc(r.request_type)}${r.subject_code?` · ${esc(r.subject_code)}`:''}</strong><small>${esc(r.created_at)}</small><p>${esc(r.details)}</p>${r.document_original_name?`<button class="text-action" type="button" data-download-request="${Number(r.id)}">Download ${esc(r.document_original_name)}</button>`:''}</div>${statusTag(r.status)}</article>`).join(''):empty('You have not submitted any academic requests.'); }
    catch(error){$('requestHistory').innerHTML=state(error.message,true);}
  }

  const renderers = { subjects:showSubjects, assignments:showAssignments, materials:()=>showMaterials(), classroom:()=>showMaterials('Classroom Resources'), timetable:showTimetable, syllabus:showSyllabus, faculty:showFaculty, calendar:showCalendar, results:showResults, mentor:showMentor, registration:showRegistration, requests:showRequests };
  async function openService(key) {
    if (!renderers[key]) return;
    currentService=key; $('landingView').hidden=true; $('serviceView').hidden=false; $('serviceContent').innerHTML=state('Loading…');
    $('pageTitle').textContent=services.find(s=>s[0]===key)?.[1] || 'Academic';
    const query=new URLSearchParams(location.search); query.set('service',key); history.replaceState(null,'',`${location.pathname}?${query}`);
    await renderers[key]();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function showLanding() {
    currentService=''; $('serviceView').hidden=true; $('landingView').hidden=false; $('pageTitle').textContent='Academic';
    history.replaceState(null,'',location.pathname); window.scrollTo({top:0,behavior:'smooth'});
  }

  $('searchToggle').addEventListener('click',()=>{ $('searchForm').hidden=!$('searchForm').hidden; if(!$('searchForm').hidden)$('serviceSearch').focus(); });
  $('searchForm').addEventListener('submit',event=>{event.preventDefault();renderServices($('serviceSearch').value);});
  $('serviceSearch').addEventListener('input',()=>renderServices($('serviceSearch').value));
  $('backToServices').addEventListener('click',showLanding);
  $('serviceGrid').addEventListener('click',event=>{const link=event.target.closest('[data-service]');if(link){event.preventDefault();openService(link.dataset.service);}});

  $('serviceContent').addEventListener('click',async event=>{
    const material=event.target.closest('[data-download-material]'); const assignment=event.target.closest('[data-download-assignment]'); const requestDocument=event.target.closest('[data-download-request]'); const registration=event.target.closest('[data-register-subject]');
    try {
      if(material) await downloadFile(`/api/learning/materials/${Number(material.dataset.downloadMaterial)}/download`,material.dataset.name);
      if(assignment) await downloadFile(`/api/learning/assignments/${Number(assignment.dataset.downloadAssignment)}/download`,assignment.dataset.name);
      if(requestDocument) await downloadFile(`/api/academics/student/requests/${Number(requestDocument.dataset.downloadRequest)}/document`,'academic-request-document');
      if(registration){ registration.disabled=true; await call('/api/academics/student/registrations',{method:'POST',body:{subject_id:Number(registration.dataset.registerSubject)}}); status('Registration request submitted.'); await showRegistration(); }
    } catch(error){status(error.message,true);if(registration)registration.disabled=false;}
  });
  $('serviceContent').addEventListener('submit',async event=>{
    if(event.target.matches('.submit-work')){
      event.preventDefault();const form=event.target;const input=form.querySelector('[name="file"]');const data=new FormData();data.append('file',input.files[0]);
      try{await call(`/api/learning/assignments/${Number(form.dataset.submit)}/submissions`,{method:'POST',body:data});status('Assignment submitted.');await showAssignments();}catch(error){status(error.message,true);}
    }
    if(event.target.id==='requestForm'){
      event.preventDefault();const form=event.target;const body=new FormData(form);if(!form.elements.document.files[0])body.delete('document');
      try{await call('/api/academics/student/requests',{method:'POST',body});status('Academic request submitted for review.');await showRequests();}catch(error){status(error.message,true);}
    }
    if(event.target.id==='mentorForm'){
      event.preventDefault();const details=event.target.elements.details.value.trim();
      try{await call('/api/academics/student/requests',{method:'POST',body:{request_type:'Advisor Appointment',details}});status('Appointment request submitted.');event.target.reset();}catch(error){status(error.message,true);}
    }
  });

  async function loadNotifications() {
    try {
      const [count, items] = await Promise.all([call('/api/notifications/unread-count'),call('/api/notifications/my-notifications')]);
      const unread=Number(count.unread_notifications)||0; const badge=$('notificationBadge'); badge.hidden=unread===0; badge.textContent=unread>99?'99+':String(unread);
      $('notificationList').innerHTML=items.length?items.map(item=>`<div class="notification-item"><strong>${esc(item.message || 'Notification')}</strong><small>${esc(item.created_at || '')}${Number(item.is_read)?' · Read':' · Unread'}</small>${Number(item.is_read)?'':`<button type="button" class="text-action" data-read-notification="${Number(item.id)}">Mark read</button>`}</div>`).join(''):empty('You have no notifications.');
    } catch(error) { $('notificationList').innerHTML=state(error.message,true); }
  }
  $('notificationButton').addEventListener('click',()=>{const panel=$('notificationPanel');panel.hidden=!panel.hidden;if(!panel.hidden)loadNotifications();});
  $('notificationList').addEventListener('click',async event=>{const button=event.target.closest('[data-read-notification]');if(!button)return;try{await call('/api/notifications/mark-read',{method:'POST',body:{id:Number(button.dataset.readNotification)}});await loadNotifications();}catch(error){$('notificationList').innerHTML=state(error.message,true);}});

  async function init() {
    renderServices();
    try {
      const profile=await call('/api/auth/me');
      if(profile.role!=='student'){location.replace('dashboard.html');return;}
      await loadUpcoming();
      const selected=new URLSearchParams(location.search).get('service');
      if(selected) await openService(selected);
    } catch(error) { if(error.status===401){ERP.redirectToLogin();return;} $('upcomingClasses').innerHTML=state(error.message,true); }
  }
  init();
})();

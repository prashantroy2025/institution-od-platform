(() => {
  if (!ERP.token()) { ERP.redirectToLogin(); return; }
  const $=id=>document.getElementById(id), esc=ERP.escapeHtml;
  let profile, active='registrations', subjects=[];
  const errorState=e=>`<p class="state error">${esc(e.message)}</p>`;
  const empty=text=>`<p class="empty-state">${esc(text)}</p>`;
  const badge=status=>`<span class="status-tag ${String(status).toLowerCase().replaceAll(' ','-')}">${esc(status)}</span>`;
  const request=(url,options)=>ERP.call(url,options);
  async function downloadDocument(id){const response=await fetch(ERP.apiBase()+`/api/academics/student/requests/${Number(id)}/document`,{headers:ERP.authHeaders()});if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.message||'Download failed');}const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download='academic-request-document';link.click();URL.revokeObjectURL(url);}
  function setStatus(message,error=false){const node=$('manageStatus');node.textContent=message;node.classList.toggle('error',error);}
  const currentPanel=()=>document.querySelector(`[data-panel="${active}"]`);
  function title(text,description=''){return `<div class="service-heading"><h2>${esc(text)}</h2>${description?`<p>${esc(description)}</p>`:''}</div>`;}

  async function loadRegistrations(){
    const panel=$('managePanel');panel.innerHTML=title('Course Registrations','Review student subject-selection requests.')+'<div id="manageRows" class="state">Loading…</div>';
    try{const data=await request('/api/academics/student/registrations?status=Pending&limit=100');panel.querySelector('#manageRows').innerHTML=data.items.length?data.items.map(r=>`<article class="data-card list-row"><div class="class-copy"><strong>${esc(r.student_name)} · ${esc(r.subject_code)} — ${esc(r.subject_name)}</strong><small>${esc(r.semester_name)} · ${esc(r.created_at)}</small></div><button class="primary-action" data-review-registration="${Number(r.id)}" data-status="Approved">Approve</button><button class="primary-action" data-review-registration="${Number(r.id)}" data-status="Rejected">Reject</button></article>`).join(''):empty('There are no pending course registrations.');}
    catch(e){panel.querySelector('#manageRows').innerHTML=errorState(e);}
  }

  async function loadRequests(){
    const panel=$('managePanel');panel.innerHTML=title('Academic Requests','Review student applications. Decisions remain with authorized academic staff.')+'<div id="manageRows" class="state">Loading…</div>';
    try{const data=await request('/api/academics/student/requests?limit=100');const rows=(data.items||[]).filter(r=>!['Approved','Rejected'].includes(r.status));panel.querySelector('#manageRows').innerHTML=rows.length?rows.map(r=>`<article class="data-card"><div class="panel-heading"><div><h3>${esc(r.request_type)} · ${esc(r.student_name)}</h3><small>${esc(r.subject_code||'No subject')} · ${esc(r.created_at)}</small></div>${badge(r.status)}</div><p>${esc(r.details)}</p>${r.document_original_name?`<button class="subject-tab" type="button" data-download-document="${Number(r.id)}">Download supporting document</button>`:''}<div class="subject-tabs"><button class="subject-tab" data-review-request="${Number(r.id)}" data-status="Under Review">Mark in review</button><button class="subject-tab" data-review-request="${Number(r.id)}" data-status="Approved">Approve</button><button class="subject-tab" data-review-request="${Number(r.id)}" data-status="Rejected">Reject</button></div></article>`).join(''):empty('There are no open academic requests.');}
    catch(e){panel.querySelector('#manageRows').innerHTML=errorState(e);}
  }

  async function loadSyllabus(){
    const panel=$('managePanel');
    panel.innerHTML=title('Syllabus Management','Create and maintain subject units and learning outcomes.')+`<form id="syllabusForm" class="form-stack data-card"><input type="hidden" name="id"><label>Subject<select class="field-control" name="subject_id" required><option value="">Select subject</option>${subjects.map(s=>`<option value="${Number(s.id)}">${esc(s.code)} — ${esc(s.name)}</option>`).join('')}</select></label><label>Unit number<input class="field-control" name="unit_number" type="number" min="1" required></label><label>Unit title<input class="field-control" name="title" maxlength="180" required></label><label>Topics<textarea class="field-control" name="topics" maxlength="4000"></textarea></label><label>Learning outcomes<textarea class="field-control" name="learning_outcomes" maxlength="4000"></textarea></label><div><button class="primary-action" type="submit">Save unit</button> <button class="subject-tab" type="reset">Clear</button></div></form><div id="syllabusRows" class="state">Loading syllabus…</div>`;
    await refreshSyllabus();
  }
  async function refreshSyllabus(){
    try{const data=await request('/api/academics/student/syllabus/manage?limit=100');$('syllabusRows').innerHTML=data.items.length?data.items.map(s=>`<article class="data-card list-row"><div class="class-copy"><strong>${esc(s.subject_code)} · Unit ${esc(s.unit_number)}: ${esc(s.title)}</strong><small>${esc(s.topics||'No topics')} · ${esc(s.learning_outcomes||'No outcomes')}</small></div><button class="subject-tab" data-edit-syllabus="${Number(s.id)}">Edit</button><button class="subject-tab" data-delete-syllabus="${Number(s.id)}">Delete</button></article>`).join(''):empty('No syllabus units have been created.');}
    catch(e){$('syllabusRows').innerHTML=errorState(e);}
  }

  async function loadCalendar(){
    const canManage=profile.role==='super_admin';const panel=$('managePanel');
    panel.innerHTML=title('Academic Calendar',canManage?'Create and publish academic dates.':'Published academic events for your department.')+(canManage?`<form id="calendarForm" class="form-stack data-card"><input type="hidden" name="id"><label>Title<input class="field-control" name="title" maxlength="180" required></label><label>Type<select class="field-control" name="event_type"><option>Academic Event</option><option>Holiday</option><option>Examination</option><option>Registration Deadline</option></select></label><label>Start date<input class="field-control" name="starts_on" type="date" required></label><label>End date<input class="field-control" name="ends_on" type="date" required></label><label>Description<textarea class="field-control" name="description" maxlength="4000"></textarea></label><label><span><input name="is_published" type="checkbox"> Publish to students</span></label><div><button class="primary-action" type="submit">Save event</button> <button class="subject-tab" type="reset">Clear</button></div></form>`:'')+`<div id="calendarRows" class="state">Loading events…</div>`;
    await refreshCalendar();
  }
  async function refreshCalendar(){
    try{const data=await request('/api/academics/student/calendar/manage?limit=100');$('calendarRows').innerHTML=data.items.length?data.items.map(e=>`<article class="data-card list-row"><div class="class-copy"><strong>${esc(e.title)} · ${esc(e.event_type)}</strong><small>${esc(e.starts_on)} – ${esc(e.ends_on)} · ${e.is_published?'Published':'Draft'}</small></div>${profile.role==='super_admin'?`<button class="subject-tab" data-edit-calendar="${Number(e.id)}">Edit</button><button class="subject-tab" data-delete-calendar="${Number(e.id)}">Delete</button>`:''}</article>`).join(''):empty('No academic events have been entered.');}
    catch(e){$('calendarRows').innerHTML=errorState(e);}
  }

  async function showPanel(name){active=name;document.querySelectorAll('[data-panel]').forEach(button=>button.classList.toggle('active',button.dataset.panel===name));if(name==='registrations')return loadRegistrations();if(name==='requests')return loadRequests();if(name==='syllabus')return loadSyllabus();if(name==='calendar')return loadCalendar();}
  $('manageTabs').addEventListener('click',event=>{const button=event.target.closest('[data-panel]');if(button)showPanel(button.dataset.panel);});
  $('managePanel').addEventListener('click',async event=>{
    const r=event.target.closest('[data-review-registration]'),q=event.target.closest('[data-review-request]'),documentButton=event.target.closest('[data-download-document]'),editS=event.target.closest('[data-edit-syllabus]'),deleteS=event.target.closest('[data-delete-syllabus]'),editC=event.target.closest('[data-edit-calendar]'),deleteC=event.target.closest('[data-delete-calendar]');
    try{
      if(documentButton) await downloadDocument(documentButton.dataset.downloadDocument);
      if(r){await request(`/api/academics/student/registrations/${Number(r.dataset.reviewRegistration)}`,{method:'PATCH',body:{status:r.dataset.status}});setStatus(`Registration ${r.dataset.status.toLowerCase()}.`);await loadRegistrations();}
      if(q){await request(`/api/academics/student/requests/${Number(q.dataset.reviewRequest)}`,{method:'PATCH',body:{status:q.dataset.status}});setStatus('Request status updated.');await loadRequests();}
      if(editS){const data=await request('/api/academics/student/syllabus/manage?limit=100');const row=data.items.find(x=>Number(x.id)===Number(editS.dataset.editSyllabus));if(row){const form=$('syllabusForm');for(const key of ['id','subject_id','unit_number','title','topics','learning_outcomes'])form.elements[key].value=row[key]??'';form.scrollIntoView({behavior:'smooth'});}}
      if(deleteS){await request(`/api/academics/student/syllabus/${Number(deleteS.dataset.deleteSyllabus)}`,{method:'DELETE'});setStatus('Syllabus unit deleted.');await refreshSyllabus();}
      if(editC){const data=await request('/api/academics/student/calendar/manage?limit=100');const row=data.items.find(x=>Number(x.id)===Number(editC.dataset.editCalendar));if(row){const form=$('calendarForm');for(const key of ['id','title','event_type','starts_on','ends_on','description'])form.elements[key].value=row[key]??'';form.elements.is_published.checked=Boolean(Number(row.is_published));form.scrollIntoView({behavior:'smooth'});}}
      if(deleteC){await request(`/api/academics/student/calendar/${Number(deleteC.dataset.deleteCalendar)}`,{method:'DELETE'});setStatus('Calendar event deleted.');await refreshCalendar();}
    }catch(error){setStatus(error.message,true);}
  });
  $('managePanel').addEventListener('submit',async event=>{
    const form=event.target;
    if(form.id==='syllabusForm'){
      event.preventDefault();const body=Object.fromEntries(new FormData(form));const id=body.id;delete body.id;body.subject_id=Number(body.subject_id);body.unit_number=Number(body.unit_number);
      try{await request(`/api/academics/student/syllabus${id?`/${Number(id)}`:''}`,{method:id?'PATCH':'POST',body});setStatus('Syllabus saved.');form.reset();form.elements.id.value='';await refreshSyllabus();}catch(error){setStatus(error.message,true);}
    }
    if(form.id==='calendarForm'){
      event.preventDefault();const data=new FormData(form);const body=Object.fromEntries(data);const id=body.id;delete body.id;body.is_published=data.has('is_published');
      try{await request(`/api/academics/student/calendar${id?`/${Number(id)}`:''}`,{method:id?'PATCH':'POST',body});setStatus('Calendar event saved.');form.reset();form.elements.id.value='';await refreshCalendar();}catch(error){setStatus(error.message,true);}
    }
  });
  async function init(){
    try{profile=await request('/api/auth/me');if(!['hod','super_admin'].includes(profile.role)){location.replace('dashboard.html');return;}const data=await request('/api/academics/subjects?limit=100');subjects=data.items||[];if(profile.role!=='super_admin'){document.querySelector('[data-panel="calendar"]').textContent='Calendar';document.querySelector('[data-panel="calendar"]').classList.add('subject-tab');}await showPanel(new URLSearchParams(location.search).get('panel')||'registrations');}
    catch(error){$('managePanel').innerHTML=errorState(error);}
  }
  init();
})();

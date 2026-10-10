// Patch helper: rewrites the public/messages.html script with filter-aware lists,
// Socket.IO realtime delivery and accessible status messaging. Run: node scripts/patchMessagesUi.js
const fs = require('fs');

const FILE = 'public/messages.html';
const START = 'async function load(){try{const [c,g]=await Promise.all';

const HEADER = [
    "const token=sessionStorage.getItem('token')||localStorage.getItem('token');if(!token)location.href='login.html';",
    "const auth={Authorization:'Bearer '+token};const $=id=>document.getElementById(id);",
    "let profile=null,conversationId=null,activeTab='all',conversationsCache=[],groupsCache=[];",
    "async function call(url,opt={}){const r=await fetch(API_BASE+url,{...opt,headers:{...auth,...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||'Request failed');return d}",
    "function escapeHtml(v){return String(v).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',\"'\":'&#39;','\"':'&quot;'}[c]))}",
    "function status(message,isError){const el=$('pageStatus');el.textContent=message;el.hidden=false;el.className='state'+(isError?' error':'');if(!isError){clearTimeout(el._t);el._t=setTimeout(()=>{el.hidden=true},4000)}}",
    "function conversationItem(c,group=false){if(group)return '<div class=\"conversation-item\"><strong>'+escapeHtml(c.name)+'</strong><small>'+escapeHtml(c.group_type)+' - '+c.member_count+' members</small>'+(c.member?'<button class=\"text-button\" data-open=\"'+c.conversation_id+'\">Open chat</button>':'<button class=\"text-button\" data-join=\"'+c.id+'\">Join group</button>')+'</div>';return '<button class=\"conversation-item\" data-open=\"'+c.id+'\"><strong>'+escapeHtml(c.group_name||'Direct conversation')+'</strong><small>'+escapeHtml(c.last_message||'No messages yet')+'</small>'+(c.unread_count?'<b>'+c.unread_count+'</b>':'')+'</button>'}",
    "function isStaff(){return ['super_admin','hod','organizer'].includes(profile&&profile.role)}",
    "function conversationsForTab(){if(activeTab==='direct')return conversationsCache.filter(c=>c.conversation_type==='direct');if(activeTab==='official')return conversationsCache.filter(c=>c.group_type==='official');if(activeTab==='academic')return conversationsCache.filter(c=>['group','official'].includes(c.conversation_type));return conversationsCache}",
    'function visibleGroups(){if(activeTab===\'direct\')return [];return groupsCache.filter(g=>g.member||isStaff())}',
    'function applySearch(list,fields){const q=$(\'search\').value.trim().toLowerCase();if(!q)return list;return list.filter(item=>fields.some(f=>String(item[f]||\'\').toLowerCase().includes(q)))}',
    ''
].join('\n');

const BODY = [
    "async function loadConversations(){try{const d=await call('/api/messages/conversations');conversationsCache=d.items;renderConversations()}catch(e){$('conversations').innerHTML='<div class=\"state error\">'+escapeHtml(e.message)+'</div>'}}",
    "async function loadGroups(){try{const d=await call('/api/messages/groups');groupsCache=d.items;renderGroups()}catch(e){$('groups').innerHTML='<div class=\"state error\">'+escapeHtml(e.message)+'</div>'}}",
    "function renderConversations(){const items=applySearch(conversationsForTab(),['group_name','last_message']);$('conversations').innerHTML=items.length?items.map(x=>conversationItem(x)).join(''):'<div class=\"state\">No conversations in this view yet.</div>';document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openConversation(b.dataset.open,b.closest('.conversation-item').querySelector('strong').textContent))}",
    "function renderGroups(){const items=applySearch(visibleGroups(),['name','group_type']);$('groups').innerHTML=items.length?items.map(x=>conversationItem(x,true)).join(''):'<div class=\"state\">No eligible academic groups yet.</div>';document.querySelectorAll('[data-join]').forEach(b=>b.onclick=async()=>{try{status('Joining group...');await call('/api/messages/groups/'+b.dataset.join+'/join',{method:'POST'});await Promise.all([loadConversations(),loadGroups()]);status('Group joined.')}catch(e){status(e.message,true)}})}",
    'async function load(){await Promise.all([loadConversations(),loadGroups()])}',
    "async function openConversation(id,name){conversationId=id;$('chatHeader').textContent=name;$('messageForm').hidden=false;try{const d=await call('/api/messages/conversations/'+id+'/messages');$('messages').innerHTML=d.items.length?d.items.map(m=>'<div class=\"message-bubble\"><strong>'+escapeHtml(m.sender_name)+'</strong><p>'+escapeHtml(m.body)+'</p><small>'+new Date(m.created_at).toLocaleString()+(m.is_pinned?' - Pinned':'')+'</small></div>').join(''):'<div class=\"state\">No messages yet.</div>';$('messages').scrollTop=$('messages').scrollHeight;if(d.items.length){await call('/api/messages/conversations/'+id+'/read',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({message_id:d.items[d.items.length-1].id})});await loadConversations()}}catch(e){$('messages').innerHTML='<div class=\"state error\">'+escapeHtml(e.message)+'</div>'}}",
    "$('messageForm').onsubmit=async e=>{e.preventDefault();if(!conversationId)return;const f=new FormData();f.append('body',$('messageBody').value);if($('attachment').files[0])f.append('attachment',$('attachment').files[0]);try{await call('/api/messages/conversations/'+conversationId+'/messages',{method:'POST',body:f});$('messageForm').reset();await openConversation(conversationId,$('chatHeader').textContent);await loadConversations()}catch(err){status(err.message,true)}};",
    "$('newMessage').onclick=()=>{$('peerForm').hidden=!$('peerForm').hidden;if(!$('peerForm').hidden)$('peerId').focus()};",
    "$('cancelPeer').onclick=()=>{$('peerForm').hidden=true};",
    "$('peerForm').onsubmit=async e=>{e.preventDefault();try{const c=await call('/api/messages/direct',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({target_id:$('peerId').value})});$('peerForm').hidden=true;$('peerForm').reset();await loadConversations();await openConversation(c.id,'Direct conversation')}catch(err){status(err.message,true)}};",
    "$('refresh').onclick=()=>load();",
    "$('search').oninput=()=>{renderConversations();renderGroups()};",
    "document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>{const on=x===b;x.classList.toggle('active',on);x.setAttribute('aria-selected',on?'true':'false')});renderConversations();renderGroups()});",
    "function connectRealtime(){if(typeof io!=='function'){$('realtime').textContent='Realtime unavailable';return}const socket=io(API_BASE,{auth:{token},transports:['websocket','polling']});$('realtime').textContent='Connecting...';socket.on('connect',()=>{$('realtime').textContent='Live';$('realtime').classList.add('connected')});socket.on('connect_error',()=>{$('realtime').textContent='Offline - showing saved history';$('realtime').classList.remove('connected')});socket.on('disconnect',()=>{$('realtime').textContent='Offline - reconnecting...';$('realtime').classList.remove('connected')});socket.on('message:new',()=>{if(conversationId)openConversation(conversationId,$('chatHeader').textContent);loadConversations()});window.addEventListener('beforeunload',()=>socket.disconnect())}",
    "async function boot(){try{profile=await call('/api/auth/me')}catch(e){status(e.message,true)}await load();connectRealtime()}",
    "document.querySelectorAll('[data-bottom]').forEach(b=>b.onclick=()=>location.href=b.dataset.bottom==='home'?'dashboard.html':b.dataset.bottom==='messages'?'messages.html':b.dataset.bottom==='attendance'?'attendance.html':'profile.html');",
    'boot();',
    ''
].join('\n');

const source = fs.readFileSync(FILE, 'utf8');
const start = source.indexOf(START);
if (start < 0) throw new Error('load() marker not found');
const scriptOpen = source.lastIndexOf('<script>', start);
const scriptClose = source.indexOf('</script>', start);
if (scriptOpen < 0 || scriptClose < 0) throw new Error('script boundaries not found');
fs.writeFileSync(FILE, source.slice(0, scriptOpen) + '<script src="/socket.io/socket.io.js"></script>\n<script>' + HEADER + BODY + source.slice(scriptClose));
console.log('messages script rewritten');


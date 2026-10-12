const db = require('../config/db');
const audit = require('./auditService');
const files = require('../utils/learningFileStore');
const community = require('./communityService');
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; error.publicMessage = message; throw error; };
const id = (value, field) => { const n = Number(value); if (!Number.isInteger(n) || n < 1) fail(`${field} must be a positive integer`); return n; };
const page = q => ({ limit: Math.min(Math.max(Number(q.limit) || 50, 1), 100), offset: Math.max(Number(q.offset) || 0, 0) });
const text = value => { if (typeof value !== 'string' || !value.trim() || value.trim().length > 4000) fail('Message text is required and must be at most 4000 characters'); return value.trim(); };
const staff = user => ['super_admin','hod','organizer'].includes(user.role);
async function member(conversationId, userId) { const [rows] = await db.query('SELECT c.*,m.last_read_message_id FROM erp_message_conversation_members m JOIN erp_message_conversations c ON c.id=m.conversation_id WHERE c.id=? AND m.user_id=?', [conversationId,userId]); return rows[0]; }
async function listGroups(user, query={}) { const {limit,offset}=page(query); const [items]=await db.query(`SELECT g.id,g.name,g.group_type,g.department_id,g.batch_id,g.section_id,g.created_at,
    (SELECT c.id FROM erp_message_conversations c WHERE c.group_id=g.id LIMIT 1) conversation_id,
    (SELECT COUNT(*) FROM erp_message_group_members gm WHERE gm.group_id=g.id) member_count,
    EXISTS(SELECT 1 FROM erp_message_group_members gm WHERE gm.group_id=g.id AND gm.user_id=?) is_member
    FROM erp_message_groups g WHERE g.is_active=1 AND (EXISTS(SELECT 1 FROM erp_message_group_members gm WHERE gm.group_id=g.id AND gm.user_id=?) OR g.group_type='official' OR (g.group_type='academic' AND EXISTS(SELECT 1 FROM student_profiles sp WHERE sp.user_id=? AND ((g.section_id IS NOT NULL AND sp.section_id=g.section_id) OR (g.batch_id IS NOT NULL AND sp.batch_id=g.batch_id) OR (g.department_id IS NOT NULL AND EXISTS(SELECT 1 FROM batches b JOIN courses c ON c.id=b.course_id WHERE b.id=sp.batch_id AND c.department_id=g.department_id)))))) ORDER BY g.group_type='academic' DESC,g.created_at DESC LIMIT ? OFFSET ?`, [user.id,user.id,user.id,limit,offset]); return {items,pagination:{limit,offset,total:items.length}}; }
async function createGroup(data,user) { const type=['academic','community','official'].includes(data.group_type)?data.group_type:'community'; if(type==='official'&&!staff(user))fail('Only authorized staff may create official groups',403); if(!data.name||String(data.name).length>180)fail('Group name is required'); const sectionId=data.section_id?id(data.section_id,'section_id'):null; const batchId=data.batch_id?id(data.batch_id,'batch_id'):null; const departmentId=data.department_id?id(data.department_id,'department_id'):null; if(user.role==='hod'&&departmentId&&Number(departmentId)!==Number(user.department_id))fail('Department ownership violation',403); const conn=await db.getConnection();try{await conn.beginTransaction();const [r]=await conn.query('INSERT INTO erp_message_groups(name,group_type,department_id,batch_id,section_id,created_by) VALUES(?,?,?,?,?,?)',[String(data.name).trim(),type,departmentId,batchId,sectionId,user.id]);await conn.query('INSERT INTO erp_message_group_members(group_id,user_id,member_role) VALUES(?,?,?)',[r.insertId,user.id,'owner']);const [conversation]=await conn.query('INSERT INTO erp_message_conversations(conversation_type,group_id,created_by) VALUES(?,?,?)',[type==='official'?'official':'group',r.insertId,user.id]);await conn.query('INSERT INTO erp_message_conversation_members(conversation_id,user_id) VALUES(?,?)',[conversation.insertId,user.id]);if(Array.isArray(data.member_ids)){for(const raw of data.member_ids){const memberId=id(raw,'member_id');await conn.query('INSERT IGNORE INTO erp_message_group_members(group_id,user_id) VALUES(?,?)',[r.insertId,memberId]);await conn.query('INSERT IGNORE INTO erp_message_conversation_members(conversation_id,user_id) VALUES(?,?)',[conversation.insertId,memberId]);}}await conn.commit();await audit.log(user.id,'CREATE_MESSAGE_GROUP','erp_message_groups',r.insertId);return{id:r.insertId,conversation_id:conversation.insertId,name:String(data.name).trim(),group_type:type};}catch(e){await conn.rollback();throw e}finally{conn.release();}}
async function joinGroup(groupId,user){const group=id(groupId,'group_id');const [rows]=await db.query('SELECT * FROM erp_message_groups WHERE id=? AND is_active=1',[group]);if(!rows[0])fail('Group not found',404);const g=rows[0];let eligible=staff(user);if(!eligible&&g.section_id){const [r]=await db.query('SELECT 1 FROM student_profiles WHERE user_id=? AND section_id=?',[user.id,g.section_id]);eligible=Boolean(r.length);}if(!eligible&&!g.section_id&&g.batch_id){const [r]=await db.query('SELECT 1 FROM student_profiles WHERE user_id=? AND batch_id=?',[user.id,g.batch_id]);eligible=Boolean(r.length);}if(!eligible&&!g.section_id&&!g.batch_id&&g.department_id)eligible=Number(user.department_id)===Number(g.department_id);if(!eligible)fail('You are not eligible for this academic group',403);const [conversation]=await db.query('SELECT id FROM erp_message_conversations WHERE group_id=? LIMIT 1',[group]);if(!conversation[0])fail('Group conversation is not configured',409);await db.query('INSERT IGNORE INTO erp_message_group_members(group_id,user_id) VALUES(?,?)',[group,user.id]);await db.query('INSERT IGNORE INTO erp_message_conversation_members(conversation_id,user_id) VALUES(?,?)',[conversation[0].id,user.id]);return{group_id:group,conversation_id:conversation[0].id};}
async function createDirect(targetId,user){const target=id(targetId,'target_id');if(target===Number(user.id))fail('You cannot message yourself');const [targetRows]=await db.query('SELECT id,allow_direct_messages FROM users u LEFT JOIN erp_profile_details p ON p.user_id=u.id WHERE u.id=? AND u.is_active=1 AND (u.deleted=0 OR u.deleted IS NULL)',[target]);if(!targetRows[0])fail('User not found',404);if(targetRows[0].allow_direct_messages===0)fail('Direct messages are disabled for this user',403);if(!await community.academicPeer(user.id,target))fail('Direct messages are limited to approved academic relationships',403);const [blocked]=await db.query('SELECT 1 FROM erp_social_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)',[user.id,target,target,user.id]);if(blocked.length)fail('Messaging is unavailable for this relationship',403);const [existing]=await db.query(`SELECT c.id FROM erp_message_conversations c JOIN erp_message_conversation_members a ON a.conversation_id=c.id AND a.user_id=? JOIN erp_message_conversation_members b ON b.conversation_id=c.id AND b.user_id=? WHERE c.conversation_type='direct' LIMIT 1`,[user.id,target]);if(existing[0])return {id:existing[0].id};const conn=await db.getConnection();try{await conn.beginTransaction();const [r]=await conn.query("INSERT INTO erp_message_conversations(conversation_type,created_by) VALUES('direct',?)",[user.id]);await conn.query('INSERT INTO erp_message_conversation_members(conversation_id,user_id) VALUES(?,?),(?,?)',[r.insertId,user.id,r.insertId,target]);await conn.commit();return{id:r.insertId};}catch(e){await conn.rollback();throw e}finally{conn.release();}}
const likeTerm = value => `%${String(value).trim().slice(0, 100).replace(/[\\%_]/g, char => `\\${char}`)}%`;
const INBOX_SELECT = `SELECT c.id,c.conversation_type,c.group_id,c.created_at,g.name group_name,g.group_type,cm.is_muted,cm.is_pinned,cm.is_archived,
    (SELECT COUNT(*) FROM erp_message_conversation_members om WHERE om.conversation_id=c.id) member_count,
    peer.id peer_id,peer.name peer_name,peer.role peer_role,
    (SELECT m.body FROM erp_messages m WHERE m.conversation_id=c.id AND m.is_deleted=0 ORDER BY m.id DESC LIMIT 1) last_message,
    (SELECT m.created_at FROM erp_messages m WHERE m.conversation_id=c.id AND m.is_deleted=0 ORDER BY m.id DESC LIMIT 1) last_message_at,
    (SELECT COUNT(*) FROM erp_messages m WHERE m.conversation_id=c.id AND m.is_deleted=0 AND m.id>COALESCE(cm.last_read_message_id,0) AND m.sender_id<>?) unread_count
    FROM erp_message_conversation_members cm
    JOIN erp_message_conversations c ON c.id=cm.conversation_id
    LEFT JOIN erp_message_groups g ON g.id=c.group_id
    LEFT JOIN users peer ON peer.id=(SELECT om.user_id FROM erp_message_conversation_members om WHERE om.conversation_id=c.id AND om.user_id<>? AND c.conversation_type='direct' LIMIT 1)
    WHERE cm.user_id=?`;
const INBOX_TABS = { chats: "t.conversation_type='direct'", groups: "t.group_type IN ('academic','official')", clubs: "t.group_type='community'" };
const INBOX_FILTERS = { unread: 't.unread_count>0', faculty: "t.peer_role IN ('organizer','hod')", students: "t.peer_role='student'", groups: "t.conversation_type<>'direct'" };
const PREFERENCE_FIELDS = ['is_muted', 'is_pinned', 'is_archived'];

async function conversations(user,query={}){
    const {limit,offset}=page(query);
    const where=['t.is_archived=?'];
    const params=[query.archived==='1'?1:0];
    if(INBOX_TABS[query.tab])where.push(INBOX_TABS[query.tab]);
    if(INBOX_FILTERS[query.filter])where.push(INBOX_FILTERS[query.filter]);
    if(query.q&&String(query.q).trim()){where.push('(t.group_name LIKE ? OR t.peer_name LIKE ? OR t.last_message LIKE ?)');const term=likeTerm(query.q);params.push(term,term,term);}
    const order=query.sort==='unread'?'t.is_pinned DESC,t.unread_count DESC,':'t.is_pinned DESC,';
    const [items]=await db.query(`SELECT * FROM (${INBOX_SELECT}) t WHERE ${where.join(' AND ')} ORDER BY ${order}COALESCE(t.last_message_at,t.created_at) DESC LIMIT ? OFFSET ?`,[user.id,user.id,user.id,...params,limit,offset]);
    return{items,pagination:{limit,offset,total:items.length}};
}

async function conversation(conversationId,user){
    const conversationKey=id(conversationId,'conversation_id');
    const [rows]=await db.query(`SELECT * FROM (${INBOX_SELECT}) t WHERE t.id=?`,[user.id,user.id,user.id,conversationKey]);
    if(!rows[0])fail('Conversation access denied',403);
    return rows[0];
}

async function participants(conversationId,user){
    const conversationKey=id(conversationId,'conversation_id');
    if(!await member(conversationKey,user.id))fail('Conversation access denied',403);
    const [items]=await db.query(`SELECT u.id,u.name,u.role,d.name department_name,COALESCE(gm.member_role,'member') member_role
        FROM erp_message_conversation_members cm
        JOIN users u ON u.id=cm.user_id
        JOIN erp_message_conversations c ON c.id=cm.conversation_id
        LEFT JOIN departments d ON d.id=u.department_id
        LEFT JOIN erp_message_group_members gm ON gm.group_id=c.group_id AND gm.user_id=u.id
        WHERE cm.conversation_id=? ORDER BY u.name LIMIT 200`,[conversationKey]);
    return{items};
}

async function updatePreferences(conversationId,body,user){
    const conversationKey=id(conversationId,'conversation_id');
    const fields=PREFERENCE_FIELDS.filter(field=>body[field]!==undefined);
    if(!fields.length)fail('At least one conversation preference is required');
    if(fields.some(field=>typeof body[field]!=='boolean'))fail('Conversation preferences must be true or false');
    if(!await member(conversationKey,user.id))fail('Conversation access denied',403);
    await db.query(`UPDATE erp_message_conversation_members SET ${fields.map(field=>`${field}=?`).join(',')} WHERE conversation_id=? AND user_id=?`,[...fields.map(field=>(body[field]?1:0)),conversationKey,user.id]);
    return conversation(conversationKey,user);
}

async function searchMessages(query,user){
    const term=String(query.q||'').trim();
    if(term.length<2)fail('Search needs at least 2 characters');
    const [items]=await db.query(`SELECT m.id,m.conversation_id,m.body,m.created_at,u.name sender_name,c.conversation_type,g.name group_name
        FROM erp_messages m
        JOIN erp_message_conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.user_id=?
        JOIN erp_message_conversations c ON c.id=m.conversation_id
        JOIN users u ON u.id=m.sender_id
        LEFT JOIN erp_message_groups g ON g.id=c.group_id
        WHERE m.is_deleted=0 AND m.body LIKE ? ORDER BY m.id DESC LIMIT 30`,[user.id,likeTerm(term)]);
    return{items};
}

async function unreadCount(user){
    const [rows]=await db.query(`SELECT COUNT(*) total FROM erp_messages m
        JOIN erp_message_conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.user_id=?
        WHERE m.is_deleted=0 AND m.sender_id<>? AND m.id>COALESCE(cm.last_read_message_id,0) AND cm.is_archived=0`,[user.id,user.id]);
    return{unread_count:Number(rows[0].total)};
}

async function recipients(query,user){
    const term=String(query.q||'').trim();
    if(term.length<2)return{items:[]};
    return community.people(user,{search:term});
}
async function messages(conversationId,user,query={}){const conversation=id(conversationId,'conversation_id');if(!await member(conversation,user.id))fail('Conversation access denied',403);const {limit,offset}=page(query);const [items]=await db.query(`SELECT m.id,m.conversation_id,m.sender_id,u.name sender_name,u.role sender_role,m.body,m.attachment_original_name,m.attachment_mime_type,m.reply_to_id,m.is_pinned,m.created_at,
    (SELECT reaction FROM erp_message_reactions r WHERE r.message_id=m.id AND r.user_id=?) my_reaction
    FROM erp_messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=? AND m.is_deleted=0 ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,[user.id,conversation,limit,offset]);return{items:items.reverse(),pagination:{limit,offset,total:items.length}};}
async function send(conversationId,data,user,file,io){
    const conversation=id(conversationId,'conversation_id');
    const membership=await member(conversation,user.id);
    if(!membership)fail('Conversation access denied',403);
    if(membership.conversation_type==='official'&&!staff(user))fail('Only authorized staff may post in official channels',403);
    const body=text(data.body||file?.originalname||'');
    const replyToId=data.reply_to_id?id(data.reply_to_id,'reply_to_id'):null;
    if(replyToId){const [parent]=await db.query('SELECT 1 FROM erp_messages WHERE id=? AND conversation_id=? AND is_deleted=0',[replyToId,conversation]);if(!parent.length)fail('Reply target was not found in this conversation',400);}
    let key=null;
    try{
        if(file){files.validateUpload(file,'pdf,png,jpg,jpeg,txt',10*1024*1024);key=await files.save(file);}
        const [r]=await db.query('INSERT INTO erp_messages(conversation_id,sender_id,body,attachment_storage_key,attachment_original_name,attachment_mime_type,reply_to_id) VALUES(?,?,?,?,?,?,?)',[conversation,user.id,body,key,file?.originalname||null,file?.mimetype||null,replyToId]);
        await db.query('UPDATE erp_message_conversation_members SET last_read_message_id=? WHERE conversation_id=? AND user_id=?',[r.insertId,conversation,user.id]);
        await audit.log(user.id,'SEND_MESSAGE','erp_messages',r.insertId);
        if(io){
            io.to(`conversation:${conversation}`).emit('message:new',{id:r.insertId,conversation_id:conversation,sender_id:user.id,body,created_at:new Date().toISOString()});
            const [members]=await db.query('SELECT user_id FROM erp_message_conversation_members WHERE conversation_id=?',[conversation]);
            for(const row of members)io.to(`user:${row.user_id}`).emit('conversation:updated',{conversation_id:conversation});
        }
        return{id:r.insertId};
    }catch(e){if(key)await files.remove(key);throw e;}
}
async function read(conversationId,messageId,user){if(!await member(id(conversationId,'conversation_id'),user.id))fail('Conversation access denied',403);await db.query('UPDATE erp_message_conversation_members SET last_read_message_id=? WHERE conversation_id=? AND user_id=?',[id(messageId,'message_id'),id(conversationId,'conversation_id'),user.id]);return{read:true};}
async function react(messageId,reaction,user){const m=id(messageId,'message_id');if(!reaction||String(reaction).length>32)fail('Invalid reaction');const [exists]=await db.query('SELECT 1 FROM erp_messages m JOIN erp_message_conversation_members cm ON cm.conversation_id=m.conversation_id WHERE m.id=? AND cm.user_id=?',[m,user.id]);if(!exists.length)fail('Message access denied',403);await db.query('INSERT INTO erp_message_reactions(message_id,user_id,reaction) VALUES(?,?,?) ON DUPLICATE KEY UPDATE reaction=VALUES(reaction)',[m,user.id,String(reaction)]);return{reaction:String(reaction)};}
async function pin(messageId,user){const m=id(messageId,'message_id');const [rows]=await db.query('SELECT m.conversation_id FROM erp_messages m JOIN erp_message_conversation_members cm ON cm.conversation_id=m.conversation_id WHERE m.id=? AND cm.user_id=?',[m,user.id]);if(!rows[0])fail('Message access denied',403);const [conv]=await db.query('SELECT conversation_type FROM erp_message_conversations WHERE id=?',[rows[0].conversation_id]);if(conv[0].conversation_type==='official'&&!staff(user))fail('Only authorized staff may pin official messages',403);await db.query('UPDATE erp_messages SET is_pinned=NOT is_pinned WHERE id=?',[m]);return{updated:true};}
async function attachment(messageId,user){const m=id(messageId,'message_id');const [rows]=await db.query('SELECT m.* FROM erp_messages m JOIN erp_message_conversation_members cm ON cm.conversation_id=m.conversation_id WHERE m.id=? AND cm.user_id=?',[m,user.id]);if(!rows[0]?.attachment_storage_key)fail('Attachment not found',404);return rows[0];}
module.exports={listGroups,createGroup,joinGroup,createDirect,conversations,conversation,participants,updatePreferences,messages,send,read,react,pin,attachment,searchMessages,unreadCount,recipients};

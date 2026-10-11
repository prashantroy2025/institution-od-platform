const db = require('../config/db');
const audit = require('./auditService');
const files = require('../utils/learningFileStore');
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; error.publicMessage = message; throw error; };
const id = (value, field) => { const n = Number(value); if (!Number.isInteger(n) || n < 1) fail(`${field} must be a positive integer`); return n; };
const page = q => ({ limit: Math.min(Math.max(Number(q.limit) || 20, 1), 50), offset: Math.max(Number(q.offset) || 0, 0) });
const body = value => { if (typeof value !== 'string' || !value.trim() || value.trim().length > 4000) fail('Post/message text is required and must be at most 4000 characters'); return value.trim(); };
const note = value => { if (value === undefined || value === null || value === '') return null; if (typeof value !== 'string' || value.length > 280) fail('Share note must be at most 280 characters'); return value.trim() || null; };
const searchTerm = value => String(value || '').slice(0, 100).replace(/[%_]/g, '');
const staff = u => ['super_admin', 'hod', 'organizer'].includes(u.role);
// 'for_you' is the recommended default, 'official' and 'events' back the dashboard
// feed tabs, and 'all' is the unfiltered college-wide view.
const FEED_FILTERS = ['for_you', 'college', 'official', 'events', 'following', 'classmates', 'all', 'saved'];
const VISIBILITIES = ['college', 'following', 'classmates'];
const academicPeer = async (a, b) => { const [rows] = await db.query(`SELECT 1 FROM student_profiles a JOIN student_profiles b ON a.batch_id=b.batch_id AND a.section_id=b.section_id WHERE a.user_id=? AND b.user_id=? UNION SELECT 1 FROM users ua JOIN users ub ON ua.department_id=ub.department_id WHERE ua.id=? AND ub.id=? AND ua.role IN ('organizer','hod')`, [a,b,a,b]); return Boolean(rows.length); };
const SELECT_COLUMNS = `p.id,p.author_id,u.name author_name,u.role author_role,p.body,p.media_original_name,p.media_mime_type,p.is_official,p.visibility,p.event_id,p.created_at,
    (SELECT COUNT(*) FROM erp_feed_likes l WHERE l.post_id=p.id) likes,
    (SELECT COUNT(*) FROM erp_feed_comments c WHERE c.post_id=p.id AND c.is_deleted=0) comments,
    (SELECT COUNT(*) FROM erp_feed_shares sh WHERE sh.post_id=p.id) shares,
    EXISTS(SELECT 1 FROM erp_feed_likes l WHERE l.post_id=p.id AND l.user_id=?) liked,
    EXISTS(SELECT 1 FROM erp_feed_saves s WHERE s.post_id=p.id AND s.user_id=?) saved,
    EXISTS(SELECT 1 FROM erp_feed_shares sh WHERE sh.post_id=p.id AND sh.user_id=?) shared`;
async function feed(query, user) {
    const { limit, offset } = page(query);
    const filter = FEED_FILTERS.includes(query.filter) ? query.filter : 'for_you';
    const conditions = ['p.is_deleted=0', 'NOT EXISTS(SELECT 1 FROM erp_social_blocks sb WHERE sb.blocker_id=? AND sb.blocked_id=p.author_id)'];
    const where = [user.id];
    if (filter === 'official') {
        conditions.push('p.is_official=1');
    } else if (filter === 'events') {
        conditions.push('p.event_id IS NOT NULL');
    } else if (filter === 'following') {
        conditions.push('(p.author_id IN (SELECT followed_id FROM erp_feed_follows WHERE follower_id=?) OR p.is_official=1 OR EXISTS(SELECT 1 FROM erp_feed_shares sh WHERE sh.post_id=p.id AND sh.user_id=?))');
        where.push(user.id, user.id);
    } else if (filter === 'classmates') {
        conditions.push('(p.author_id IN (SELECT b.user_id FROM student_profiles a JOIN student_profiles b ON a.batch_id=b.batch_id AND a.section_id=b.section_id WHERE a.user_id=?) OR p.is_official=1)');
        where.push(user.id);
    } else if (filter === 'saved') {
        conditions.push('EXISTS(SELECT 1 FROM erp_feed_saves s WHERE s.post_id=p.id AND s.user_id=?)');
        where.push(user.id);
    }
    if (query.search) { conditions.push('p.body LIKE ?'); where.push(`%${searchTerm(query.search)}%`); }
    const clause = conditions.join(' AND ');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) total FROM erp_feed_posts p JOIN users u ON u.id=p.author_id WHERE ${clause}`, where);
    const [items] = await db.query(`SELECT ${SELECT_COLUMNS} FROM erp_feed_posts p JOIN users u ON u.id=p.author_id WHERE ${clause} ORDER BY p.is_official DESC,p.created_at DESC LIMIT ? OFFSET ?`, [user.id, user.id, user.id, ...where, limit, offset]);
    return { items, filter, pagination: { limit, offset, total: Number(total) } };
}
async function createPost(data, user, file) { const official = data.is_official === true || data.is_official === 1 || data.is_official === '1' || data.is_official === 'true'; if (official && !staff(user)) fail('Only authorized staff may publish official posts',403); const textValue=body(data.body); const eventId = data.event_id === undefined || data.event_id === null || data.event_id === '' ? null : id(data.event_id, 'event_id'); let key=null; try { if(file){files.validateUpload(file,'png,jpg,jpeg,mp4',10*1024*1024);key=await files.save(file);} const [r]=await db.query('INSERT INTO erp_feed_posts(author_id,event_id,body,media_storage_key,media_original_name,media_mime_type,is_official,visibility) VALUES(?,?,?,?,?,?,?,?)',[user.id,eventId,textValue,key,file?.originalname||null,file?.mimetype||null,official?1:0,['college','following','classmates'].includes(data.visibility)?data.visibility:'college']); await audit.log(user.id,'CREATE_FEED_POST','erp_feed_posts',r.insertId); return {id:r.insertId}; } catch(e){if(key)await files.remove(key);throw e;} }
async function toggle(table, postId, user) { const p=id(postId,'post_id'); const [existing]=await db.query(`SELECT 1 FROM ${table} WHERE post_id=? AND user_id=?`,[p,user.id]); if(existing.length) await db.query(`DELETE FROM ${table} WHERE post_id=? AND user_id=?`,[p,user.id]); else await db.query(`INSERT INTO ${table}(post_id,user_id) VALUES(?,?)`,[p,user.id]); return {active:!existing.length}; }
async function comment(postId, data, user) {
    const post = id(postId, 'post_id');
    const [exists] = await db.query('SELECT 1 FROM erp_feed_posts WHERE id=? AND is_deleted=0', [post]);
    if (!exists.length) fail('Post not found', 404);
    const [r] = await db.query('INSERT INTO erp_feed_comments(post_id,author_id,parent_id,body) VALUES(?,?,?,?)', [post, user.id, data?.parent_id ? id(data.parent_id, 'parent_id') : null, body(data?.body)]);
    return { id: r.insertId };
}
async function comments(postId, user) {
    const post = id(postId, 'post_id');
    const [rows] = await db.query(`SELECT c.id,c.body,c.parent_id,c.created_at,u.id author_id,u.name author_name,u.role author_role
        FROM erp_feed_comments c JOIN users u ON u.id=c.author_id
        WHERE c.post_id=? AND c.is_deleted=0 AND NOT EXISTS(SELECT 1 FROM erp_social_blocks b WHERE b.blocker_id=? AND b.blocked_id=c.author_id)
        ORDER BY c.created_at ASC LIMIT 200`, [post, user.id]);
    return { items: rows };
}
async function removeComment(commentId, user) {
    const target = id(commentId, 'comment_id');
    const [rows] = await db.query('SELECT author_id FROM erp_feed_comments WHERE id=? AND is_deleted=0', [target]);
    if (!rows[0]) fail('Comment not found', 404);
    if (Number(rows[0].author_id) !== Number(user.id) && !staff(user)) fail('You may only remove your own comments', 403);
    await db.query('UPDATE erp_feed_comments SET is_deleted=1 WHERE id=?', [target]);
    await audit.log(user.id, 'REMOVE_FEED_COMMENT', 'erp_feed_comments', target);
    return { removed: true };
}
async function share(postId, data, user) {
    const post = id(postId, 'post_id');
    const [rows] = await db.query('SELECT author_id FROM erp_feed_posts WHERE id=? AND is_deleted=0', [post]);
    if (!rows[0]) fail('Post not found', 404);
    if (Number(rows[0].author_id) === Number(user.id)) fail('You cannot share your own post');
    const [blocked] = await db.query('SELECT 1 FROM erp_social_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)', [user.id, rows[0].author_id, rows[0].author_id, user.id]);
    if (blocked.length) fail('Sharing is unavailable for this account', 403);
    await db.query('INSERT INTO erp_feed_shares(post_id,user_id,note) VALUES(?,?,?) ON DUPLICATE KEY UPDATE note=VALUES(note)', [post, user.id, note(data?.note)]);
    await audit.log(user.id, 'SHARE_FEED_POST', 'erp_feed_shares', post);
    const [[{ shares }]] = await db.query('SELECT COUNT(*) shares FROM erp_feed_shares WHERE post_id=?', [post]);
    return { shared: true, shares: Number(shares) };
}
async function unshare(postId, user) {
    const post = id(postId, 'post_id');
    await db.query('DELETE FROM erp_feed_shares WHERE post_id=? AND user_id=?', [post, user.id]);
    const [[{ shares }]] = await db.query('SELECT COUNT(*) shares FROM erp_feed_shares WHERE post_id=?', [post]);
    return { shared: false, shares: Number(shares) };
}
async function removePost(postId, user) {
    const post = id(postId, 'post_id');
    const [rows] = await db.query('SELECT author_id FROM erp_feed_posts WHERE id=? AND is_deleted=0', [post]);
    if (!rows[0]) fail('Post not found', 404);
    if (Number(rows[0].author_id) !== Number(user.id) && !staff(user)) fail('You may only remove your own posts', 403);
    await db.query('UPDATE erp_feed_posts SET is_deleted=1 WHERE id=?', [post]);
    await audit.log(user.id, 'REMOVE_FEED_POST', 'erp_feed_posts', post);
    return { removed: true };
}
async function follow(targetId,user){const target=id(targetId,'user_id');if(target===Number(user.id))fail('You cannot follow yourself');const [blocked]=await db.query('SELECT 1 FROM erp_social_blocks WHERE blocker_id=? AND blocked_id=? UNION SELECT 1 FROM erp_social_blocks WHERE blocker_id=? AND blocked_id=?',[user.id,target,target,user.id]);if(blocked.length)fail('Follow is unavailable for this account',403);await db.query('INSERT IGNORE INTO erp_feed_follows(follower_id,followed_id) VALUES(?,?)',[user.id,target]);return {following:true};}
async function unfollow(targetId,user){await db.query('DELETE FROM erp_feed_follows WHERE follower_id=? AND followed_id=?',[user.id,id(targetId,'user_id')]);return {following:false};}
async function report(data,user){const types=['post','comment','message','user'];if(!types.includes(data.target_type)||!data.reason)fail('Valid report target and reason are required');const [r]=await db.query('INSERT INTO erp_social_reports(reporter_id,target_type,target_id,reason) VALUES(?,?,?,?)',[user.id,data.target_type,id(data.target_id,'target_id'),String(data.reason).slice(0,500)]);await audit.log(user.id,'REPORT_SOCIAL_CONTENT','erp_social_reports',r.insertId);return {id:r.insertId,status:'Open'};}
async function comments(postId,user){const p=id(postId,'post_id');const [rows]=await db.query('SELECT c.id,c.body,c.parent_id,c.created_at,u.id author_id,u.name author_name,u.role author_role FROM erp_feed_comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=? AND c.is_deleted=0 AND NOT EXISTS(SELECT 1 FROM erp_social_blocks b WHERE b.blocker_id=? AND b.blocked_id=c.author_id) ORDER BY c.created_at ASC',[p,user.id]);return rows;}
async function listReports(user, query = {}) {
    if (!staff(user)) fail('Moderation access denied', 403);
    const { limit, offset } = page(query);
    const statuses = ['Open', 'Reviewed', 'Closed'];
    const conditions = []; const params = [];
    if (query.status && statuses.includes(query.status)) { conditions.push('r.status=?'); params.push(query.status); }
    const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [[{ total }]] = await db.query(`SELECT COUNT(*) total FROM erp_social_reports r ${clause}`, params);
    const [items] = await db.query(`SELECT r.id,r.target_type,r.target_id,r.reason,r.status,r.created_at,ru.name reporter_name,ru.role reporter_role,
        (SELECT action FROM erp_social_report_actions a WHERE a.report_id=r.id ORDER BY a.id DESC LIMIT 1) last_action
        FROM erp_social_reports r JOIN users ru ON ru.id=r.reporter_id ${clause} ORDER BY r.status='Open' DESC,r.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { items, pagination: { limit, offset, total: Number(total) } };
}
async function moderateReport(reportId, data, user) {
    if (!staff(user)) fail('Moderation access denied', 403);
    const report = id(reportId, 'report_id');
    const [rows] = await db.query('SELECT * FROM erp_social_reports WHERE id=?', [report]);
    if (!rows[0]) fail('Report not found', 404);
    const statuses = { reviewed: 'Reviewed', closed: 'Closed', content_removed: 'Closed', report_dismissed: 'Closed' };
    const action = statuses[data?.action] ? data.action : null;
    if (!action) fail('A valid moderation action is required');
    if (data?.note && (typeof data.note !== 'string' || data.note.length > 500)) fail('Moderation note must be at most 500 characters');
    const resolution = data.note ? String(data.note).slice(0, 500) : null;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        if (action === 'content_removed') {
            if (rows[0].target_type === 'post') await conn.query('UPDATE erp_feed_posts SET is_deleted=1 WHERE id=?', [rows[0].target_id]);
            else if (rows[0].target_type === 'comment') await conn.query('UPDATE erp_feed_comments SET is_deleted=1 WHERE id=?', [rows[0].target_id]);
            else if (rows[0].target_type === 'message') await conn.query('UPDATE erp_messages SET is_deleted=1 WHERE id=?', [rows[0].target_id]);
            else fail('Reported content cannot be removed by this action', 400);
        }
        await conn.query('UPDATE erp_social_reports SET status=? WHERE id=?', [statuses[action], report]);
        await conn.query('INSERT INTO erp_social_report_actions(report_id,actor_id,action,note) VALUES(?,?,?,?)', [report, user.id, action, resolution]);
        await conn.commit();
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
    await audit.log(user.id, 'MODERATE_SOCIAL_REPORT', 'erp_social_reports', report);
    return { id: report, status: statuses[action], action };
}
async function people(user, query = {}) {
    const conditions = ['u.id<>?', 'u.is_active=1', '(u.deleted=0 OR u.deleted IS NULL)',
        'COALESCE((SELECT allow_profile_discovery FROM erp_profile_details p WHERE p.user_id=u.id),1)=1',
        '(u.department_id=? OR sp.section_id=(SELECT section_id FROM student_profiles WHERE user_id=?))',
        'NOT EXISTS(SELECT 1 FROM erp_social_blocks b WHERE b.blocker_id=? AND b.blocked_id=u.id)'];
    const params = [user.id, user.department_id, user.id, user.id];
    if (user.role === 'student') conditions.push("(u.role<>'super_admin' OR sp.section_id=(SELECT section_id FROM student_profiles WHERE user_id=?))"), params.push(user.id);
    if (query.search) { conditions.push('u.name LIKE ?'); params.push(`%${searchTerm(query.search)}%`); }
    if (query.exclude_followed === '1') conditions.push('NOT EXISTS(SELECT 1 FROM erp_feed_follows f WHERE f.follower_id=? AND f.followed_id=u.id)'), params.push(user.id);
    const clause = conditions.join(' AND ');
    const [rows] = await db.query(`SELECT DISTINCT u.id,u.name,u.role,d.name department_name,sp.enrollment_no,
        EXISTS(SELECT 1 FROM erp_feed_follows f WHERE f.follower_id=? AND f.followed_id=u.id) following
        FROM users u LEFT JOIN departments d ON d.id=u.department_id LEFT JOIN student_profiles sp ON sp.user_id=u.id
        WHERE ${clause} ORDER BY u.name LIMIT 20`, [user.id, ...params]);
    return { items: rows };
}
async function block(targetId,user){const target=id(targetId,'user_id');if(target===Number(user.id))fail('You cannot block yourself');await db.query('INSERT IGNORE INTO erp_social_blocks(blocker_id,blocked_id) VALUES(?,?)',[user.id,target]);await db.query('DELETE FROM erp_feed_follows WHERE (follower_id=? AND followed_id=?) OR (follower_id=? AND followed_id=?)',[user.id,target,target,user.id]);return {blocked:true};}
async function unblock(targetId,user){await db.query('DELETE FROM erp_social_blocks WHERE blocker_id=? AND blocked_id=?',[user.id,id(targetId,'user_id')]);return {blocked:false};}
async function media(postId,user){const [r]=await db.query('SELECT p.media_storage_key,p.media_original_name,p.media_mime_type FROM erp_feed_posts p WHERE p.id=? AND p.is_deleted=0 AND NOT EXISTS(SELECT 1 FROM erp_social_blocks b WHERE b.blocker_id=? AND b.blocked_id=p.author_id)',[id(postId,'post_id'),user.id]);if(!r[0]?.media_storage_key)fail('Media not found',404);return r[0];}
module.exports = { feed, createPost, removePost, comment, comments, removeComment, share, unshare, report, listReports, moderateReport,
    like: (p, u) => toggle('erp_feed_likes', p, u),
    save: (p, u) => toggle('erp_feed_saves', p, u),
    follow, unfollow, people, block, unblock, media, academicPeer };
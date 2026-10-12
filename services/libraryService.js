const db = require('../config/db');
const audit = require('./auditService');
const files = require('../utils/learningFileStore');

const fail = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    error.publicMessage = message;
    throw error;
};
const id = (value, field) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) fail(`${field} must be a positive integer`);
    return number;
};
const page = query => ({ limit: Math.min(Math.max(Number(query.limit) || 25, 1), 100), offset: Math.max(Number(query.offset) || 0, 0) });
const staff = user => {
    if (!['super_admin', 'hod', 'organizer'].includes(user.role)) fail('Library staff access required', 403);
};
const student = user => {
    if (user.role !== 'student') fail('Only students may use this feature', 403);
};

async function list(query) {
    const paging = page(query);
    const where = [];
    const values = [];
    if (query.search) {
        const term = `%${String(query.search).slice(0, 100)}%`;
        where.push('(b.title LIKE ? OR b.isbn LIKE ? OR b.publisher LIKE ? OR c.name LIKE ? OR EXISTS (SELECT 1 FROM library_book_authors ba JOIN library_authors au ON au.id=ba.author_id WHERE ba.book_id=b.id AND au.name LIKE ?))');
        values.push(term, term, term, term, term);
    }
    if (query.category_id) {
        where.push('b.category_id=?');
        values.push(id(query.category_id, 'category_id'));
    }
    if (query.digital_only === '1') where.push('b.digital_storage_key IS NOT NULL');
    if (query.available_only === '1') where.push('EXISTS (SELECT 1 FROM library_copies av WHERE av.book_id=b.id AND av.status=\'Available\')');
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const base = 'FROM library_books b LEFT JOIN library_categories c ON c.id=b.category_id LEFT JOIN library_book_authors ba ON ba.book_id=b.id LEFT JOIN library_authors au ON au.id=ba.author_id';
    const [items] = await db.query(`SELECT b.id,b.isbn,b.title,b.publisher,b.publication_year,b.category_id,c.name category_name,GROUP_CONCAT(DISTINCT au.name ORDER BY au.name SEPARATOR ', ') authors,(SELECT COUNT(*) FROM library_copies cp WHERE cp.book_id=b.id) copies,(SELECT COUNT(*) FROM library_copies cp WHERE cp.book_id=b.id AND cp.status='Available') available,(b.digital_storage_key IS NOT NULL) has_digital,b.digital_original_name ${base} ${clause} GROUP BY b.id,c.name ORDER BY b.title LIMIT ? OFFSET ?`, [...values, paging.limit, paging.offset]);
    const [count] = await db.query(`SELECT COUNT(DISTINCT b.id) total ${base} ${clause}`, values);
    return { items, pagination: { ...paging, total: count[0].total } };
}

async function bookDetails(bookId) {
    const [rows] = await db.query('SELECT b.id,b.isbn,b.title,b.publisher,b.publication_year,c.name category_name,GROUP_CONCAT(DISTINCT au.name ORDER BY au.name SEPARATOR \', \') authors,(SELECT COUNT(*) FROM library_copies cp WHERE cp.book_id=b.id) copies,(SELECT COUNT(*) FROM library_copies cp WHERE cp.book_id=b.id AND cp.status=\'Available\') available,(b.digital_storage_key IS NOT NULL) has_digital FROM library_books b LEFT JOIN library_categories c ON c.id=b.category_id LEFT JOIN library_book_authors ba ON ba.book_id=b.id LEFT JOIN library_authors au ON au.id=ba.author_id WHERE b.id=? GROUP BY b.id,c.name', [id(bookId, 'book_id')]);
    if (!rows[0]) fail('Book not found', 404);
    return rows[0];
}

async function settings(user) {
    const [rows] = await db.query('SELECT max_renewals,renewal_days FROM library_settings WHERE id=1');
    return { configured: Boolean(rows[0]), ...(rows[0] || {}) };
}

async function saveSettings(payload, user) {
    staff(user);
    const maxRenewals = Number(payload.max_renewals);
    const renewalDays = Number(payload.renewal_days);
    if (!Number.isInteger(maxRenewals) || maxRenewals < 0 || maxRenewals > 10 || !Number.isInteger(renewalDays) || renewalDays < 1 || renewalDays > 90) fail('Renewal limits must be within the allowed range');
    await db.query('INSERT INTO library_settings(id,max_renewals,renewal_days,updated_by) VALUES(1,?,?,?) ON DUPLICATE KEY UPDATE max_renewals=VALUES(max_renewals),renewal_days=VALUES(renewal_days),updated_by=VALUES(updated_by)', [maxRenewals, renewalDays, user.id]);
    return { configured: true, max_renewals: maxRenewals, renewal_days: renewalDays };
}

async function categories() {
    const [rows] = await db.query('SELECT id,name FROM library_categories WHERE is_active=1 ORDER BY name');
    return rows;
}

async function createBook(book, user) {
    staff(user);
    if (!book.title || String(book.title).trim().length > 240) fail('title is required');
    let key = null;
    try {
        if (book.file) {
            files.validateUpload(book.file, null, 10 * 1024 * 1024);
            key = await files.save(book.file);
        }
        const [result] = await db.query('INSERT INTO library_books(isbn,title,publisher,publication_year,category_id,digital_storage_key,digital_original_name,digital_mime,created_by) VALUES(?,?,?,?,?,?,?,?,?)', [book.isbn || null, String(book.title).trim(), book.publisher || null, book.publication_year || null, book.category_id || null, key, book.file?.originalname || null, book.file?.mimetype || null, user.id]);
        if (Array.isArray(book.copy_accessions)) {
            for (const accession of book.copy_accessions) {
                if (!String(accession).trim() || String(accession).length > 80) fail('Each copy accession must be 1–80 characters');
                await db.query('INSERT INTO library_copies(book_id,accession_no) VALUES(?,?)', [result.insertId, String(accession).trim()]);
            }
        }
        await audit.log(user.id, 'CREATE_LIBRARY_BOOK', 'library_books', result.insertId);
        return { id: result.insertId, title: String(book.title).trim() };
    } catch (error) {
        if (key) await files.remove(key);
        throw error;
    }
}

async function issue(book, user) {
    staff(user);
    const studentId = id(book.student_id, 'student_id');
    const copyId = id(book.copy_id, 'copy_id');
    const dueAt = String(book.due_at || '');
    if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(dueAt)) fail('due_at must be a valid datetime');
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [copies] = await connection.query("SELECT * FROM library_copies WHERE id=? AND status='Available' FOR UPDATE", [copyId]);
        if (!copies[0]) fail('Copy is unavailable', 409);
        const [active] = await connection.query("SELECT 1 FROM library_loans WHERE copy_id=? AND status='Issued'", [copyId]);
        if (active[0]) fail('Copy already issued', 409);
        const [result] = await connection.query('INSERT INTO library_loans(copy_id,student_id,due_at,issued_by) VALUES(?,?,?,?)', [copyId, studentId, dueAt, user.id]);
        await connection.query("UPDATE library_copies SET status='Issued' WHERE id=?", [copyId]);
        await connection.commit();
        await audit.log(user.id, 'ISSUE_LIBRARY_COPY', 'library_loans', result.insertId);
        return { id: result.insertId, status: 'Issued' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function returnCopy(loanId, user) {
    staff(user);
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query("SELECT l.*,c.id copy_id FROM library_loans l JOIN library_copies c ON c.id=l.copy_id WHERE l.id=? AND l.status='Issued' FOR UPDATE", [id(loanId, 'loan_id')]);
        if (!rows[0]) fail('Active loan not found', 404);
        const loan = rows[0];
        const overdueDays = Math.max(0, Math.ceil((Date.now() - new Date(loan.due_at).getTime()) / 86400000));
        const finePaise = String(overdueDays * 1000);
        await connection.query("UPDATE library_loans SET returned_at=NOW(),returned_by=?,fine_paise=?,status='Returned' WHERE id=?", [user.id, finePaise, loan.id]);
        await connection.query("UPDATE library_copies SET status='Available' WHERE id=?", [loan.copy_id]);
        if (BigInt(finePaise) > 0n) {
            const invoiceNo = `LIB-${loan.id}-${Date.now()}`;
            const [invoice] = await connection.query("INSERT INTO finance_invoices(invoice_no,student_id,structure_id,issue_date,due_date,status,total_paise,discount_paise,waiver_paise,created_by) VALUES(?,?,NULL,CURDATE(),DATE_ADD(CURDATE(),INTERVAL 14 DAY),'Issued',?,0,0,?)", [invoiceNo, loan.student_id, finePaise, user.id]);
            await connection.query('INSERT INTO finance_invoice_items(invoice_id,code,name,amount_paise) VALUES(?,?,?,?)', [invoice.insertId, `LIBRARY_FINE:${loan.id}`, 'Library overdue fine', finePaise]);
        }
        await connection.commit();
        await audit.log(user.id, 'RETURN_LIBRARY_COPY', 'library_loans', loan.id);
        return { id: loan.id, status: 'Returned', fine_paise: finePaise };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function myLoans(user) {
    student(user);
    const [rows] = await db.query('SELECT l.*,b.title,b.isbn,b.publisher,b.digital_original_name,c.accession_no,(SELECT GROUP_CONCAT(au.name ORDER BY au.name SEPARATOR \', \') FROM library_book_authors ba JOIN library_authors au ON au.id=ba.author_id WHERE ba.book_id=b.id) authors,(SELECT COUNT(*) FROM library_loan_renewals r WHERE r.loan_id=l.id) renewal_count FROM library_loans l JOIN library_copies c ON c.id=l.copy_id JOIN library_books b ON b.id=c.book_id WHERE l.student_id=? ORDER BY l.issued_at DESC', [user.id]);
    return rows;
}

async function renew(loanId, user) {
    student(user);
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query("SELECT * FROM library_loans WHERE id=? AND student_id=? AND status='Issued' FOR UPDATE", [id(loanId, 'loan_id'), user.id]);
        if (!rows[0]) fail('Active loan not found', 404);
        const loan = rows[0];
        if (new Date(loan.due_at).getTime() < Date.now()) fail('Overdue books cannot be renewed', 409);
        const [renewals] = await connection.query('SELECT COUNT(*) total FROM library_loan_renewals WHERE loan_id=?', [loan.id]);
        const [settings] = await connection.query('SELECT max_renewals,renewal_days FROM library_settings WHERE id=1');
        const policy = settings[0];
        if (!policy) fail('Renewal policy is not configured', 503);
        if (Number(renewals[0].total) >= Number(policy.max_renewals)) fail('This loan has reached its renewal limit', 409);
        const [reservations] = await connection.query("SELECT 1 FROM library_reservations WHERE book_id=(SELECT book_id FROM library_copies WHERE id=?) AND status='Waiting' LIMIT 1", [loan.copy_id]);
        if (reservations[0]) fail('This book has a waiting reservation and cannot be renewed', 409);
        const [updated] = await connection.query('SELECT DATE_FORMAT(DATE_ADD(due_at,INTERVAL ? DAY),\'%Y-%m-%d %H:%i:%s\') due_at FROM library_loans WHERE id=?', [Number(policy.renewal_days), loan.id]);
        const oldDueAt = loan.due_at;
        await connection.query('UPDATE library_loans SET due_at=DATE_ADD(due_at,INTERVAL ? DAY) WHERE id=?', [Number(policy.renewal_days), loan.id]);
        await connection.query('INSERT INTO library_loan_renewals(loan_id,student_id,previous_due_at,new_due_at) VALUES(?,?,?,?)', [loan.id, user.id, oldDueAt, updated[0].due_at]);
        await connection.commit();
        await audit.log(user.id, 'RENEW_LIBRARY_LOAN', 'library_loans', loan.id);
        return { id: loan.id, due_at: updated[0].due_at };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function reserve(bookId, user) {
    student(user);
    const book = id(bookId, 'book_id');
    const [books] = await db.query('SELECT id FROM library_books WHERE id=?', [book]);
    if (!books[0]) fail('Book not found', 404);
    const [available] = await db.query("SELECT 1 FROM library_copies WHERE book_id=? AND status='Available' LIMIT 1", [book]);
    if (available[0]) fail('This book is currently available to borrow', 409);
    const [existing] = await db.query("SELECT id FROM library_reservations WHERE book_id=? AND student_id=? AND status='Waiting'", [book, user.id]);
    if (existing[0]) fail('You already have an active reservation for this book', 409);
    try {
        const [result] = await db.query("INSERT INTO library_reservations(book_id,student_id) VALUES(?,?)", [book, user.id]);
        await audit.log(user.id, 'RESERVE_LIBRARY_BOOK', 'library_reservations', result.insertId);
        return { id: result.insertId, status: 'Waiting' };
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') fail('You already have an active reservation for this book', 409);
        throw error;
    }
}

async function myReservations(user) {
    student(user);
    const [rows] = await db.query('SELECT r.id,r.book_id,r.created_at,r.status,b.title,b.isbn,(SELECT COUNT(*) FROM library_copies cp WHERE cp.book_id=b.id AND cp.status=\'Available\') available FROM library_reservations r JOIN library_books b ON b.id=r.book_id WHERE r.student_id=? ORDER BY r.created_at DESC', [user.id]);
    return rows;
}

async function cancelReservation(reservationId, user) {
    student(user);
    const [result] = await db.query("UPDATE library_reservations SET status='Cancelled' WHERE id=? AND student_id=? AND status='Waiting'", [id(reservationId, 'reservation_id'), user.id]);
    if (!result.affectedRows) fail('Active reservation not found', 404);
    await audit.log(user.id, 'CANCEL_LIBRARY_RESERVATION', 'library_reservations', Number(reservationId));
    return { id: Number(reservationId), status: 'Cancelled' };
}

async function readingHistory(user) {
    student(user);
    const [loans] = await db.query("SELECT l.id activity_id,'Loan' activity_type,b.title,l.issued_at activity_at,l.due_at,l.returned_at,l.status FROM library_loans l JOIN library_copies c ON c.id=l.copy_id JOIN library_books b ON b.id=c.book_id WHERE l.student_id=?", [user.id]);
    const [digital] = await db.query("SELECT d.id activity_id,'Digital access' activity_type,b.title,d.created_at activity_at,NULL due_at,NULL returned_at,'Accessed' status FROM library_digital_activity d JOIN library_books b ON b.id=d.book_id WHERE d.student_id=?", [user.id]);
    return [...loans, ...digital].sort((a, b) => new Date(b.activity_at) - new Date(a.activity_at));
}

async function download(bookId, user) {
    const book = id(bookId, 'book_id');
    const [rows] = await db.query('SELECT digital_storage_key,digital_original_name,digital_mime FROM library_books WHERE id=?', [book]);
    if (!rows[0] || !rows[0].digital_storage_key) fail('Digital resource not found', 404);
    if (user.role === 'student') {
        await db.query('INSERT INTO library_digital_activity(student_id,book_id) VALUES(?,?)', [user.id, book]);
    }
    return { storageKey: rows[0].digital_storage_key, name: rows[0].digital_original_name, mime: rows[0].digital_mime };
}

async function fines(user) {
    student(user);
    const [rows] = await db.query("SELECT l.id loan_id,b.title,l.fine_paise,l.returned_at,fi.id invoice_id,fi.invoice_no,fi.status invoice_status,(SELECT COALESCE(SUM(p.amount_paise),0) FROM finance_payments p WHERE p.invoice_id=fi.id AND p.status='Verified') paid_paise,(SELECT COALESCE(SUM(p.amount_paise),0) FROM finance_payments p WHERE p.invoice_id=fi.id AND p.status IN ('Pending','Verified')) submitted_paise FROM library_loans l JOIN library_copies c ON c.id=l.copy_id JOIN library_books b ON b.id=c.book_id LEFT JOIN finance_invoice_items fii ON fii.code=CONCAT('LIBRARY_FINE:',l.id) LEFT JOIN finance_invoices fi ON fi.id=fii.invoice_id AND fi.student_id=l.student_id WHERE l.student_id=? AND l.fine_paise>0 ORDER BY l.returned_at DESC", [user.id]);
    return rows;
}

async function rules() {
    const [rows] = await db.query('SELECT id,title,body,updated_at FROM library_policies WHERE is_active=1 ORDER BY sort_order,title');
    return { configured: rows.length > 0, items: rows };
}

async function saveRule(payload, user) {
    staff(user);
    if (!String(payload.title || '').trim() || !String(payload.body || '').trim()) fail('Rule title and body are required');
    if (String(payload.title).length > 160 || String(payload.body).length > 5000) fail('Rule content is too long');
    const [result] = await db.query('INSERT INTO library_policies(title,body,sort_order,updated_by) VALUES(?,?,?,?)', [String(payload.title).trim(), String(payload.body).trim(), Math.max(0, Number(payload.sort_order) || 0), user.id]);
    return { id: result.insertId };
}

async function facilities() {
    const [rows] = await db.query('SELECT id,name,description,location,capacity,opens_at,closes_at,booking_enabled FROM library_facilities WHERE is_active=1 ORDER BY name');
    return { configured: rows.length > 0, items: rows };
}

async function createFacility(payload, user) {
    staff(user);
    if (!String(payload.name || '').trim() || String(payload.name).length > 160) fail('Facility name is required');
    const capacity = Number(payload.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) fail('capacity must be a positive integer');
    const [result] = await db.query('INSERT INTO library_facilities(name,description,location,capacity,opens_at,closes_at,booking_enabled,created_by) VALUES(?,?,?,?,?,?,?,?)', [String(payload.name).trim(), String(payload.description || '').slice(0, 1000) || null, String(payload.location || '').slice(0, 160) || null, capacity, payload.opens_at || null, payload.closes_at || null, payload.booking_enabled === false ? 0 : 1, user.id]);
    return { id: result.insertId };
}

async function myBookings(user) {
    student(user);
    const [rows] = await db.query('SELECT b.id,b.facility_id,b.booking_date,b.starts_at,b.ends_at,b.status,f.name facility_name,f.location FROM library_space_bookings b JOIN library_facilities f ON f.id=b.facility_id WHERE b.student_id=? ORDER BY b.booking_date DESC,b.starts_at DESC', [user.id]);
    return rows;
}

async function bookSpace(facilityId, payload, user) {
    student(user);
    const facility = id(facilityId, 'facility_id');
    const date = String(payload.booking_date || '');
    const start = String(payload.starts_at || '');
    const end = String(payload.ends_at || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end) fail('Choose a valid date and time range');
    if (date < new Date().toISOString().slice(0, 10)) fail('Bookings must be for today or a future date');
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [facilities] = await connection.query('SELECT * FROM library_facilities WHERE id=? AND is_active=1 AND booking_enabled=1 FOR UPDATE', [facility]);
        const place = facilities[0];
        if (!place) fail('Bookings are not configured for this facility', 409);
        if (place.opens_at && start < String(place.opens_at).slice(0, 5) || place.closes_at && end > String(place.closes_at).slice(0, 5)) fail('The selected time is outside facility hours', 409);
        const [overlap] = await connection.query("SELECT COUNT(*) total FROM library_space_bookings WHERE facility_id=? AND booking_date=? AND status='Booked' AND starts_at<? AND ends_at>?", [facility, date, end, start]);
        if (Number(overlap[0].total) >= Number(place.capacity)) fail('No capacity remains for this time slot', 409);
        const [result] = await connection.query("INSERT INTO library_space_bookings(facility_id,student_id,booking_date,starts_at,ends_at,status) VALUES(?,?,?,?,?,'Booked')", [facility, user.id, date, start, end]);
        await connection.commit();
        await audit.log(user.id, 'BOOK_LIBRARY_SPACE', 'library_space_bookings', result.insertId);
        return { id: result.insertId, status: 'Booked' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function cancelBooking(bookingId, user) {
    student(user);
    const [result] = await db.query("UPDATE library_space_bookings SET status='Cancelled' WHERE id=? AND student_id=? AND status='Booked' AND booking_date>=CURDATE()", [id(bookingId, 'booking_id'), user.id]);
    if (!result.affectedRows) fail('Upcoming booking not found', 404);
    return { id: Number(bookingId), status: 'Cancelled' };
}

module.exports = { list, bookDetails, settings, saveSettings, categories, createBook, issue, returnCopy, myLoans, renew, reserve, myReservations, cancelReservation, readingHistory, download, fines, rules, saveRule, facilities, createFacility, myBookings, bookSpace, cancelBooking };

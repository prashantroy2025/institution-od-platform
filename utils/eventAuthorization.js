const { isPositiveInteger } = require('./requestValidation');

const getManagedEvent = async (db, user, eventId) => {
    if (!isPositiveInteger(eventId) || !user?.id || !user?.role) {
        return null;
    }

    const [rows] = await db.query(
        `SELECT id, organizer_id, department_id, target_hod_id, is_deleted
         FROM events
         WHERE id = ?
           AND is_deleted = 0`,
        [eventId]
    );

    if (rows.length === 0) {
        return null;
    }

    const event = rows[0];
    const allowed = user.role === 'super_admin'
        || (user.role === 'organizer' && Number(event.organizer_id) === Number(user.id))
        || (user.role === 'hod' && (
            Number(event.target_hod_id) === Number(user.id)
            || Number(event.department_id) === Number(user.department_id)
        ));

    return allowed ? event : null;
};

module.exports = { getManagedEvent };
const collegeSyncService = require('./collegeSyncService');
const db = require('../config/db');

const periods = [
 {period:1,start:"09:15:00",end:"10:10:00"},
 {period:2,start:"10:10:00",end:"11:05:00"},
 {period:3,start:"11:05:00",end:"12:00:00"},
 {period:4,start:"12:00:00",end:"12:55:00"},
 {period:5,start:"13:50:00",end:"14:45:00"},
 {period:6,start:"14:45:00",end:"15:40:00"},
 {period:7,start:"15:40:00",end:"16:35:00"}
];

exports.markAttendanceForOD = async (student_id, event_id, date) => {
  console.log("Running smart attendance automation");

  try {
    const [eventRows] = await db.query(
      "SELECT start_time, end_time, is_full_day FROM events WHERE id=?",
      [event_id]
    );

    if (!eventRows || eventRows.length === 0) {
      console.error("Event not found");
      return;
    }

    const { start_time, end_time, is_full_day } = eventRows[0];

    for (const p of periods) {
      // For full-day events, mark all periods. For timed events, check overlap.
      let overlaps = false;

      if (is_full_day) {
        overlaps = true;
      } else if (start_time && end_time) {
        const eventStartTime = new Date(`1970-01-01T${start_time}`);
        const eventEndTime = new Date(`1970-01-01T${end_time}`);
        const pStart = new Date(`1970-01-01T${p.start}`);
        const pEnd = new Date(`1970-01-01T${p.end}`);
        overlaps = pStart < eventEndTime && pEnd > eventStartTime;
      }

      if (!overlaps) continue;

      const [rows] = await db.query(
        "SELECT * FROM attendance WHERE student_id=? AND attendance_date=? AND period_number=?",
        [student_id, date, p.period]
      );

      if (rows.length === 0) {
        await db.query(
          "INSERT INTO attendance (student_id,attendance_date,period_number,status) VALUES (?,?,?,?)",
          [student_id, date, p.period, "OD"]
        );
        try {
          await collegeSyncService.syncAttendance(student_id, date, p.period, "Present");
        } catch (err) {
          console.error("❌ Sync failed:", err);
        }
      } else if (rows[0].status === "Absent") {
        await db.query(
          "UPDATE attendance SET status='OD' WHERE student_id=? AND attendance_date=? AND period_number=?",
          [student_id, date, p.period]
        );
        try {
          await collegeSyncService.syncAttendance(student_id, date, p.period, "Present");
        } catch (err) {
          console.error("❌ Sync failed:", err);
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
};
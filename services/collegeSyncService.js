const axios = require('axios');

exports.syncAttendance = async (student_id, date, period, status) => {

    try {

        const response = await axios.post(
            process.env.COLLEGE_API_URL + "/attendance/mark",
            {
                student_id: student_id,
                date: date,
                period: period,
                status: status
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.COLLEGE_API_TOKEN}`
                }
            }
        );

        console.log("Attendance synced to college system");

    } catch (error) {

        console.error("College sync failed:", error.message);

    }

};
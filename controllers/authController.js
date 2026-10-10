const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { isEmail, isNonEmptyString } = require('../utils/requestValidation');


// ------------------ LOGIN ------------------

exports.login = async (req, res) => {
    try {

        const { email, password } = req.body;

        if (!isEmail(email) || !isNonEmptyString(password)) {
            return res.status(400).json({ message: "Valid email and password are required" });
        }

        const [results] = await db.query(
            "SELECT * FROM users WHERE email = ? AND is_active = 1 AND deleted = 0",
            [email]
        );

        if (results.length === 0) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const user = results[0];

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, department_id: user.department_id },
            process.env.JWT_SECRET,
            { expiresIn: "8h" }
        );

        res.json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                department_id: user.department_id
            }
        });

    } catch (err) {
        console.error("LOGIN ERROR", {
            code: err.code,
            errno: err.errno,
            sqlState: err.sqlState,
            message: err.message
        });
        res.status(500).json({ message: "Server error" });
    }
};

// ------------------ CURRENT USER PROFILE ------------------

exports.me = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT u.id, u.college_id, u.name, u.email, u.role, u.department_id,
                    d.name AS department_name, u.club_name,
                    sp.enrollment_no, sp.phone AS student_phone, sp.batch_id, sp.section_id,
                    b.name AS batch_name, s.name AS section_name,
                    c.name AS course_name, fp.employee_code, fp.designation,
                    fp.phone AS faculty_phone
             FROM users u
             LEFT JOIN departments d ON d.id = u.department_id
             LEFT JOIN student_profiles sp ON sp.user_id = u.id
             LEFT JOIN batches b ON b.id = sp.batch_id
             LEFT JOIN sections s ON s.id = sp.section_id
             LEFT JOIN courses c ON c.id = b.course_id
             LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
             WHERE u.id = ? AND u.is_active = 1 AND u.deleted = 0
             LIMIT 1`,
            [req.user.id]
        );

        if (!rows.length) return res.status(404).json({ message: 'User profile not found' });
        const user = rows[0];
        res.json({
            id: user.id,
            college_id: user.college_id,
            name: user.name,
            email: user.email,
            role: user.role,
            department_id: user.department_id,
            department_name: user.department_name,
            club_name: user.club_name,
            profile: user.role === 'student' ? {
                enrollment_no: user.enrollment_no,
                phone: user.student_phone,
                batch_id: user.batch_id,
                batch_name: user.batch_name,
                section_id: user.section_id,
                section_name: user.section_name,
                course_name: user.course_name
            } : {
                employee_code: user.employee_code,
                designation: user.designation,
                phone: user.faculty_phone
            }
        });
    } catch (err) {
        console.error('CURRENT USER ERROR:', err);
        res.status(500).json({ message: 'Server error' });
    }
};


// ------------------ CREATE USER (SUPER ADMIN ONLY) ------------------

exports.createUser = async (req, res) => {
    try {
        const { college_id, name, email, password, role, department_id } = req.body;

        if (!college_id || !name || !email || !password || !role || !department_id) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const ALLOWED_ROLES = ['student', 'organizer', 'hod'];
         if (!ALLOWED_ROLES.includes(role)) {
         return res.status(400).json({ message: "Invalid role. Allowed: student, organizer, hod" });
        }

        const [existing] = await db.query(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );

        if(existing.length > 0){
            return res.status(400).json({ message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const club_name = req.body.club_name || null;

        await db.query(
            "INSERT INTO users (college_id, name, email, password, role, department_id, club_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                college_id,
                name,
                email,
                hashedPassword,
                role,
                department_id,
                club_name
            ]
        );

        res.json({ message: "User created successfully" });

    } catch (err) {
        console.error("CREATE USER ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
};
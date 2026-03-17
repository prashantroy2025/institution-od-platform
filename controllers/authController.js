const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


// ------------------ LOGIN ------------------

exports.login = async (req, res) => {
    try {

        const { email, password } = req.body;

        const [results] = await db.query(
            "SELECT * FROM users WHERE email = ? AND is_active = 1",
            [email]
        );

        if (results.length === 0) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const user = results[0];

        let isMatch = false;

        if (user.password && user.password.startsWith("$2b$")) {
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            isMatch = password === user.password;
        }

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
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};


// ------------------ CREATE USER (SUPER ADMIN ONLY) ------------------

exports.createUser = async (req, res) => {
    try {
        const { college_id, name, email, password, role, department_id } = req.body;

        if (!college_id || !name || !email || !password || !role || !department_id) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const [existing] = await db.query(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );

        if(existing.length > 0){
            return res.status(400).json({ message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const club_name = name;

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
        res.status(500).json({ error: err.message });
    }
};
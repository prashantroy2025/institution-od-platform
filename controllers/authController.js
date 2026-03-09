const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


// ------------------ LOGIN ------------------

exports.login = (req, res) => {
    const { email, password } = req.body;

    db.query(
        "SELECT * FROM users WHERE email = ? AND is_active = 1",
        [email],
        async (err, results) => {
            if (err) return res.status(500).json({ error: err.message });

            if (results.length === 0) {
                return res.status(401).json({ message: "Invalid credentials" });
            }

            const user = results[0];

            // Compare hashed password
            let isMatch = false;

          // If password is bcrypt hashed
            if (user.password.startsWith("$2b$")) {
                isMatch = await bcrypt.compare(password, user.password);
            } 
          // If password is plain text (old users)
            else {
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
        }
    );
};


// ------------------ CREATE USER (SUPER ADMIN ONLY) ------------------

exports.createUser = async (req, res) => {
    const { college_id, name, email, password, role, department_id } = req.body;

    if (!college_id || !name || !email || !password || !role || !department_id) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.query(
            "INSERT INTO users (college_id, name, email, password, role, department_id) VALUES (?, ?, ?, ?, ?, ?)",
            [college_id, name, email, hashedPassword, role, department_id],
            (err, result) => {
                if (err) return res.status(500).json({ error: err.message });

                res.json({ message: "User created successfully" });
            }
        );

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
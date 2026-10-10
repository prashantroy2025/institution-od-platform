const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { verifyToken, allowRoles } = require("../middleware/authMiddleware");

// GET all organizers (acts like clubs)
router.get("/", verifyToken, allowRoles("super_admin"), async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT id, name FROM users WHERE role='organizer'"
        );

        res.json(rows);

    } catch (err) {
        console.error("Organizer fetch error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;
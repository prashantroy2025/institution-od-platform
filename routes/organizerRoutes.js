const express = require("express");
const router = express.Router();
const db = require("../config/db");

// GET all organizers (acts like clubs)
router.get("/", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT id, name FROM users WHERE role='organizer'"
        );

        res.json(rows);

    } catch (err) {
        console.error("Organizer fetch error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
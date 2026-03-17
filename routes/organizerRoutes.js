const express = require("express");
const router = express.Router();
const db = require("../config/db");

// GET all organizers (acts like clubs)
router.get("/", (req, res) => {
    db.query(
        "SELECT id, name FROM users WHERE role='organizer'",
        (err, rows) => {
            if (err) return res.status(500).json(err);
            res.json(rows);
        }
    );
});

module.exports = router;
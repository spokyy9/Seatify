const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',');
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ─── DATABASE ─────────────────────────────────────────────────────────────────
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
}).promise();

pool.getConnection()
    .then(conn => { console.log("✅ MySQL connected!"); conn.release(); })
    .catch(err => console.error("❌ MySQL FAILED:", err.message));

const ensureMovieSchema = async () => {
    try {
        const [columns] = await pool.query(
            `SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'movies'
               AND COLUMN_NAME IN ('movie_language', 'rating')`,
            ['seatify']
        );

        const langColumn = columns.find(c => c.COLUMN_NAME === 'movie_language');
        const ratingColumn = columns.find(c => c.COLUMN_NAME === 'rating');

        if (langColumn && langColumn.CHARACTER_MAXIMUM_LENGTH && langColumn.CHARACTER_MAXIMUM_LENGTH < 100) {
            await pool.query(`ALTER TABLE movies MODIFY COLUMN movie_language VARCHAR(100)`);
            console.log('✅ Expanded movie_language column to VARCHAR(100)');
        }

        if (!ratingColumn) {
            await pool.query(`ALTER TABLE movies ADD COLUMN rating DECIMAL(3,1) NULL AFTER movie_rated`);
            console.log('✅ Added rating column to movies');
        }
    } catch (err) {
        console.error("❌ Schema migration error:", err.message);
    }
};

ensureMovieSchema();

// ─── HOME ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send("🚀 Seatify backend is running!"));

// ─── REGISTER ─────────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    console.log("📝 Register attempt:", email);

    if (!name || !email || !password)
        return res.status(400).json({ message: "Name, email and password are required." });

    try {
        // Check duplicate email — use user_id (your actual PK column)
        const [existing] = await pool.query(
            'SELECT user_id FROM users WHERE email = ?', [email]
        );
        if (existing.length > 0)
            return res.status(409).json({ message: "An account with this email already exists." });

        const hashed = await bcrypt.hash(password, 10);

        // role defaults to 'user' via your ENUM default — don't pass it
        const [result] = await pool.query(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            [name, email, hashed]
        );

        console.log("✅ Registered user_id:", result.insertId);
        res.status(201).json({ message: "Account created! You can now log in." });

    } catch (err) {
        console.error("❌ Register error:", err.message);
        res.status(500).json({ message: "Registration failed.", error: err.message });
    }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    console.log("🔐 Login attempt:", email);

    if (!email || !password)
        return res.status(400).json({ message: "Email and password are required." });

    try {
        const [rows] = await pool.query(
            'SELECT * FROM users WHERE email = ?', [email]
        );

        if (rows.length === 0) {
            console.log("❌ No user found:", email);
            return res.status(401).json({ message: "Invalid email or password." });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            console.log("❌ Wrong password:", email);
            return res.status(401).json({ message: "Invalid email or password." });
        }

        console.log("✅ Login OK:", email, "| role:", user.role);

        // user_id is the PK — map it to 'id' for the frontend
        res.status(200).json({
            message: "Login successful!",
            user: {
                id:    user.user_id,   // ← your PK is user_id
                name:  user.name,
                email: user.email,
                role:  user.role,      // 'user' or 'admin'
            }
        });

    } catch (err) {
        console.error("❌ Login error:", err.message);
        res.status(500).json({ message: "Login failed.", error: err.message });
    }
});

// ─── GET MOVIES (for HomePage) ────────────────────────────────────────────────
app.get('/api/movies', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM movies ORDER BY movie_id DESC'
        );
        const movies = rows.map(m => {
            let duration = m.movie_duration;
            if (typeof duration === 'string') {
                duration = parseInt(duration.replace(/\D/g, '')) || 120;
            }
            return {
                id:       m.movie_id,
                title:    m.movie_title,
                genre:    m.movie_genre,
                language: m.movie_language,
                duration: duration,
                rated:    m.movie_rated,
                poster:   m.movie_image   || "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400&q=80",
                banner:   m.movie_image   || "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=1200&q=80",
                trailer:  m.movie_trailer || null,
                desc:     m.description   || "",
                rating:   m.rating != null ? Number(m.rating) : null,
            };
        });
        res.status(200).json(movies);
    } catch (err) {
        console.error("❌ Fetch movies error:", err.message);
        res.status(500).json({ message: "Failed to fetch movies.", error: err.message });
    }
});

// ─── ADD MOVIE (Admin) ────────────────────────────────────────────────────────
// Your movies table columns: movie_title, movie_language, movie_duration, movie_genre, movie_rated
app.post('/api/movies/add', async (req, res) => {
    const { title, language, durationHours, durationMinutes, durationSeconds, genre, rated, image, trailer, desc, rating } = req.body;
    console.log("🎬 Add movie:", title);

    if (!title)
        return res.status(400).json({ message: "Movie title is required." });

    const duration = Math.max(0,
        Math.round((Number(durationHours || 0) * 60)
            + Number(durationMinutes || 0)
            + Number(durationSeconds || 0) / 60)
    ) || null;

    try {
        const [result] = await pool.query(
            `INSERT INTO movies (movie_title, movie_language, movie_duration, movie_genre, movie_rated, rating, movie_image, movie_trailer, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, language || null, duration, genre || null, rated || null, rating != null ? Number(rating) : null,
             image || null, trailer || null, desc || null]
        );
        console.log("✅ Movie added, movie_id:", result.insertId);
        res.status(201).json({ message: "Movie added!", id: result.insertId });
    } catch (err) {
        console.error("❌ Add movie error:", err.message);
        res.status(500).json({ message: "Failed to add movie.", error: err.message });
    }
});

// ─── EDIT MOVIE (Admin) ───────────────────────────────────────────────────────
app.put('/api/movies/:id', async (req, res) => {
    const { title, language, durationHours, durationMinutes, durationSeconds, genre, rated, image, trailer, desc, rating } = req.body;
    console.log("✏️ Edit movie ID:", req.params.id);

    if (!title)
        return res.status(400).json({ message: "Movie title is required." });

    const duration = Math.max(0,
        Math.round((Number(durationHours || 0) * 60)
            + Number(durationMinutes || 0)
            + Number(durationSeconds || 0) / 60)
    );

    try {
        const [result] = await pool.query(
            `UPDATE movies 
             SET movie_title = ?, movie_language = ?, movie_duration = ?, movie_genre = ?, 
                 movie_rated = ?, rating = ?, movie_image = ?, movie_trailer = ?, description = ?
             WHERE movie_id = ?`,
            [title, language || null, duration || null, genre || null, rated || null, rating != null ? Number(rating) : null,
             image || null, trailer || null, desc || null, req.params.id]
        );
        
        if (result.affectedRows === 0)
            return res.status(404).json({ message: "Movie not found." });
        
        console.log("✅ Movie updated, movie_id:", req.params.id);
        res.status(200).json({ message: "Movie updated successfully!", id: req.params.id });
    } catch (err) {
        console.error("❌ Edit movie error:", err.message);
        res.status(500).json({ message: "Failed to update movie.", error: err.message });
    }
});

// ─── DELETE MOVIE (Admin) ─────────────────────────────────────────────────────
app.delete('/api/movies/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM movies WHERE movie_id = ?', [req.params.id]);
        res.status(200).json({ message: "Movie deleted." });
    } catch (err) {
        console.error("❌ Delete movie error:", err.message);
        res.status(500).json({ message: "Failed to delete.", error: err.message });
    }
});

app.put('/api/shows/:id', async (req, res) => {
    const { date, time, seatType, priceRegular, pricePremium, duration } = req.body;
    try {
        const [result] = await pool.query(
            `UPDATE shows
             SET show_date = ?, show_start_time = ?, show_type = ?, price_regular = ?, price_premium = ?, duration = ?
             WHERE show_id = ?`,
            [date, time, seatType || 'Standard', priceRegular || 0, pricePremium || priceRegular || 0, duration || null, req.params.id]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Show not found.' });
        res.status(200).json({ message: 'Show updated.' });
    } catch (err) {
        console.error('❌ Update show error:', err.message);
        res.status(500).json({ message: 'Failed to update show.', error: err.message });
    }
});

app.delete('/api/shows/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM shows WHERE show_id = ?', [req.params.id]);
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Show not found.' });
        res.status(200).json({ message: 'Show deleted.' });
    } catch (err) {
        console.error('❌ Delete show error:', err.message);
        res.status(500).json({ message: 'Failed to delete show.', error: err.message });
    }
});

// ─── GET SHOWS FOR A MOVIE (for MoviePage) ────────────────────────────────────
app.get('/api/shows/:movieId', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT s.show_id, s.show_date, s.show_start_time, s.show_type,
                   s.price_regular, s.price_premium, s.screen_id,
                   t.theatre_name, l.location_name
            FROM shows s
            JOIN screen sc   ON sc.screen_id  = s.screen_id
            JOIN theatres t  ON t.theatre_id  = sc.theatre_id
            JOIN locations l ON l.location_id = t.location_id
            WHERE s.movie_id = ?
            ORDER BY s.show_date, s.show_start_time
        `, [req.params.movieId]);

        const shows = rows.map(r => ({
            id:           r.show_id,
            movieId:      Number(req.params.movieId),
            theatre:      r.theatre_name,
            location:     r.location_name,
            screenId:     r.screen_id,
            date:         new Date(r.show_date).toLocaleDateString("en-GB", {
                              day: "2-digit", month: "short", year: "numeric"
                          }),
            time:         r.show_start_time,
            type:         r.show_type,
            priceRegular: r.price_regular,
            pricePremium: r.price_premium,
        }));
        res.status(200).json(shows);
    } catch (err) {
        console.error("❌ Fetch shows error:", err.message);
        res.status(500).json({ message: "Failed to fetch shows.", error: err.message });
    }
});

// ─── ADD SHOW (Admin) ─────────────────────────────────────────────────────────
app.post('/api/shows/add', async (req, res) => {
    const { movieId, theatre, address, date, time, seatType, price, duration, created_by } = req.body;

    if (!movieId || !theatre || !date || !time || !price) {
        return res.status(400).json({ message: 'movieId, theatre, date, time and price are required.' });
    }

    try {
        // Resolve screen_id from theatre name
        const [screenRows] = await pool.query(
            `SELECT sc.screen_id FROM screen sc
             JOIN theatres t ON t.theatre_id = sc.theatre_id
             WHERE t.theatre_name = ? LIMIT 1`,
            [theatre]
        );

        let screenId = screenRows.length ? screenRows[0].screen_id : null;

        if (!screenId) {
            const [fallback] = await pool.query(`SELECT screen_id FROM screen LIMIT 1`);
            if (fallback.length) screenId = fallback[0].screen_id;
        }

        if (!screenId) {
            return res.status(400).json({ message: 'No screens configured in database.' });
        }

        const [result] = await pool.query(
            `INSERT INTO shows (screen_id, movie_id, duration, show_date, show_start_time, show_type, created_by, price_regular, price_premium)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [screenId, movieId, duration || 120, date, time, seatType || 'Standard', parseInt(created_by) || 1, price, price]
        );

        res.status(201).json({ message: 'Show added!', id: result.insertId });
    } catch (err) {
        console.error('❌ Add show error:', err.message);
        res.status(500).json({ message: 'Failed to add show.', error: err.message });
    }
});

// ─── LIST SHOWS (Admin) ───────────────────────────────────────────────────────
app.get('/api/shows', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT s.show_id, s.movie_id, s.screen_id, s.duration, s.show_date, s.show_start_time, s.show_type,
                   s.price_regular, s.price_premium,
                   m.movie_title, t.theatre_name, l.location_name
            FROM shows s
            LEFT JOIN movies m ON m.movie_id = s.movie_id
            LEFT JOIN screen sc ON sc.screen_id = s.screen_id
            LEFT JOIN theatres t ON t.theatre_id = sc.theatre_id
            LEFT JOIN locations l ON l.location_id = t.location_id
            ORDER BY s.show_date DESC, s.show_start_time DESC
        `);

        const result = await Promise.all(rows.map(async (r) => {
            const [[countTotal]] = await pool.query(`SELECT COUNT(*) AS total FROM seats WHERE screen_id = ?`, [r.screen_id]);
            const [[countBooked]] = await pool.query(`SELECT COUNT(*) AS booked FROM booked_seats bs JOIN bookings b ON b.booking_id = bs.booking_id WHERE b.show_id = ?`, [r.show_id]);

            return {
                id: r.show_id,
                movieId: r.movie_id,
                movieTitle: r.movie_title,
                theatre: r.theatre_name,
                location: r.location_name,
                address: r.location_name || '',
                date: r.show_date,
                time: r.show_start_time,
                type: r.show_type,
                duration: r.duration,
                priceRegular: r.price_regular,
                pricePremium: r.price_premium,
                seatsTotal: countTotal.total,
                seatsBooked: countBooked.booked,
                seatsAvailable: Math.max(0, countTotal.total - countBooked.booked),
            };
        }));

        res.status(200).json(result);
    } catch (err) {
        console.error('❌ Fetch all shows error:', err.message);
        res.status(500).json({ message: 'Failed to fetch showtimes.', error: err.message });
    }
});

// ─── GET SEATS FOR A SHOW ─────────────────────────────────────────────────────
app.get('/api/seats/:showId', async (req, res) => {
    try {
        const [seats] = await pool.query(`
            SELECT se.seat_id, se.seat_num, se.seat_type,
                   IF(bs.seat_id IS NOT NULL, 'booked', 'available') AS status
            FROM shows sh
            JOIN seats se ON se.screen_id = sh.screen_id
            LEFT JOIN booked_seats bs
                ON bs.seat_id = se.seat_id
               AND bs.booking_id IN (
                   SELECT booking_id FROM bookings WHERE show_id = ?
               )
            WHERE sh.show_id = ?
        `, [req.params.showId, req.params.showId]);

        res.status(200).json(seats);
    } catch (err) {
        console.error("❌ Fetch seats error:", err.message);
        res.status(500).json({ message: "Failed to fetch seats.", error: err.message });
    }
});

// ─── CREATE BOOKING ───────────────────────────────────────────────────────────
app.post('/api/bookings', async (req, res) => {
    const { user_id, show_id, seat_ids } = req.body;

    if (!user_id || !show_id || !seat_ids?.length)
        return res.status(400).json({ message: "user_id, show_id and seat_ids are required." });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [bookingResult] = await conn.query(
            'INSERT INTO bookings (user_id, show_id) VALUES (?, ?)',
            [user_id, show_id]
        );
        const booking_id = bookingResult.insertId;

        for (const seat_id of seat_ids) {
            await conn.query(
                'INSERT INTO booked_seats (booking_id, seat_id) VALUES (?, ?)',
                [booking_id, seat_id]
            );
        }

        await conn.commit();
        console.log("✅ Booking created:", booking_id);
        res.status(201).json({ message: "Booking confirmed!", booking_id });

    } catch (err) {
        await conn.rollback();
        console.error("❌ Booking error:", err.message);
        res.status(500).json({ message: "Booking failed.", error: err.message });
    } finally {
        conn.release();
    }
});

// ─── GET USER BOOKINGS ────────────────────────────────────────────────────────
app.get('/api/bookings/user/:userId', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT b.booking_id, b.show_id,
                   m.movie_title, m.movie_id,
                   s.show_date, s.show_start_time, s.show_type,
                   s.price_regular, s.price_premium,
                   t.theatre_name,
                   GROUP_CONCAT(se.seat_num  ORDER BY se.seat_num SEPARATOR ', ') AS seats,
                   GROUP_CONCAT(se.seat_type ORDER BY se.seat_num SEPARATOR ', ') AS seat_types
            FROM bookings b
            JOIN shows s    ON s.show_id    = b.show_id
            JOIN movies m   ON m.movie_id   = s.movie_id
            JOIN screen sc  ON sc.screen_id = s.screen_id
            JOIN theatres t ON t.theatre_id = sc.theatre_id
            JOIN booked_seats bs ON bs.booking_id = b.booking_id
            JOIN seats se   ON se.seat_id   = bs.seat_id
            WHERE b.user_id = ?
            GROUP BY b.booking_id
            ORDER BY b.booking_id DESC
        `, [req.params.userId]);
        res.status(200).json(rows);
    } catch (err) {
        console.error("❌ Fetch bookings error:", err.message);
        res.status(500).json({ message: "Failed to fetch bookings.", error: err.message });
    }
});

// ─── GET ALL USERS (Admin) ────────────────────────────────────────────────────
app.get('/api/admin/users', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT user_id AS id, name, email, role FROM users ORDER BY user_id DESC'
        );
        res.status(200).json(rows);
    } catch (err) {
        console.error("❌ Fetch users error:", err.message);
        res.status(500).json({ message: "Failed to fetch users.", error: err.message });
    }
});

// ─── UPDATE USER ROLE (Admin) — must be 'user' or 'admin' per your ENUM ──────
app.put('/api/admin/users/:id/role', async (req, res) => {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role))
        return res.status(400).json({ message: "Role must be 'user' or 'admin'." });
    try {
        await pool.query('UPDATE users SET role = ? WHERE user_id = ?', [role, req.params.id]);
        res.status(200).json({ message: "Role updated." });
    } catch (err) {
        console.error("❌ Update role error:", err.message);
        res.status(500).json({ message: "Failed to update role.", error: err.message });
    }
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, () => console.log(`✅ Server running → http://localhost:${PORT}`));

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config(); // Load env variables for local dev

const app = express();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;

if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('Connected to MongoDB'))
        .catch(err => console.error('MongoDB error:', err));
} else {
    console.log("Waiting for MONGO_URI environment variable...");
}

// Data Model
const GameSchema = new mongoose.Schema({
    code: { type: String, unique: true, required: true },
    players: [String], // List of player names
    sessions: [{
        date: { type: Date, default: Date.now },
        scores: { type: Map, of: Number, default: {} }
    }]
});

const Game = mongoose.model('Game', GameSchema);

// API Routes

// 1. Join or Create Game
app.post('/api/join', async (req, res) => {
    const { code, name } = req.body;
    if (!code || !name) return res.status(400).json({ error: "Code and Name required" });

    try {
        let game = await Game.findOne({ code });

        if (!game) {
            game = new Game({
                code,
                players: [name],
                sessions: [{ date: new Date(), scores: { [name]: 0 } }]
            });
        } else {
            if (!game.players.includes(name)) {
                game.players.push(name);
            }
            const currentSession = game.sessions[game.sessions.length - 1];
            if (!currentSession.scores.has(name)) {
                currentSession.scores.set(name, 0);
            }
        }
        await game.save();
        res.json(game);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Update Score (Add or Subtract)
app.post('/api/score', async (req, res) => {
    const { code, name, delta } = req.body; // 'delta' determines +1 or -1
    const change = delta ? parseInt(delta) : 1;

    try {
        const game = await Game.findOne({ code });
        if (!game) return res.status(404).json({ error: "Game not found" });

        const currentSession = game.sessions[game.sessions.length - 1];
        
        const currentScore = currentSession.scores.get(name) || 0;
        // Update score
        currentSession.scores.set(name, currentScore + change);

        game.markModified('sessions');
        await game.save();
        res.json(game);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. New Session (Clean Slate)
app.post('/api/new-session', async (req, res) => {
    const { code } = req.body;
    try {
        const game = await Game.findOne({ code });
        if (!game) return res.status(404).json({ error: "Game not found" });

        const newScores = {};
        game.players.forEach(p => newScores[p] = 0);

        game.sessions.push({
            date: new Date(),
            scores: newScores
        });

        await game.save();
        res.json(game);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Get Game State
app.get('/api/game/:code', async (req, res) => {
    try {
        const game = await Game.findOne({ code: req.params.code });
        res.json(game);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. Get All Public Games (for "Join Existing")
app.get('/api/games', async (req, res) => {
    try {
        // Fetch all games
        // We sort client-side or here. Let's sort by latest session date desc.
        // Mongoose aggregation is best but let's keep it simple: fetch all and sort in JS if dataset small,
        // or use aggregation for scalability.
        const games = await Game.find({});
        
        // Sort by most recent session date
        games.sort((a, b) => {
            const dateA = a.sessions[a.sessions.length - 1].date;
            const dateB = b.sessions[b.sessions.length - 1].date;
            return new Date(dateB) - new Date(dateA);
        });

        // Map to lightweight object
        const gameList = games.map(g => ({
            code: g.code,
            players: g.players,
            lastPlayed: g.sessions[g.sessions.length - 1].date
        }));

        res.json(gameList);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ADMIN ROUTES ---

// 6. Get All Games (Admin) - same as above basically but maybe more detail later
app.get('/api/admin/games', async (req, res) => {
    try {
        const games = await Game.find({});
        res.json(games);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7. Update Specific Score (Admin)
app.post('/api/admin/update-score', async (req, res) => {
    const { code, sessionIndex, player, newScore } = req.body;
    try {
        const game = await Game.findOne({ code });
        if (!game) return res.status(404).json({ error: "Game not found" });

        if (game.sessions[sessionIndex]) {
            game.sessions[sessionIndex].scores.set(player, parseInt(newScore));
            game.markModified('sessions');
            await game.save();
            res.json(game);
        } else {
            res.status(404).json({ error: "Session not found" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
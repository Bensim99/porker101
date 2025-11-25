const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
// In production (Render), we use the environment variable. 
// Locally, you can create a .env file or hardcode for testing (but don't commit secrets!)
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
    // Sessions: Each item is a "date" or a "match"
    sessions: [{
        date: { type: Date, default: Date.now },
        // We use a flexible object to map "PlayerName": Score
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
            // Create new game with initial session
            game = new Game({
                code,
                players: [name],
                sessions: [{ date: new Date(), scores: { [name]: 0 } }]
            });
        } else {
            // Add player if not exists
            if (!game.players.includes(name)) {
                game.players.push(name);
            }
            // Ensure current session exists and initialize player score if missing
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

// 2. Add Score
app.post('/api/score', async (req, res) => {
    const { code, name } = req.body;
    try {
        const game = await Game.findOne({ code });
        if (!game) return res.status(404).json({ error: "Game not found" });

        // Get the latest session
        const currentSession = game.sessions[game.sessions.length - 1];
        
        // Increment score
        const currentScore = currentSession.scores.get(name) || 0;
        currentSession.scores.set(name, currentScore + 1);

        // Mark as modified because Maps don't always trigger updates automatically
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

        // Initialize new scores for all existing players
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

// 4. Get Game State (Polling)
app.get('/api/game/:code', async (req, res) => {
    try {
        const game = await Game.findOne({ code: req.params.code });
        res.json(game);
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
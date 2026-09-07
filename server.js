const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/life-dashboard';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(MONGO_URL).then(() => console.log('MongoDB connected')).catch(e => console.error('MongoDB error:', e));

const dataSchema = new mongoose.Schema({
    key: { type: String, default: 'main' },
    todos: { type: Array, default: [] },
    timers: { type: Array, default: [] },
    goals: { type: Array, default: [] },
    countdowns: { type: Array, default: [] },
    diaries: { type: Array, default: [] }
});

const Data = mongoose.model('Data', dataSchema);

app.get('/api/data', async (req, res) => {
    let d = await Data.findOne({ key: 'main' });
    if (!d) {
        d = await Data.create({ key: 'main' });
    }
    res.json({ todos: d.todos, timers: d.timers, goals: d.goals, countdowns: d.countdowns, diaries: d.diaries });
});

app.post('/api/data', async (req, res) => {
    await Data.findOneAndUpdate({ key: 'main' }, req.body, { upsert: true });
    res.json({ ok: true });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Life Dashboard running at http://localhost:${PORT}`);
});

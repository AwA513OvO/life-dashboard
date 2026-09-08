const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/life-dashboard';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(MONGO_URL).then(() => console.log('MongoDB connected')).catch(e => console.error('MongoDB error:', e));

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    vaultPassword: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

const dataSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    todos: { type: Array, default: [] },
    timers: { type: Array, default: [] },
    goals: { type: Array, default: [] },
    countdowns: { type: Array, default: [] },
    diaries: { type: Array, default: [] },
    vault: { type: Array, default: [] }
});

const User = mongoose.model('User', userSchema);
const Data = mongoose.model('Data', dataSchema);

function auth(req, res, next) {
    const token = req.headers.authorization && req.headers.authorization.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.username = decoded.username;
        req.isAdmin = decoded.isAdmin;
        User.findByIdAndUpdate(decoded.userId, { lastActive: new Date() }).exec();
        next();
    } catch(e) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    if (username.length < 2 || password.length < 4) return res.status(400).json({ error: 'Too short' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username exists' });
    const userCount = await User.countDocuments();
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hash, isAdmin: userCount === 0 });
    const token = jwt.sign({ userId: user._id, username, isAdmin: user.isAdmin }, JWT_SECRET);
    await Data.create({ userId: user._id });
    res.json({ token, isAdmin: user.isAdmin });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Wrong password' });
    const token = jwt.sign({ userId: user._id, username, isAdmin: user.isAdmin }, JWT_SECRET);
    res.json({ token, isAdmin: user.isAdmin, hasVault: !!user.vaultPassword });
});

app.get('/api/me', auth, async (req, res) => {
    const user = await User.findById(req.userId);
    res.json({ username: user.username, isAdmin: user.isAdmin, hasVault: !!user.vaultPassword });
});

app.post('/api/vault/setup', auth, async (req, res) => {
    const { vaultPassword } = req.body;
    if (!vaultPassword || vaultPassword.length < 4) return res.status(400).json({ error: 'Too short' });
    const hash = await bcrypt.hash(vaultPassword, 10);
    await User.findByIdAndUpdate(req.userId, { vaultPassword: hash });
    res.json({ ok: true });
});

app.post('/api/vault/verify', auth, async (req, res) => {
    const { vaultPassword } = req.body;
    const user = await User.findById(req.userId);
    if (!user.vaultPassword) return res.status(400).json({ error: 'Vault not set' });
    const match = await bcrypt.compare(vaultPassword, user.vaultPassword);
    if (!match) return res.status(400).json({ error: 'Wrong vault password' });
    res.json({ ok: true });
});

app.get('/api/data', auth, async (req, res) => {
    let d = await Data.findOne({ userId: req.userId });
    if (!d) d = await Data.create({ userId: req.userId });
    res.json({ todos: d.todos, timers: d.timers, goals: d.goals, countdowns: d.countdowns, diaries: d.diaries, vault: d.vault });
});

app.post('/api/data', auth, async (req, res) => {
    const update = {};
    for (const key of ['todos', 'timers', 'goals', 'countdowns', 'diaries', 'vault']) {
        if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    await Data.findOneAndUpdate({ userId: req.userId }, update, { upsert: true });
    res.json({ ok: true });
});

app.get('/api/admin/stats', auth, async (req, res) => {
    if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
    const totalUsers = await User.countDocuments();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86400000);
    const weekAgo = new Date(now.getTime() - 604800000);
    const monthAgo = new Date(now.getTime() - 2592000000);
    const activeToday = await User.countDocuments({ lastActive: { $gte: dayAgo } });
    const activeWeek = await User.countDocuments({ lastActive: { $gte: weekAgo } });
    const activeMonth = await User.countDocuments({ lastActive: { $gte: monthAgo } });
    const newToday = await User.countDocuments({ createdAt: { $gte: dayAgo } });
    const newWeek = await User.countDocuments({ createdAt: { $gte: weekAgo } });
    const users = await User.find({}, { username: 1, createdAt: 1, lastActive: 1, _id: 0 }).sort({ createdAt: -1 });
    res.json({ totalUsers, activeToday, activeWeek, activeMonth, newToday, newWeek, users });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('Life Dashboard v2 running at http://localhost:' + PORT);
});

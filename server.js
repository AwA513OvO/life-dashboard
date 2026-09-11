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

// ====== Models ======
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    vaultPassword: { type: String, default: null },
    securityQuestion: { type: String, default: null },
    securityAnswer: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
    isSuperAdmin: { type: Boolean, default: false },
    resetApproved: { type: Boolean, default: false },
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

const resetRequestSchema = new mongoose.Schema({
    username: { type: String, required: true },
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null }
});

const User = mongoose.model('User', userSchema);
const Data = mongoose.model('Data', dataSchema);
const ResetRequest = mongoose.model('ResetRequest', resetRequestSchema);

// 一次性迁移：确保第一个注册的用户是超级管理员
mongoose.connect(MONGO_URL).then(async () => {
    console.log('MongoDB connected');
    const firstUser = await User.findOne().sort({ createdAt: 1 });
    if (firstUser && firstUser.isAdmin && !firstUser.isSuperAdmin) {
        await User.findByIdAndUpdate(firstUser._id, { isSuperAdmin: true });
        console.log('Migrated first user to super admin:', firstUser.username);
    }
}).catch(e => console.error('MongoDB error:', e));

// ====== Auth Middleware ======
async function auth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user) return res.status(401).json({ error: 'User not found' });
        req.userId = user._id;
        req.username = user.username;
        req.isAdmin = user.isAdmin;
        req.isSuperAdmin = user.isSuperAdmin;
        user.lastActive = new Date();
        await user.save();
        next();
    } catch(e) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// ====== Auth Routes ======
app.post('/api/register', async (req, res) => {
        if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    if (username.length < 2) return res.status(400).json({ error: 'Username too short' });
    if (password.length < 4 || password.length > 8) return res.status(400).json({ error: 'Password must be 4-8 characters' });
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
        return res.status(400).json({ error: 'Password must contain letters and numbers' });
        return res.status(400).json({ error: 'Password must contain letters and numbers' });
    if (!securityQuestion || !securityAnswer || securityAnswer.trim().length < 1)
        return res.status(400).json({ error: 'Need security Q&A' });
    
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username exists' });
    
    const userCount = await User.countDocuments();
    const hash = await bcrypt.hash(password, 10);
    const answerHash = await bcrypt.hash(securityAnswer.trim().toLowerCase(), 10);
    const user = await User.create({
        username, password: hash, isAdmin: userCount === 0, isSuperAdmin: userCount === 0,
        securityQuestion, securityAnswer: answerHash
    });
    
    const token = jwt.sign({ userId: user._id, username, isAdmin: user.isAdmin, isSuperAdmin: user.isSuperAdmin }, JWT_SECRET);
    await Data.create({ userId: user._id });
    res.json({ token, isAdmin: user.isAdmin });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });
    
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Wrong password' });
    
    const token = jwt.sign({ userId: user._id, username, isAdmin: user.isAdmin, isSuperAdmin: user.isSuperAdmin }, JWT_SECRET);
    res.json({ token, isAdmin: user.isAdmin, isSuperAdmin: user.isSuperAdmin, hasVault: !!user.vaultPassword });
});

app.get('/api/me', auth, async (req, res) => {
    const user = await User.findById(req.userId);
    res.json({ username: user.username, isAdmin: user.isAdmin, isSuperAdmin: user.isSuperAdmin, hasVault: !!user.vaultPassword });
});

// ====== Forgot Password (Self-service) ======
app.post('/api/forgot-password/question', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Need username' });
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });
    if (user.resetApproved) return res.json({ resetApproved: true });
    if (!user.securityQuestion) return res.status(400).json({ error: 'No security question set' });
    res.json({ securityQuestion: user.securityQuestion });
});

app.post('/api/forgot-password/reset', async (req, res) => {
    const { username, securityAnswer, newPassword } = req.body;
    if (!username || !newPassword) return res.status(400).json({ error: 'Missing fields' });
    if (newPassword.length < 4) return res.status(400).json({ error: 'Password too short' });
    
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });
    
    if (user.resetApproved) {
        const hash = await bcrypt.hash(newPassword, 10);
        await User.findByIdAndUpdate(user._id, { password: hash, resetApproved: false });
        await ResetRequest.updateMany({ username, status: 'pending' }, { status: 'resolved', resolvedAt: new Date() });
        return res.json({ ok: true });
    }
    
    if (!securityAnswer) return res.status(400).json({ error: 'Missing answer' });
    if (!user.securityAnswer) return res.status(400).json({ error: 'No security question set' });
    
    const match = await bcrypt.compare(securityAnswer.trim().toLowerCase(), user.securityAnswer);
    if (!match) return res.status(400).json({ error: 'Wrong answer' });
    
    const hash = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(user._id, { password: hash });
    res.json({ ok: true });
});

// ====== Forgot Password - Request Admin Reset ======
app.post('/api/forgot-password/request-admin', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Need username' });
    
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });
    
    const existing = await ResetRequest.findOne({ username, status: 'pending' });
    if (existing) return res.status(400).json({ error: 'Already requested' });
    
    await ResetRequest.create({ username, status: 'pending' });
    res.json({ ok: true });
});

// ====== Vault Password Routes ======
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

app.post('/api/vault/reset', auth, async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user.vaultPassword) return res.status(400).json({ error: 'Vault not set' });
    
    await User.findByIdAndUpdate(req.userId, { vaultPassword: null });
    await Data.findOneAndUpdate({ userId: req.userId }, { vault: [] });
    res.json({ ok: true });
});

// ====== Data Routes ======
app.get('/api/data', auth, async (req, res) => {
    let d = await Data.findOne({ userId: req.userId });
    if (!d) d = await Data.create({ userId: req.userId });
    res.json({
        todos: d.todos, timers: d.timers, goals: d.goals,
        countdowns: d.countdowns, diaries: d.diaries, vault: d.vault
    });
});

app.post('/api/data', auth, async (req, res) => {
    const update = {};
    for (const key of ['todos', 'timers', 'goals', 'countdowns', 'diaries', 'vault']) {
        if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    await Data.findOneAndUpdate({ userId: req.userId }, update, { upsert: true });
    res.json({ ok: true });
});

// ====== Admin Routes ======
app.post('/api/admin/set-admin', auth, async (req, res) => {
    if (!req.isSuperAdmin) return res.status(403).json({ error: '超级管理员才能操作' });
    const { username, makeAdmin } = req.body;
    if (!username) return res.status(400).json({ error: 'Missing username' });
    
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });
    if (user.isSuperAdmin) return res.status(400).json({ error: '不能修改超级管理员' });
    
    await User.findByIdAndUpdate(user._id, { isAdmin: makeAdmin });
    res.json({ ok: true });
});

app.post('/api/admin/approve-reset', auth, async (req, res) => {
    if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Missing username' });
    
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });
    
    await User.findByIdAndUpdate(user._id, { resetApproved: true });
    await ResetRequest.updateMany({ username, status: 'pending' }, { status: 'approved', resolvedAt: new Date() });
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
    
    const users = await User.find({}, { username: 1, createdAt: 1, lastActive: 1, isAdmin: 1, isSuperAdmin: 1, _id: 0 }).sort({ lastActive: -1 });
    
    const pendingRequests = await ResetRequest.find({ status: 'pending' }).sort({ createdAt: -1 });
    
    res.json({ totalUsers, activeToday, activeWeek, activeMonth, newToday, newWeek, users, pendingRequests });
});

app.get('/api/admin/reset-requests', auth, async (req, res) => {
    if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
    const requests = await ResetRequest.find({ status: 'pending' }).sort({ createdAt: -1 });
    res.json({ requests });
});

// ====== Fallback ======
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Life Dashboard v2 running at http://localhost:${PORT}`);
});

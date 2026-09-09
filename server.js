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

// ====== Models ======
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    vaultPassword: { type: String, default: null },
    securityQuestion: { type: String, default: null },
    securityAnswer: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
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

// ====== Auth Middleware ======
function auth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
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

// ====== Auth Routes ======
app.post('/api/register', async (req, res) => {
    const { username, password, securityQuestion, securityAnswer } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    if (username.length < 2 || password.length < 4) return res.status(400).json({ error: 'Too short' });
    if (!securityQuestion || !securityAnswer || securityAnswer.trim().length < 1)
        return res.status(400).json({ error: 'Need security Q&A' });
    
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username exists' });
    
    const userCount = await User.countDocuments();
    const hash = await bcrypt.hash(password, 10);
    const answerHash = await bcrypt.hash(securityAnswer.trim().toLowerCase(), 10);
    const user = await User.create({
        username, password: hash, isAdmin: userCount === 0,
        securityQuestion, securityAnswer: answerHash
    });
    
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
   

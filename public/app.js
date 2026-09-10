// ====== State ======
let token = localStorage.getItem('token') || '';
let data = { todos: [], timers: [], goals: [], countdowns: [], diaries: [], vault: [] };
let currentFilter = 'all';
let currentTimerFilter = 'all';
let currentStatsRange = 'day';
let currentVaultFilter = 'all';
let editingDiaryId = null;
let editingVaultId = null;
let vaultUnlocked = false;
let vaultKey = '';
let isAdmin = false;

// ====== API Helper ======
async function api(url, method, body) {
    const opts = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === 401) { logout(); throw new Error('Auth failed'); }
    return res.json();
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function fmtDate(d) { const dt = new Date(d); return `${dt.getMonth()+1}月${dt.getDate()}日`; }
function relTime(d) {
    const diff = Date.now() - new Date(d).getTime();
    const day = Math.floor(diff / 86400000);
    if (day === 0) return '今天';
    if (day === 1) return '昨天';
    if (day === 2) return '前天';
    if (day < 30) return `${day}天前`;
    return fmtDate(d);
}

// ====== Auth ======
async function checkAuth() {
    if (!token) { showAuth(); return; }
    try {
        const me = await api('/api/me');
        document.getElementById('current-user').textContent = '👤 ' + me.username;
        isAdmin = me.isAdmin;
        if (isAdmin) document.querySelector('.nav-admin').classList.remove('hidden');
        await loadData();
        document.getElementById('auth-page').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        renderAll();
    } catch(e) { showAuth(); }
}

function showAuth() {
    document.getElementById('auth-page').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
}

function logout() {
    token = '';
    localStorage.removeItem('token');
    showAuth();
}

let authMode = 'login';
document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        authMode = tab.dataset.mode;
        document.getElementById('auth-submit').textContent = authMode === 'login' ? '登录' : '注册';
        document.getElementById('auth-error').textContent = '';
        document.getElementById('auth-password-confirm').classList.toggle('hidden', authMode !== 'register');
        document.getElementById('security-fields').classList.toggle('hidden', authMode !== 'register');
    });
});

document.getElementById('auth-submit').addEventListener('click', async () => {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!username || !password) { document.getElementById('auth-error').textContent = '请填写完整'; return; }
    
    let body = { username, password };
    if (authMode === 'register') {
        const pwConfirm = document.getElementById('auth-password-confirm').value;
        if (!pwConfirm) { document.getElementById('auth-error').textContent = '请再次输入密码确认'; return; }
        if (password !== pwConfirm) { document.getElementById('auth-error').textContent = '两次密码不一致，请重新输入'; return; }
        const sq = document.getElementById('auth-security-question').value;
        const sa = document.getElementById('auth-security-answer').value.trim();
        if (!sq || !sa) { document.getElementById('auth-error').textContent = '请选择密保问题并填写答案'; return; }
        body.securityQuestion = sq;
        body.securityAnswer = sa;
    }
    
    try {
        const res = await api(`/api/${authMode}`, 'POST', body);
        if (res.error) { document.getElementById('auth-error').textContent = res.error; return; }
        token = res.token;
        localStorage.setItem('token', token);
        document.getElementById('auth-username').value = '';
        document.getElementById('auth-password').value = '';
        document.getElementById('auth-password-confirm').value = '';
        document.getElementById('auth-security-answer').value = '';
        document.getElementById('auth-error').textContent = '';
        isAdmin = res.isAdmin;
        await checkAuth();
    } catch(e) {
        document.getElementById('auth-error').textContent = authMode === 'login' ? '用户名或密码错误' : '用户名已存在或信息无效';
    }
});

document.getElementById('auth-password').addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('auth-submit').click(); });
document.getElementById('auth-password-confirm').addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('auth-submit').click(); });
document.getElementById('logout-btn').addEventListener('click', logout);

// ====== Forgot Password ======
let forgotUsername = '';
document.getElementById('forgot-password-link').addEventListener('click', () => {
    document.getElementById('forgot-modal').classList.remove('hidden');
    document.getElementById('forgot-step1').classList.remove('hidden');
    document.getElementById('forgot-step2').classList.add('hidden');
    document.getElementById('forgot-step3').classList.add('hidden');
    document.getElementById('forgot-step4').classList.add('hidden');
    document.getElementById('forgot-username').value = '';
    document.getElementById('forgot-answer').value = '';
    document.getElementById('forgot-new-password').value = '';
    document.getElementById('forgot-new-password-confirm').value = '';
    document.getElementById('forgot-step1-error').textContent = '';
    document.getElementById('forgot-step2-error').textContent = '';
});
document.getElementById('forgot-modal-close').addEventListener('click', () => document.getElementById('forgot-modal').classList.add('hidden'));

document.getElementById('forgot-get-question').addEventListener('click', async () => {
    const username = document.getElementById('forgot-username').value.trim();
    if (!username) { document.getElementById('forgot-step1-error').textContent = '请输入用户名'; return; }
    try {
        const res = await api('/api/forgot-password/question', 'POST', { username });
        if (res.error) { document.getElementById('forgot-step1-error').textContent = res.error; return; }
        forgotUsername = username;
        if (res.resetApproved) {
            document.getElementById('forgot-display-question').style.display = 'none';
            document.getElementById('forgot-admin-approved-msg').style.display = 'block';
            document.getElementById('forgot-answer').classList.add('hidden');
            document.getElementById('forgot-request-admin-2').classList.add('hidden');
        } else {
            document.getElementById('forgot-display-question').style.display = 'block';
            document.getElementById('forgot-display-question').textContent = '🔒 ' + res.securityQuestion;
            document.getElementById('forgot-admin-approved-msg').style.display = 'none';
            document.getElementById('forgot-answer').classList.remove('hidden');
            document.getElementById('forgot-request-admin-2').classList.remove('hidden');
        }
        document.getElementById('forgot-step1').classList.add('hidden');
        document.getElementById('forgot-step2').classList.remove('hidden');
    } catch(e) { document.getElementById('forgot-step1-error').textContent = '请求失败，请稍后重试'; }
});

document.getElementById('forgot-reset').addEventListener('click', async () => {
    const answer = document.getElementById('forgot-answer').value.trim();
    const newPassword = document.getElementById('forgot-new-password').value;
    const newPasswordConfirm = document.getElementById('forgot-new-password-confirm').value;
    const adminApproved = document.getElementById('forgot-admin-approved-msg').style.display !== 'none';
    if (!adminApproved && !answer) { document.getElementById('forgot-step2-error').textContent = '请输入密保答案'; return; }
    if (!newPassword || newPassword.length < 4) { document.getElementById('forgot-step2-error').textContent = '新密码至少4位'; return; }
    if (!newPasswordConfirm) { document.getElementById('forgot-step2-error').textContent = '请再次输入密码确认'; return; }
    if (newPassword !== newPasswordConfirm) { document.getElementById('forgot-step2-error').textContent = '两次密码不一致，请重新输入'; return; }
    try {
        const body = { username: forgotUsername, newPassword };
        if (!adminApproved) body.securityAnswer = answer;
        const res = await api('/api/forgot-password/reset', 'POST', body);
        if (res.error) { document.getElementById('forgot-step2-error').textContent = res.error; return; }
        document.getElementById('forgot-step2').classList.add('hidden');
        document.getElementById('forgot-step3').classList.remove('hidden');
    } catch(e) { document.getElementById('forgot-step2-error').textContent = '重置失败，请稍后重试'; }
});

document.getElementById('forgot-done').addEventListener('click', () => {
    document.getElementById('forgot-modal').classList.add('hidden');
    document.getElementById('auth-username').value = forgotUsername;
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-username').focus();
});

// ====== Request Admin Reset (when security question also forgotten) ======
document.getElementById('forgot-request-admin').addEventListener('click', async () => {
    const username = document.getElementById('forgot-username').value.trim();
    if (!username) { document.getElementById('forgot-step1-error').textContent = '请先输入用户名'; return; }
    try {
        const res = await api('/api/forgot-password/request-admin', 'POST', { username });
        if (res.error) { document.getElementById('forgot-step1-error').textContent = res.error; return; }
        document.getElementById('forgot-step1').classList.add('hidden');
        document.getElementById('forgot-step4').classList.remove('hidden');
    } catch(e) { document.getElementById('forgot-step1-error').textContent = '请求失败，请稍后重试'; }
});

document.getElementById('forgot-request-admin-2').addEventListener('click', async () => {
    try {
        const res = await api('/api/forgot-password/request-admin', 'POST', { username: forgotUsername });
        if (res.error) { document.getElementById('forgot-step2-error').textContent = res.error; return; }
        document.getElementById('forgot-step2').classList.add('hidden');
        document.getElementById('forgot-step4').classList.remove('hidden');
    } catch(e) { document.getElementById('forgot-step2-error').textContent = '请求失败，请稍后重试'; }
});

document.getElementById('forgot-request-done').addEventListener('click', () => {
    document.getElementById('forgot-modal').classList.add('hidden');
    document.getElementById('auth-username').value = '';
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-username').focus();
});

// ====== Admin Reset Password ======
let adminResetUsername = '';
document.getElementById('admin-reset-close').addEventListener('click', () => document.getElementById('admin-reset-modal').classList.add('hidden'));

document.getElementById('admin-reset-confirm').addEventListener('click', async () => {
    try {
        const res = await api('/api/admin/approve-reset', 'POST', { username: adminResetUsername });
        if (res.error) { document.getElementById('admin-reset-error').textContent = res.error; return; }
        document.getElementById('admin-reset-modal').classList.add('hidden');
        alert('已批准 ' + adminResetUsername + ' 的密码重置请求\n该用户现在可以自行设置新密码');
        renderAdmin();
    } catch(e) { document.getElementById('admin-reset-error').textContent = '操作失败'; }
});

function adminResetPassword(username) {
    adminResetUsername = username;
    document.getElementById('admin-reset-username').textContent = username;
    document.getElementById('admin-reset-error').textContent = '';
    document.getElementById('admin-reset-modal').classList.remove('hidden');
}

// ====== Data ======
async function loadData() {
    try { data = await api('/api/data'); } catch(e) {}
}
async function saveData() {
    try { await api('/api/data', 'POST', data); } catch(e) {}
}

// ====== Todos ======
function renderTodos() {
    const list = document.getElementById('todo-list');
    let items = data.todos.filter(t => !t.archived);
    if (currentFilter === 'active') items = items.filter(t => !t.done);
    if (currentFilter === 'done') items = items.filter(t => t.done);
    list.innerHTML = items.length === 0 ? '<div class="empty-tip">暂无待办事项</div>' : items.map(t => `
        <div class="todo-item ${t.done?'done':''} ${t.priority}">
            <div class="todo-check ${t.done?'done':''}" onclick="toggleTodo('${t.id}')">${t.done?'✓':''}</div>
            <div style="flex:1"><div class="todo-text ${t.done?'done':''}">${t.text}</div>
            <div class="todo-meta"><span>${t.category}</span><span>${t.priority==='high'?'高':t.priority==='mid'?'中':'低'}</span></div></div>
            <span class="todo-del" onclick="delTodo('${t.id}')">✕</span>
        </div>`).join('');
    const total = items.length, done = items.filter(t => t.done).length;
    document.getElementById('todo-progress').style.width = total ? (done/total*100)+'%' : '0%';
    document.getElementById('todo-progress-text').textContent = `${done} / ${total}`;
}
function addTodo() {
    const text = document.getElementById('todo-input').value.trim();
    if (!text) return;
    data.todos.push({ id: uid(), text, done: false, category: document.getElementById('todo-category').value, priority: document.getElementById('todo-priority').value, createdAt: new Date().toISOString() });
    document.getElementById('todo-input').value = '';
    saveData(); renderTodos();
}
function toggleTodo(id) { const t = data.todos.find(t => t.id === id); if (t) { t.done = !t.done; t.completedAt = t.done ? new Date().toISOString() : null; saveData(); renderTodos(); } }
function delTodo(id) {
    const t = data.todos.find(t => t.id === id);
    if (!t) return;
    if (t.done) {
        t.archived = true;
        t.archivedAt = new Date().toISOString();
    } else {
        data.todos = data.todos.filter(t => t.id !== id);
    }
    saveData(); renderTodos();
}

// ====== Timers ======
function renderTimers() {
    const list = document.getElementById('timer-list');
    let items = data.timers;
    if (currentTimerFilter !== 'all') items = items.filter(t => t.direction === currentTimerFilter);
    if (items.length === 0) { list.innerHTML = '<div class="empty-tip">暂无计时器</div>'; return; }
    list.innerHTML = items.map(t => {
        const target = new Date(t.date).getTime(); const now = Date.now();
        let diff = t.direction === 'countdown' ? target - now : now - target;
        const expired = diff <= 0; if (expired && t.direction === 'countdown') diff = 0;
        const d = Math.floor(diff/86400000), h = Math.floor((diff%86400000)/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
        return `<div class="timer-item" style="border-left:3px solid ${t.color}">
            <span class="timer-del" onclick="delTimer('${t.id}')">✕</span>
            <span class="timer-tag ${t.direction}">${t.direction==='countdown'?'倒计时':'正向'}</span>
            <h3>${t.title}</h3>
            <div class="timer-display ${expired?'timer-expired':''}">${d}<span class="unit">天</span> ${h}<span class="unit">时</span> ${m}<span class="unit">分</span> ${s}<span class="unit">秒</span></div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">${fmtDate(t.date)}</div></div>`;
    }).join('');
}
function addTimer() {
    const title = document.getElementById('timer-input').value.trim(); const date = document.getElementById('timer-date').value;
    if (!title || !date) return;
    data.timers.push({ id: uid(), title, date, direction: document.getElementById('timer-direction').value, color: document.getElementById('timer-color').value });
    document.getElementById('timer-input').value = ''; document.getElementById('timer-date').value = '';
    saveData(); renderTimers();
}
function delTimer(id) { data.timers = data.timers.filter(t => t.id !== id); saveData(); renderTimers(); }

// ====== Goals ======
function renderGoals() {
    const list = document.getElementById('goal-list');
    if (data.goals.length === 0) { list.innerHTML = '<div class="empty-tip">暂无目标</div>'; return; }
    list.innerHTML = data.goals.map(g => {
        const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline) - new Date()) / 86400000) : null;
        return `<div class="goal-item">
            <span class="todo-del" onclick="delGoal('${g.id}')" style="position:absolute;right:12px;top:8px">✕</span>
            <h3>${g.title}</h3>${g.desc ? `<p>${g.desc}</p>` : ''}
            <input type="range" class="goal-slider" min="0" max="100" value="${g.progress}" oninput="updateGoalProgress('${g.id}',this.value)" />
            <div class="goal-progress"><span>${g.progress}%</span>${daysLeft!==null ? `<span class="goal-deadline">${daysLeft>0?'剩'+daysLeft+'天':daysLeft===0?'今天到期':'过期'+Math.abs(daysLeft)+'天'}</span>`:''}</div></div>`;
    }).join('');
}
function addGoal() {
    const title = document.getElementById('goal-input').value.trim();
    if (!title) return;
    data.goals.push({ id: uid(), title, desc: document.getElementById('goal-desc').value, deadline: document.getElementById('goal-deadline').value, progress: 0 });
    document.getElementById('goal-input').value = ''; document.getElementById('goal-desc').value = ''; document.getElementById('goal-deadline').value = '';
    saveData(); renderGoals();
}
function updateGoalProgress(id, val) { const g = data.goals.find(g => g.id === id); if (g) { g.progress = parseInt(val); saveData(); renderGoals(); } }
function delGoal(id) { data.goals = data.goals.filter(g => g.id !== id); saveData(); renderGoals(); }

// ====== Countdowns ======
function renderCountdowns() {
    const list = document.getElementById('countdown-list');
    if (data.countdowns.length === 0) { list.innerHTML = '<div class="empty-tip">暂无倒数日</div>'; return; }
    const sorted = [...data.countdowns].sort((a,b) => Math.abs(new Date(a.date)-new Date()) - Math.abs(new Date(b.date)-new Date()));
    list.innerHTML = sorted.map(c => {
        const diff = Math.floor(Math.abs(new Date(c.date) - new Date()) / 86400000);
        return `<div class="countdown-item"><span class="countdown-emoji">${c.emoji||'📅'}</span>
            <div class="countdown-info"><h3>${c.title}</h3><p>${fmtDate(c.date)} · ${c.mode==='until'?'距今还有':'已经过了'}</p></div>
            <span class="countdown-days">${diff}</span><span class="todo-del" onclick="delCountdown('${c.id}')">✕</span></div>`;
    }).join('');
}
function addCountdown() {
    const title = document.getElementById('cd-input').value.trim(); const date = document.getElementById('cd-date').value;
    if (!title || !date) return;
    data.countdowns.push({ id: uid(), title, date, mode: document.getElementById('cd-mode').value, emoji: document.getElementById('cd-emoji').value });
    document.getElementById('cd-input').value = ''; document.getElementById('cd-date').value = '';
    saveData(); renderCountdowns();
}
function delCountdown(id) { data.countdowns = data.countdowns.filter(c => c.id !== id); saveData(); renderCountdowns(); }

// ====== Stats ======
function getStatsRangeStart(range) {
    const now = new Date(); const start = new Date(now);
    if (range === 'day') start.setHours(0,0,0,0);
    else if (range === 'week') { start.setDate(now.getDate()-now.getDay()); start.setHours(0,0,0,0); }
    else if (range === 'month') { start.setDate(1); start.setHours(0,0,0,0); }
    else if (range === 'year') { start.setMonth(0,1); start.setHours(0,0,0,0); }
    return start;
}
function renderStats() {
    const start = getStatsRangeStart(currentStatsRange); const startMs = start.getTime();
    // 统计包含所有待办（包括已归档的），按完成时间判断是否在统计区间内
    const completedInRange = data.todos.filter(t => t.done && t.completedAt && new Date(t.completedAt) >= startMs);
    const totalInRange = data.todos.filter(t => {
        // 在区间内创建的，或在区间内完成的，都算入
        const created = new Date(t.createdAt) >= startMs;
        const completed = t.done && t.completedAt && new Date(t.completedAt) >= startMs;
        return created || completed;
    });
    const doneInRange = completedInRange;
    const diariesInRange = data.diaries.filter(d => new Date(d.date) >= startMs);
    const goalsDone = data.goals.filter(g => g.progress >= 100).length;
    const completionRate = totalInRange.length ? Math.round(doneInRange.length / totalInRange.length * 100) + '%' : '0%';
    document.getElementById('stats-cards').innerHTML = `
        <div class="stat-card"><div class="num">${totalInRange.length}</div><div class="label">待办总数</div></div>
        <div class="stat-card success"><div class="num">${doneInRange.length}</div><div class="label">已完成</div></div>
        <div class="stat-card warning"><div class="num">${Math.max(0, totalInRange.length - doneInRange.length)}</div><div class="label">待完成</div></div>
        <div class="stat-card"><div class="num">${completionRate}</div><div class="label">完成率</div></div>`;
    // 分类统计
    const cats = {}; totalInRange.forEach(t => cats[t.category]=(cats[t.category]||0)+1);
    const catColors = {'工作':'#6366f1','生活':'#22c55e','学习':'#f59e0b','其他':'#888'};
    document.getElementById('stats-category').innerHTML = '<h3>分类统计</h3>' + (Object.keys(cats).length ? Object.entries(cats).map(([name,count]) =>
        `<div class="stat-row"><span class="name">${name}</span><div class="bar"><div class="bar-fill" style="width:${count/totalInRange.length*100}%;background:${catColors[name]||'#888'}"></div></div><span class="val">${count}</span></div>`).join('') : '<div class="empty-tip">暂无数据</div>');
    const pris = {high:0,mid:0,low:0}; totalInRange.forEach(t => pris[t.priority]++);
    document.getElementById('stats-priority').innerHTML = `<h3>优先级分布</h3>
        <div class="stat-row"><span class="name">高</span><div class="bar"><div class="bar-fill" style="width:${totalInRange.length?pris.high/totalInRange.length*100:0}%;background:var(--danger)"></div></div><span class="val">${pris.high}</span></div>
        <div class="stat-row"><span class="name">中</span><div class="bar"><div class="bar-fill" style="width:${totalInRange.length?pris.mid/totalInRange.length*100:0}%;background:var(--warning)"></div></div><span class="val">${pris.mid}</span></div>
        <div class="stat-row"><span class="name">低</span><div class="bar"><div class="bar-fill" style="width:${totalInRange.length?pris.low/totalInRange.length*100:0}%;background:var(--success)"></div></div><span class="val">${pris.low}</span></div>`;
    const avgProgress = data.goals.length ? Math.round(data.goals.reduce((s,g)=>s+g.progress,0)/data.goals.length) : 0;
    document.getElementById('stats-goals').innerHTML = `<h3>目标概览</h3>
        <div class="stat-row"><span class="name">已完成</span><div class="bar"><div class="bar-fill" style="width:${data.goals.length?goalsDone/data.goals.length*100:0}%;background:var(--success)"></div></div><span class="val">${goalsDone}</span></div>
        <div class="stat-row"><span class="name">总数</span><div class="bar"><div class="bar-fill" style="width:100%;background:var(--border)"></div></div><span class="val">${data.goals.length}</span></div>
        <div class="stat-row"><span class="name">平均进度</span><div class="bar"><div class="bar-fill" style="width:${avgProgress}%;background:var(--primary)"></div></div><span class="val">${avgProgress}%</span></div>`;
    document.getElementById('stats-diaries').innerHTML = `<h3>日记统计</h3>
        <div class="stat-row"><span class="name">已写</span><div class="bar"><div class="bar-fill" style="width:100%;background:var(--primary-light)"></div></div><span class="val">${diariesInRange.length}</span></div>`;
}

// ====== Diary ======
function renderDiaries() {
    const list = document.getElementById('diary-list');
    if (data.diaries.length === 0) { list.innerHTML = '<div class="empty-tip">暂无日记</div>'; return; }
    const sorted = [...data.diaries].sort((a,b) => new Date(b.date) - new Date(a.date));
    list.innerHTML = sorted.map(d => `
        <div class="diary-item" onclick="editDiary('${d.id}')">
            <h3>${d.emoji||''} ${d.title}</h3>
            <div class="diary-meta"><span>${relTime(d.date)}</span></div>
            <div class="diary-preview">${(d.content||'').slice(0,80)}</div></div>`).join('');
}
function addDiary() {
    const title = document.getElementById('diary-title').value.trim();
    if (!title) return;
    const diary = { id: uid(), title, date: document.getElementById('diary-date').value || new Date().toISOString().slice(0,10), emoji: document.getElementById('diary-mood').value, content: '' };
    data.diaries.push(diary);
    document.getElementById('diary-title').value = '';
    saveData(); renderDiaries(); editDiary(diary.id);
}
function editDiary(id) {
    const d = data.diaries.find(x => x.id === id); if (!d) return;
    editingDiaryId = id;
    document.getElementById('diary-edit-title').value = d.title;
    document.getElementById('diary-edit-date').value = d.date;
    document.getElementById('diary-edit-mood').value = d.emoji || '😊';
    document.getElementById('diary-edit-content').value = d.content || '';
    document.getElementById('diary-modal').classList.remove('hidden');
}
function saveDiary() {
    const d = data.diaries.find(x => x.id === editingDiaryId);
    if (d) { d.title = document.getElementById('diary-edit-title').value.trim() || '无标题'; d.date = document.getElementById('diary-edit-date').value; d.emoji = document.getElementById('diary-edit-mood').value; d.content = document.getElementById('diary-edit-content').value; saveData(); renderDiaries(); }
    document.getElementById('diary-modal').classList.add('hidden');
}

// ====== Vault ======
function renderVaultState() {
    const setup = document.getElementById('vault-setup');
    const locked = document.getElementById('vault-locked');
    const unlocked = document.getElementById('vault-unlocked');
    setup.classList.add('hidden'); locked.classList.add('hidden'); unlocked.classList.add('hidden');
    api('/api/me').then(me => {
        if (!me.hasVault) { setup.classList.remove('hidden'); }
        else if (!vaultUnlocked) { locked.classList.remove('hidden'); }
        else { unlocked.classList.remove('hidden'); renderVaultList(); }
    });
}
function renderVaultList() {
    const list = document.getElementById('vault-list');
    let items = data.vault || [];
    if (currentVaultFilter !== 'all') items = items.filter(v => v.type === currentVaultFilter);
    if (items.length === 0) { list.innerHTML = '<div class="empty-tip">保密柜为空</div>'; return; }
    const typeIcons = { diary: '📖', todo: '✓', note: '📝' };
    list.innerHTML = items.map(v => {
        let title = v.title;
        try { title = vaultKey ? CryptoJS.AES.decrypt(v.title, vaultKey).toString(CryptoJS.enc.Utf8) : '🔒 加密内容'; } catch(e) { title = '🔒 加密内容'; }
        return `<div class="vault-item" onclick="editVault('${v.id}')">
            <span class="vault-item-icon">${typeIcons[v.type]||'📝'}</span>
            <div class="vault-item-info"><h3>${title}</h3><p>${relTime(v.createdAt)}</p></div>
            <span class="vault-item-del" onclick="delVault(event,'${v.id}')">✕</span></div>`;
    }).join('');
}
async function setupVault() {
    const pw = document.getElementById('vault-setup-password').value;
    const cf = document.getElementById('vault-setup-confirm').value;
    if (pw.length < 4) { document.getElementById('vault-setup-error').textContent = '密码至少4位'; return; }
    if (pw !== cf) { document.getElementById('vault-setup-error').textContent = '两次密码不一致，请重新输入'; return; }
    try {
        await api('/api/vault/setup', 'POST', { vaultPassword: pw });
        vaultKey = pw; vaultUnlocked = true;
        document.getElementById('vault-setup-error').textContent = '';
        renderVaultState();
    } catch(e) { document.getElementById('vault-setup-error').textContent = '设置失败'; }
}
async function unlockVault() {
    const pw = document.getElementById('vault-unlock-password').value;
    try {
        await api('/api/vault/verify', 'POST', { vaultPassword: pw });
        vaultKey = pw; vaultUnlocked = true;
        document.getElementById('vault-unlock-error').textContent = '';
        document.getElementById('vault-unlock-password').value = '';
        await loadData();
        renderVaultState();
    } catch(e) { document.getElementById('vault-unlock-error').textContent = '密码错误'; }
}
function lockVault() { vaultUnlocked = false; vaultKey = ''; renderVaultState(); }

// ====== Vault Reset ======
document.getElementById('vault-forgot-link').addEventListener('click', () => {
    document.getElementById('vault-reset-modal').classList.remove('hidden');
    document.getElementById('vault-reset-confirm-input').value = '';
    document.getElementById('vault-reset-error').textContent = '';
});
document.getElementById('vault-reset-close').addEventListener('click', () => document.getElementById('vault-reset-modal').classList.add('hidden'));
document.getElementById('vault-reset-cancel').addEventListener('click', () => document.getElementById('vault-reset-modal').classList.add('hidden'));

document.getElementById('vault-reset-confirm-btn').addEventListener('click', async () => {
    const loginPassword = document.getElementById('vault-reset-confirm-input').value;
    if (!loginPassword) { document.getElementById('vault-reset-error').textContent = '请输入登录密码以确认'; return; }
    
    const me = await api('/api/me');
    try {
        const verifyRes = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: me.username, password: loginPassword })
        });
        const verifyData = await verifyRes.json();
        if (verifyData.error) { document.getElementById('vault-reset-error').textContent = '登录密码错误'; return; }
    } catch(e) { document.getElementById('vault-reset-error').textContent = '验证失败'; return; }
    
    try {
        const res = await api('/api/vault/reset', 'POST', {});
        if (res.error) { document.getElementById('vault-reset-error').textContent = res.error; return; }
        document.getElementById('vault-reset-modal').classList.add('hidden');
        vaultUnlocked = false;
        vaultKey = '';
        await loadData();
        renderVaultState();
        alert('保密柜已重置，所有加密内容已清除。请设置新的保密柜密码。');
    } catch(e) { document.getElementById('vault-reset-error').textContent = '重置失败'; }
});

function addVaultItem() {
    const type = document.getElementById('vault-type').value;
    const title = document.getElementById('vault-title').value.trim();
    if (!title) return;
    const encTitle = CryptoJS.AES.encrypt(title, vaultKey).toString();
    const encContent = CryptoJS.AES.encrypt('', vaultKey).toString();
    data.vault.push({ id: uid(), type, title: encTitle, content: encContent, createdAt: new Date().toISOString() });
    document.getElementById('vault-title').value = '';
    saveData(); renderVaultList();
}
function editVault(id) {
    const v = (data.vault || []).find(x => x.id === id); if (!v) return;
    editingVaultId = id;
    let title = '', content = '';
    try { title = CryptoJS.AES.decrypt(v.title, vaultKey).toString(CryptoJS.enc.Utf8); } catch(e) {}
    try { content = CryptoJS.AES.decrypt(v.content, vaultKey).toString(CryptoJS.enc.Utf8); } catch(e) {}
    document.getElementById('vault-edit-title').value = title;
    document.getElementById('vault-edit-content').value = content;
    document.getElementById('vault-modal').classList.remove('hidden');
}
function saveVaultItem() {
    const v = (data.vault || []).find(x => x.id === editingVaultId); if (!v) return;
    const title = document.getElementById('vault-edit-title').value.trim() || '无标题';
    const content = document.getElementById('vault-edit-content').value;
    v.title = CryptoJS.AES.encrypt(title, vaultKey).toString();
    v.content = CryptoJS.AES.encrypt(content, vaultKey).toString();
    saveData(); renderVaultList();
    document.getElementById('vault-modal').classList.add('hidden');
}
function delVault(e, id) { e.stopPropagation(); data.vault = data.vault.filter(v => v.id !== id); saveData(); renderVaultList(); }

// ====== Admin ======
async function renderAdmin() {
    try {
        const stats = await api('/api/admin/stats');
        document.getElementById('admin-cards').innerHTML = `
            <div class="stat-card"><div class="num">${stats.totalUsers}</div><div class="label">总用户数</div></div>
            <div class="stat-card success"><div class="num">${stats.activeToday}</div><div class="label">今日活跃</div></div>
            <div class="stat-card warning"><div class="num">${stats.activeWeek}</div><div class="label">本周活跃</div></div>
            <div class="stat-card"><div class="num">${stats.newToday}</div><div class="label">今日新增</div></div>`;
        
        // Render pending password reset requests
        const reqList = document.getElementById('admin-requests-list');
        if (stats.pendingRequests && stats.pendingRequests.length > 0) {
            reqList.innerHTML = stats.pendingRequests.map(r => `
                <div class="admin-request-item">
                    <div>
                        <span class="req-username">${r.username}</span>
                        <div class="req-time">提交于 ${relTime(r.createdAt)}</div>
                    </div>
                    <button class="admin-reset-btn" onclick="adminResetPassword('${r.username}')">批准重置</button>
                </div>`).join('');
        } else {
            reqList.innerHTML = '<div class="empty-tip" style="padding:16px 0">暂无重置请求</div>';
        }
        
        const now = Date.now();
        const sortedUsers = [...stats.users].sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));
        document.getElementById('admin-user-list').innerHTML = sortedUsers.map(u => {
            const active = (now - new Date(u.lastActive).getTime()) < 86400000;
            return `<div class="admin-user-row">
                <span class="admin-username">${u.username}</span>
                <span class="admin-status ${active?'active':'inactive'}">${active?'活跃':'不活跃'}</span>
                <span class="admin-time">上次: ${relTime(u.lastActive)}</span>
                <button class="admin-reset-btn" onclick="adminResetPassword('${u.username}')">批准重置</button></div>`;
        }).join('');
    } catch(e) {}
}

// ====== Render All ======
function renderAll() {
    renderTodos(); renderTimers(); renderGoals(); renderCountdowns(); renderDiaries();
}

// ====== Navigation ======
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        document.getElementById('page-' + btn.dataset.page).classList.remove('hidden');
        if (btn.dataset.page === 'stats') renderStats();
        if (btn.dataset.page === 'vault') renderVaultState();
        if (btn.dataset.page === 'admin') renderAdmin();
    });
});

document.querySelectorAll('#todo-filters .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => { document.querySelectorAll('#todo-filters .filter-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active'); currentFilter = tab.dataset.filter; renderTodos(); });
});
document.querySelectorAll('#timer-filters .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => { document.querySelectorAll('#timer-filters .filter-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active'); currentTimerFilter = tab.dataset.filter; renderTimers(); });
});
document.querySelectorAll('#stats-filters .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => { document.querySelectorAll('#stats-filters .filter-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active'); currentStatsRange = tab.dataset.statsRange; renderStats(); });
});
document.querySelectorAll('.vault-tab').forEach(tab => {
    tab.addEventListener('click', () => { document.querySelectorAll('.vault-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active'); currentVaultFilter = tab.dataset.vaultFilter; renderVaultList(); });
});

// ====== Event Bindings ======
document.getElementById('todo-add-btn').addEventListener('click', addTodo);
document.getElementById('todo-input').addEventListener('keypress', e => { if (e.key === 'Enter') addTodo(); });
document.getElementById('timer-add-btn').addEventListener('click', addTimer);
document.getElementById('goal-add-btn').addEventListener('click', addGoal);
document.getElementById('cd-add-btn').addEventListener('click', addCountdown);
document.getElementById('diary-add-btn').addEventListener('click', addDiary);
document.getElementById('diary-modal-close').addEventListener('click', () => document.getElementById('diary-modal').classList.add('hidden'));
document.getElementById('diary-save-btn').addEventListener('click', saveDiary);
document.getElementById('vault-setup-btn').addEventListener('click', setupVault);
document.getElementById('vault-unlock-btn').addEventListener('click', unlockVault);
document.getElementById('vault-lock-btn').addEventListener('click', lockVault);
document.getElementById('vault-add-btn').addEventListener('click', addVaultItem);
document.getElementById('vault-modal-close').addEventListener('click', () => document.getElementById('vault-modal').classList.add('hidden'));
document.getElementById('vault-edit-save-btn').addEventListener('click', saveVaultItem);
document.getElementById('vault-delete-btn').addEventListener('click', () => { data.vault = data.vault.filter(v => v.id !== editingVaultId); saveData(); renderVaultList(); document.getElementById('vault-modal').classList.add('hidden'); });

// ====== Init ======
checkAuth();
setInterval(() => { renderTimers(); }, 1000);
setInterval(() => { if (token) { loadData().then(renderAll); } }, 10000);

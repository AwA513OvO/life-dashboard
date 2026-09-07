let data = { todos: [], timers: [], goals: [], countdowns: [], diaries: [] };
let currentFilter = 'all';
let currentTimerFilter = 'all';
let currentStatsRange = 'day';
let editingDiaryId = null;

async function loadData() {
    try {
        const res = await fetch('/api/data');
        data = await res.json();
    } catch(e) { console.error(e); }
}

async function saveData() {
    try {
        await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch(e) { console.error(e); }
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function fmtDate(d) {
    const dt = new Date(d);
    return `${dt.getMonth()+1}月${dt.getDate()}日`;
}

function relTime(d) {
    const diff = Date.now() - new Date(d).getTime();
    const day = Math.floor(diff / 86400000);
    if (day === 0) return '今天';
    if (day === 1) return '昨天';
    if (day === 2) return '前天';
    if (day < 30) return `${day}天前`;
    return fmtDate(d);
}

// ====== 待办清单 ======
function renderTodos() {
    const list = document.getElementById('todo-list');
    let items = data.todos;
    if (currentFilter === 'active') items = items.filter(t => !t.done);
    if (currentFilter === 'done') items = items.filter(t => t.done);
    if (items.length === 0) { list.innerHTML = '<div class="empty-tip">暂无待办事项</div>'; }
    else {
        list.innerHTML = items.map(t => `
            <div class="todo-item ${t.done?'done':''} ${t.priority}">
                <div class="todo-check ${t.done?'done':''}" onclick="toggleTodo('${t.id}')">${t.done?'✓':''}</div>
                <div style="flex:1">
                    <div class="todo-text ${t.done?'done':''}">${t.text}</div>
                    <div class="todo-meta"><span>${t.category}</span><span>${t.priority==='high'?'高':t.priority==='mid'?'中':'低'}</span></div>
                </div>
                <span class="todo-del" onclick="delTodo('${t.id}')">✕</span>
            </div>`).join('');
    }
    const total = data.todos.length;
    const done = data.todos.filter(t => t.done).length;
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

function toggleTodo(id) {
    const t = data.todos.find(t => t.id === id);
    if (t) { t.done = !t.done; t.completedAt = t.done ? new Date().toISOString() : null; saveData(); renderTodos(); }
}

function delTodo(id) {
    data.todos = data.todos.filter(t => t.id !== id);
    saveData(); renderTodos();
}

// ====== 计时器 ======
function renderTimers() {
    const list = document.getElementById('timer-list');
    let items = data.timers;
    if (currentTimerFilter !== 'all') items = items.filter(t => t.direction === currentTimerFilter);
    if (items.length === 0) { list.innerHTML = '<div class="empty-tip">暂无计时器</div>'; return; }
    list.innerHTML = items.map(t => {
        const target = new Date(t.date).getTime();
        const now = Date.now();
        let diff = t.direction === 'countdown' ? target - now : now - target;
        const expired = diff <= 0;
        if (expired && t.direction === 'countdown') diff = 0;
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        return `<div class="timer-item" style="position:relative;border-left:3px solid ${t.color}">
            <span class="timer-del" onclick="delTimer('${t.id}')">✕</span>
            <span class="timer-tag ${t.direction}">${t.direction==='countdown'?'倒计时':'正向'}</span>
            <h3>${t.title}</h3>
            <div class="timer-display ${expired?'timer-expired':''}">${d}<span class="unit">天</span> ${h}<span class="unit">时</span> ${m}<span class="unit">分</span> ${s}<span class="unit">秒</span></div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">${fmtDate(t.date)}</div>
        </div>`;
    }).join('');
}

function addTimer() {
    const title = document.getElementById('timer-input').value.trim();
    const date = document.getElementById('timer-date').value;
    if (!title || !date) return;
    data.timers.push({ id: uid(), title, date, direction: document.getElementById('timer-direction').value, color: document.getElementById('timer-color').value });
    document.getElementById('timer-input').value = '';
    document.getElementById('timer-date').value = '';
    saveData(); renderTimers();
}

function delTimer(id) {
    data.timers = data.timers.filter(t => t.id !== id);
    saveData(); renderTimers();
}

// ====== 目标 ======
function renderGoals() {
    const list = document.getElementById('goal-list');
    if (data.goals.length === 0) { list.innerHTML = '<div class="empty-tip">暂无目标</div>'; return; }
    list.innerHTML = data.goals.map(g => {
        const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline) - new Date()) / 86400000) : null;
        return `<div class="goal-item">
            <h3>${g.title}</h3>
            ${g.desc ? `<p>${g.desc}</p>` : ''}
            <input type="range" class="goal-slider" min="0" max="100" value="${g.progress}" oninput="updateGoalProgress('${g.id}',this.value)" />
            <div class="goal-progress"><span>${g.progress}%</span>${daysLeft!==null ? `<span class="goal-deadline">${daysLeft>0?'剩'+daysLeft+'天':daysLeft===0?'今天到期':'已过期'+Math.abs(daysLeft)+'天'}</span>`:''}</div>
            <span class="todo-del" onclick="delGoal('${g.id}')" style="position:absolute;right:12px;top:8px">✕</span>
        </div>`;
    }).join('');
}

function addGoal() {
    const title = document.getElementById('goal-input').value.trim();
    if (!title) return;
    data.goals.push({ id: uid(), title, desc: document.getElementById('goal-desc').value, deadline: document.getElementById('goal-deadline').value, progress: 0 });
    document.getElementById('goal-input').value = '';
    document.getElementById('goal-desc').value = '';
    document.getElementById('goal-deadline').value = '';
    saveData(); renderGoals();
}

function updateGoalProgress(id, val) {
    const g = data.goals.find(g => g.id === id);
    if (g) { g.progress = parseInt(val); saveData(); renderGoals(); }
}

function delGoal(id) {
    data.goals = data.goals.filter(g => g.id !== id);
    saveData(); renderGoals();
}

// ====== 倒数日 ======
function renderCountdowns() {
    const list = document.getElementById('countdown-list');
    if (data.countdowns.length === 0) { list.innerHTML = '<div class="empty-tip">暂无倒数日</div>'; return; }
    const sorted = [...data.countdowns].sort((a,b) => {
        const da = Math.abs(new Date(a.date) - new Date());
        const db = Math.abs(new Date(b.date) - new Date());
        return da - db;
    });
    list.innerHTML = sorted.map(c => {
        const diff = Math.floor(Math.abs(new Date(c.date) - new Date()) / 86400000);
        return `<div class="countdown-item">
            <span class="countdown-emoji">${c.emoji || '📅'}</span>
            <div class="countdown-info">
                <h3>${c.title}</h3>
                <p>${fmtDate(c.date)} · ${c.mode==='until'?'距今还有':'已经过了'}</p>
            </div>
            <span class="countdown-days">${diff}</span>
            <span class="todo-del" onclick="delCountdown('${c.id}')">✕</span>
        </div>`;
    }).join('');
}

function addCountdown() {
    const title = document.getElementById('cd-input').value.trim();
    const date = document.getElementById('cd-date').value;
    if (!title || !date) return;
    data.countdowns.push({ id: uid(), title, date, mode: document.getElementById('cd-mode').value, emoji: document.getElementById('cd-emoji').value });
    document.getElementById('cd-input').value = '';
    document.getElementById('cd-date').value = '';
    saveData(); renderCountdowns();
}

function delCountdown(id) {
    data.countdowns = data.countdowns.filter(c => c.id !== id);
    saveData(); renderCountdowns();
}

// ====== 统计 ======
function getStatsRangeStart(range) {
    const now = new Date();
    const start = new Date(now);
    if (range === 'day') start.setHours(0,0,0,0);
    else if (range === 'week') { start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0); }
    else if (range === 'month') { start.setDate(1); start.setHours(0,0,0,0); }
    else if (range === 'year') { start.setMonth(0,1); start.setHours(0,0,0,0); }
    return start;
}

function renderStats() {
    const start = getStatsRangeStart(currentStatsRange);
    const startMs = start.getTime();
    const todosInRange = data.todos.filter(t => new Date(t.createdAt) >= startMs);
    const doneInRange = todosInRange.filter(t => t.done);
    const diariesInRange = data.diaries.filter(d => new Date(d.date) >= startMs);
    const goalsDone = data.goals.filter(g => g.progress >= 100).length;

    document.getElementById('stats-cards').innerHTML = `
        <div class="stat-card"><div class="num">${todosInRange.length}</div><div class="label">待办总数</div></div>
        <div class="stat-card success"><div class="num">${doneInRange.length}</div><div class="label">已完成</div></div>
        <div class="stat-card warning"><div class="num">${todosInRange.length - doneInRange.length}</div><div class="label">待完成</div></div>
        <div class="stat-card"><div class="num">${todosInRange.length ? Math.round(doneInRange.length/todosInRange.length*100)+'%' : '0%'}</div><div class="label">完成率</div></div>`;

    const cats = {};
    todosInRange.forEach(t => { cats[t.category] = (cats[t.category]||0) + 1; });
    const catColors = { '工作':'#6366f1', '生活':'#22c55e', '学习':'#f59e0b', '其他':'#888' };
    document.getElementById('stats-category').innerHTML = `<h3>分类统计</h3>` +
        Object.entries(cats).map(([name, count]) => `<div class="stat-row"><span class="name">${name}</span><div class="bar"><div class="bar-fill" style="width:${count/todosInRange.length*100}%;background:${catColors[name]||'#888'}"></div></div><span class="val">${count}</span></div>`).join('') || '<div class="empty-tip">暂无数据</div>';

    const pris = { high: 0, mid: 0, low: 0 };
    todosInRange.forEach(t => pris[t.priority]++);
    document.getElementById('stats-priority').innerHTML = `<h3>优先级分布</h3>
        <div class="stat-row"><span class="name">高</span><div class="bar"><div class="bar-fill" style="width:${todosInRange.length?pris.high/todosInRange.length*100:0}%;background:var(--danger)"></div></div><span class="val">${pris.high}</span></div>
        <div class="stat-row"><span class="name">中</span><div class="bar"><div class="bar-fill" style="width:${todosInRange.length?pris.mid/todosInRange.length*100:0}%;background:var(--warning)"></div></div><span class="val">${pris.mid}</span></div>
        <div class="stat-row"><span class="name">低</span><div class="bar"><div class="bar-fill" style="width:${todosInRange.length?pris.low/todosInRange.length*100:0}%;background:var(--success)"></div></div><span class="val">${pris.low}</span></div>`;

    const avgProgress = data.goals.length ? Math.round(data.goals.reduce((s,g) => s + g.progress, 0) / data.goals.length) : 0;
    document.getElementById('stats-goals').innerHTML = `<h3>目标概览</h3>
        <div class="stat-row"><span class="name">已完成</span><div class="bar"><div class="bar-fill" style="width:${data.goals.length?goalsDone/data.goals.length*100:0}%;background:var(--success)"></div></div><span class="val">${goalsDone}</span></div>
        <div class="stat-row"><span class="name">总数</span><div class="bar"><div class="bar-fill" style="width:100%;background:var(--border)"></div></div><span class="val">${data.goals.length}</span></div>
        <div class="stat-row"><span class="name">平均进度</span><div class="bar"><div class="bar-fill" style="width:${avgProgress}%;background:var(--primary)"></div></div><span class="val">${avgProgress}%</span></div>`;

    document.getElementById('stats-diaries').innerHTML = `<h3>日记统计</h3>
        <div class="stat-row"><span class="name">已写</span><div class="bar"><div class="bar-fill" style="width:100%;background:var(--primary-light)"></div></div><span class="val">${diariesInRange.length}</span></div>`;
}

// ====== 日记 ======
function renderDiaries() {
    const list = document.getElementById('diary-list');
    if (data.diaries.length === 0) { list.innerHTML = '<div class="empty-tip">暂无日记</div>'; return; }
    const sorted = [...data.diaries].sort((a,b) => new Date(b.date) - new Date(a.date));
    list.innerHTML = sorted.map(d => `
        <div class="diary-item" onclick="editDiary('${d.id}')">
            <h3>${d.emoji || ''} ${d.title}</h3>
            <div class="diary-meta"><span>${relTime(d.date)}</span></div>
            <div class="diary-preview">${(d.content || '').slice(0, 80)}</div>
        </div>`).join('');
}

function addDiary() {
    const title = document.getElementById('diary-title').value.trim();
    if (!title) return;
    const diary = { id: uid(), title, date: document.getElementById('diary-date').value || new Date().toISOString().slice(0,10), emoji: document.getElementById('diary-mood').value, content: '' };
    data.diaries.push(diary);
    document.getElementById('diary-title').value = '';
    saveData(); renderDiaries();
    editDiary(diary.id);
}

function editDiary(id) {
    const d = data.diaries.find(x => x.id === id);
    if (!d) return;
    editingDiaryId = id;
    document.getElementById('diary-edit-title').value = d.title;
    document.getElementById('diary-edit-date').value = d.date;
    document.getElementById('diary-edit-mood').value = d.emoji || '😊';
    document.getElementById('diary-edit-content').value = d.content || '';
    document.getElementById('diary-modal').classList.remove('hidden');
}

function saveDiary() {
    const d = data.diaries.find(x => x.id === editingDiaryId);
    if (d) {
        d.title = document.getElementById('diary-edit-title').value.trim() || '无标题';
        d.date = document.getElementById('diary-edit-date').value;
        d.emoji = document.getElementById('diary-edit-mood').value;
        d.content = document.getElementById('diary-edit-content').value;
        saveData(); renderDiaries();
    }
    document.getElementById('diary-modal').classList.add('hidden');
}

function delDiary(id) {
    data.diaries = data.diaries.filter(d => d.id !== id);
    saveData(); renderDiaries();
}

// ====== 页面切换 ======
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        document.getElementById('page-' + btn.dataset.page).classList.remove('hidden');
        if (btn.dataset.page === 'stats') renderStats();
    });
});

document.querySelectorAll('#todo-filters .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('#todo-filters .filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        renderTodos();
    });
});

document.querySelectorAll('#timer-filters .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('#timer-filters .filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTimerFilter = tab.dataset.filter;
        renderTimers();
    });
});

document.querySelectorAll('#stats-filters .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('#stats-filters .filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentStatsRange = tab.dataset.statsRange;
        renderStats();
    });
});

document.getElementById('todo-add-btn').addEventListener('click', addTodo);
document.getElementById('todo-input').addEventListener('keypress', e => { if (e.key === 'Enter') addTodo(); });
document.getElementById('timer-add-btn').addEventListener('click', addTimer);
document.getElementById('goal-add-btn').addEventListener('click', addGoal);
document.getElementById('cd-add-btn').addEventListener('click', addCountdown);
document.getElementById('diary-add-btn').addEventListener('click', addDiary);
document.getElementById('diary-modal-close').addEventListener('click', () => document.getElementById('diary-modal').classList.add('hidden'));
document.getElementById('diary-save-btn').addEventListener('click', saveDiary);

// ====== 初始化 ======
async function init() {
    await loadData();
    document.getElementById('diary-date').value = new Date().toISOString().slice(0,10);
    renderTodos();
    renderTimers();
    renderGoals();
    renderCountdowns();
    renderDiaries();
    setInterval(() => { renderTimers(); }, 1000);
    setInterval(() => { loadData().then(() => { renderTodos(); renderTimers(); renderGoals(); renderCountdowns(); renderDiaries(); }); }, 10000);
}
init();


let schedule = {};
let resources = [];
let settings = {};
let exams = {};
let deferredPrompt = null;
let currentDate = localStorage.getItem("reviseflow_current_date");
let activeTab = localStorage.getItem("reviseflow_active_tab") || "home";
let currentMonth = null;
let supabase = null;
let currentUser = null;
const completed = JSON.parse(localStorage.getItem("reviseflow_completed") || "{}");

async function loadData(){
  const [scheduleRes, resourcesRes, settingsRes] = await Promise.all([
    fetch("./schedule.json"),
    fetch("./resources.json"),
    fetch("./settings.json")
  ]);
  schedule = await scheduleRes.json();
  resources = await resourcesRes.json();
  settings = await settingsRes.json();
  exams = settings.exams || {};
  document.title = settings.appName || "ReviseFlow";
  document.getElementById("appTitle").textContent = settings.appName || "ReviseFlow";
  document.getElementById("appSubtitle").textContent = settings.tagline || "Daily checklist and calendar";
  document.querySelector('meta[name="theme-color"]').setAttribute("content", settings.themeColor || "#0a0a0b");
  if (settings.supabaseUrl && settings.supabaseAnonKey) {
    supabase = window.supabase.createClient(settings.supabaseUrl, settings.supabaseAnonKey);
  }
  const todayIso = new Date().toISOString().slice(0,10);
  if (!currentDate || !schedule[currentDate]) currentDate = schedule[todayIso] ? todayIso : settings.startDate;
  currentDate = clampDate(currentDate);
  currentMonth = currentDate.slice(0,7);
}

function saveLocal(){
  localStorage.setItem("reviseflow_completed", JSON.stringify(completed));
  localStorage.setItem("reviseflow_current_date", currentDate);
  localStorage.setItem("reviseflow_active_tab", activeTab);
}
function clampDate(ds){
  if (ds < settings.startDate) return settings.startDate;
  if (ds > settings.endDate) return settings.endDate;
  return ds;
}
function prettyDate(ds){
  const dt = new Date(ds + "T12:00:00");
  return dt.toLocaleDateString(undefined, {weekday:"long", day:"numeric", month:"long", year:"numeric"});
}
function monthLabel(ym){
  const dt = new Date(ym + "-01T12:00:00");
  return dt.toLocaleDateString(undefined, {month:"long", year:"numeric"});
}
function taskId(ds, idx){ return ds + "__" + idx; }
function isDone(ds, idx){ return !!completed[taskId(ds, idx)]; }

async function setCompleted(ds, idx, value){
  const id = taskId(ds, idx);
  completed[id] = value;
  saveLocal();
  render();
  if (currentUser && supabase) {
    await supabase.from("progress").upsert({
      user_id: currentUser.id,
      task_id: id,
      completed: value
    });
    setSyncStatus("Cloud synced");
  }
}

async function toggleDone(ds, idx){
  await setCompleted(ds, idx, !isDone(ds, idx));
}

function allDates(){ return Object.keys(schedule).sort(); }
function shiftDay(ds, amount){
  const dt = new Date(ds + "T12:00:00");
  dt.setDate(dt.getDate() + amount);
  return clampDate(dt.toISOString().slice(0,10));
}
function carryOverTasks(ds){
  const items = [];
  for (const d of allDates()){
    if (d >= ds) break;
    (schedule[d] || []).forEach((task, idx) => {
      if (!isDone(d, idx)) items.push({date: d, idx, task});
    });
  }
  return items.slice(-8);
}
function examMeta(ds){ return exams[ds] || []; }
function progressForDate(ds){
  const tasks = schedule[ds] || [];
  const done = tasks.filter((t, idx) => isDone(ds, idx)).length;
  return {done, total: tasks.length, pct: tasks.length ? Math.round(done * 100 / tasks.length) : 0};
}
function subjectCountLabel(ds){
  const tasks = schedule[ds] || [];
  const subjects = [...new Set(tasks.map(t => t.subject))];
  return subjects.length + " subjects";
}
function renderTaskList(container, items, mode="main"){
  if (!items.length){
    container.innerHTML = `<div class="empty">Nothing here right now.</div>`;
    return;
  }
  container.innerHTML = items.map((item, idx) => {
    const task = mode === "main" ? item : item.task;
    const ds = mode === "main" ? currentDate : item.date;
    const taskIdx = mode === "main" ? idx : item.idx;
    const done = isDone(ds, taskIdx);
    const klass = `task ${done ? "done" : ""} ${mode === "carry" ? "carry" : ""}`;
    const origin = mode === "carry" ? `<div class="miniLabel">From ${prettyDate(item.date)}</div>` : ``;
    return `
      <div class="${klass}">
        <div class="taskTop">
          <div>
            <div class="subject">${task.subject}</div>
            <div class="taskTitle">${task.title}</div>
          </div>
          <div class="miniLabel">${task.duration || ""}</div>
        </div>
        ${origin}
        <div class="taskDetails">${task.details || ""}</div>
        <div class="taskActions">
          <button class="small" onclick="toggleDone('${ds}', ${taskIdx})">${done ? "Untick" : "Tick complete"}</button>
        </div>
      </div>
    `;
  }).join("");
}
function renderHome(){
  const todayIso = new Date().toISOString().slice(0,10);
  document.getElementById("homeDateTag").textContent = currentDate === todayIso ? "Today" : "Selected day";
  document.getElementById("homeDateTitle").textContent = prettyDate(currentDate);
  const ex = examMeta(currentDate);
  document.getElementById("homeMeta").innerHTML = `
    <div class="pill">${subjectCountLabel(currentDate)}</div>
    <div class="pill">${ex.length ? ex.length + " exam item" + (ex.length > 1 ? "s" : "") : "Revision day"}</div>`;
  const prog = progressForDate(currentDate);
  document.getElementById("progressText").textContent = `${prog.done} of ${prog.total} tasks done`;
  document.getElementById("progressFill").style.width = prog.pct + "%";
  renderTaskList(document.getElementById("todayTasks"), schedule[currentDate] || [], "main");
  renderTaskList(document.getElementById("carryTasks"), carryOverTasks(currentDate), "carry");
  document.getElementById("linksBox").innerHTML = resources.map(r => `
    <div class="linkCard">
      <div class="subject">${r.name}</div>
      <div style="font-weight:700; margin:5px 0 6px;">${r.label}</div>
      <a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.url}</a>
    </div>`).join("");
}
function monthBounds(ym){
  const start = new Date(ym + "-01T12:00:00");
  const end = new Date(start); end.setMonth(end.getMonth() + 1); end.setDate(0);
  return {start, end};
}
function renderCalendar(){
  document.getElementById("monthTitle").textContent = monthLabel(currentMonth);
  const grid = document.getElementById("calendarGrid");
  const bounds = monthBounds(currentMonth);
  const start = bounds.start;
  const firstDow = (start.getDay() + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - firstDow);
  const todayIso = new Date().toISOString().slice(0,10);
  const cells = [];
  for (let i = 0; i < 42; i++){
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const ds = d.toISOString().slice(0,10);
    const inMonth = ds.slice(0,7) === currentMonth;
    const selected = ds === currentDate;
    const today = ds === todayIso;
    const ex = examMeta(ds);
    const tasks = schedule[ds] || [];
    const prog = progressForDate(ds);
    const dots = [];
    if (ex.length) dots.push(`<span class="miniDot" style="background: var(--amber);"></span>`);
    if (tasks.length) dots.push(`<span class="miniDot"></span>`);
    if (prog.total && prog.done === prog.total) dots.push(`<span class="miniDot" style="background: var(--green);"></span>`);
    cells.push(`
      <button class="dayCell ${inMonth ? "" : "other"} ${selected ? "selected" : ""} ${today ? "today" : ""}" onclick="selectDate('${ds}')">
        <div class="dayNum">${d.getDate()}</div>
        <div class="miniDots">${dots.join("")}</div>
        <div class="miniLabel">${ex.length ? "Exam" : tasks.length ? prog.done + "/" + prog.total : ""}</div>
      </button>`);
  }
  grid.innerHTML = cells.join("");
  renderSelectedDate();
}
function renderSelectedDate(){
  document.getElementById("selectedDateTitle").textContent = prettyDate(currentDate);
  const ex = examMeta(currentDate);
  document.getElementById("selectedExamPills").innerHTML =
    ex.length ? ex.map(e => `<div class="pill">${e.title}</div>`).join("") : `<div class="pill">No exam on this date</div>`;
  renderTaskList(document.getElementById("selectedTasks"), schedule[currentDate] || [], "main");
}
function selectDate(ds){
  currentDate = clampDate(ds);
  currentMonth = currentDate.slice(0,7);
  saveLocal();
  render();
}
function showTab(tab){
  activeTab = tab;
  document.getElementById("homePage").classList.toggle("active", tab === "home");
  document.getElementById("calendarPage").classList.toggle("active", tab === "calendar");
  document.getElementById("homeTabBtn").classList.toggle("active", tab === "home");
  document.getElementById("calendarTabBtn").classList.toggle("active", tab === "calendar");
  saveLocal();
}
function render(){
  renderHome();
  renderCalendar();
  showTab(activeTab);
}
function setSyncStatus(text){
  document.getElementById("syncStatus").textContent = text;
}
function setUserStatus(text){
  document.getElementById("userStatus").textContent = text;
}
function showApp(){
  document.getElementById("authView").classList.add("hidden");
  document.getElementById("appView").classList.remove("hidden");
}
function showAuth(){
  document.getElementById("authView").classList.remove("hidden");
  document.getElementById("appView").classList.add("hidden");
}
function authMessage(msg){
  const el = document.getElementById("authMessage");
  el.style.display = "block";
  el.textContent = msg;
}
async function loadCloudProgress(){
  if (!currentUser || !supabase) return;
  setSyncStatus("Syncing...");
  const { data, error } = await supabase.from("progress").select("task_id, completed").eq("user_id", currentUser.id);
  if (error) {
    setSyncStatus("Cloud sync error");
    return;
  }
  for (const row of data || []) {
    completed[row.task_id] = row.completed;
  }
  saveLocal();
  setSyncStatus("Cloud synced");
}
async function handleSession(){
  if (!supabase) {
    showApp();
    setSyncStatus("Local mode");
    setUserStatus("No backend");
    document.getElementById("logoutBtn").classList.add("hidden");
    render();
    return;
  }
  const { data } = await supabase.auth.getSession();
  currentUser = data.session?.user || null;
  if (currentUser) {
    showApp();
    setUserStatus(currentUser.email || "Signed in");
    document.getElementById("logoutBtn").classList.remove("hidden");
    await loadCloudProgress();
    render();
  } else {
    showAuth();
  }
}
async function signUp(){
  const email = document.getElementById("emailInput").value.trim();
  const password = document.getElementById("passwordInput").value.trim();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) authMessage(error.message);
  else authMessage("Account created. If Supabase asks for email confirmation, confirm it first, then sign in.");
}
async function signIn(){
  const email = document.getElementById("emailInput").value.trim();
  const password = document.getElementById("passwordInput").value.trim();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) authMessage(error.message);
}
async function signOut(){
  await supabase.auth.signOut();
  currentUser = null;
  showAuth();
}
function bindUI(){
  document.getElementById("todayBtn").addEventListener("click", () => {
    const todayIso = new Date().toISOString().slice(0,10);
    selectDate(schedule[todayIso] ? todayIso : settings.startDate);
  });
  document.getElementById("prevDayBtn").addEventListener("click", () => selectDate(shiftDay(currentDate, -1)));
  document.getElementById("nextDayBtn").addEventListener("click", () => selectDate(shiftDay(currentDate, 1)));
  document.getElementById("homePrevBtn").addEventListener("click", () => selectDate(shiftDay(currentDate, -1)));
  document.getElementById("homeNextBtn").addEventListener("click", () => selectDate(shiftDay(currentDate, 1)));
  document.getElementById("prevMonthBtn").addEventListener("click", () => {
    const d = new Date(currentMonth + "-01T12:00:00"); d.setMonth(d.getMonth() - 1); currentMonth = d.toISOString().slice(0,7); renderCalendar();
  });
  document.getElementById("nextMonthBtn").addEventListener("click", () => {
    const d = new Date(currentMonth + "-01T12:00:00"); d.setMonth(d.getMonth() + 1); currentMonth = d.toISOString().slice(0,7); renderCalendar();
  });
  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("Clear all ticked tasks?")) return;
    localStorage.removeItem("reviseflow_completed");
    for (const k in completed) delete completed[k];
    saveLocal();
    render();
  });
  document.getElementById("homeTabBtn").addEventListener("click", () => showTab("home"));
  document.getElementById("calendarTabBtn").addEventListener("click", () => showTab("calendar"));
  document.getElementById("guestBtn").addEventListener("click", () => {
    showApp();
    setSyncStatus("Local mode");
    setUserStatus("Signed out");
    render();
  });
  document.getElementById("signUpBtn").addEventListener("click", signUp);
  document.getElementById("signInBtn").addEventListener("click", signIn);
  document.getElementById("logoutBtn").addEventListener("click", signOut);
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById("installBtn").style.display = "inline-block";
  });
  document.getElementById("installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById("installBtn").style.display = "none";
  });
  if ("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  if (supabase) {
    supabase.auth.onAuthStateChange(async (_event, session) => {
      currentUser = session?.user || null;
      await handleSession();
    });
  }
  window.toggleDone = toggleDone;
  window.selectDate = selectDate;
}

async function startApp(){
  await loadData();
  bindUI();
  await handleSession();
  if (!currentUser) {
    document.getElementById("logoutBtn").classList.add("hidden");
  }
}
startApp();

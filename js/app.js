"use strict";

/* =========================
   1. 基本資料與日期工具
========================= */

const page = document.body.dataset.page || "home";
const app = document.getElementById("app");
const toastElement = document.getElementById("toast");

const PAGES = {
  home: {
    title: "把日子，過成喜歡的樣子。",
    description: "安排重要的事，也替生活留一點空白。",
    label: "首頁",
    href: "index.html"
  },
  today: {
    title: "專注今天，慢慢完成。",
    description: "從一件小事開始，讓每一步都有自己的節奏。",
    label: "今日計劃",
    href: "today.html"
  },
  tasks: {
    title: "讓想法，有個著落。",
    description: "把腦海裡的事情寫下來，再逐一完成。",
    label: "待辦事項",
    href: "tasks.html"
  },
  settings: {
    title: "調整成，你的節奏。",
    description: "選擇適合自己的顯示方式，安排活動與用品預算。",
    label: "設定",
    href: "settings.html"
  },
  profile: {
    title: "這裡，記錄著你。",
    description: "用一張照片、一個名字，建立屬於自己的日常。",
    label: "個人主頁",
    href: "profile.html"
  }
};

const PRODUCTS = [
  { id: "none", name: "不選擇", price: 0 },
  { id: "notebook", name: "日程筆記本", price: 32 },
  { id: "pen", name: "原子筆", price: 12 },
  { id: "print", name: "生活照片沖印", price: 3 },
  { id: "sticker", name: "日程貼紙", price: 18 }
];

/*
  香港 2026 年公眾假期。
  其他年份會顯示固定日期節日，並在介面說明資料範圍。
  如需擴充年份，可在此加入 YYYY-MM-DD 對應名稱。
*/
const HOLIDAYS = {
  "2026-01-01": "元旦",
  "2026-02-17": "農曆年初一",
  "2026-02-18": "農曆年初二",
  "2026-02-19": "農曆年初三",
  "2026-04-03": "耶穌受難節",
  "2026-04-04": "受難節翌日",
  "2026-04-06": "清明節翌日",
  "2026-04-07": "復活節星期一翌日",
  "2026-05-01": "勞動節",
  "2026-05-25": "佛誕翌日",
  "2026-06-19": "端午節",
  "2026-07-01": "香港特區成立紀念日",
  "2026-09-26": "中秋節翌日",
  "2026-10-01": "國慶日",
  "2026-10-19": "重陽節翌日",
  "2026-12-25": "聖誕節",
  "2026-12-26": "聖誕節後第一個周日"
};

const FIXED_FESTIVALS = {
  "01-01": "元旦",
  "05-01": "勞動節",
  "07-01": "香港特區成立紀念日",
  "10-01": "國慶日",
  "12-25": "聖誕節"
};

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function readableDate(value) {
  return new Intl.DateTimeFormat("zh-Hant-HK", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(parseDate(value));
}

function holidayName(value) {
  if (HOLIDAYS[value]) return HOLIDAYS[value];
  if (value.startsWith("2026-")) return "";
  return FIXED_FESTIVALS[value.slice(5)] || "";
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function money(value) {
  return new Intl.NumberFormat("zh-Hant-HK", {
    style: "currency",
    currency: "HKD"
  }).format(value);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && dateKey(parseDate(value)) === value;
}

const todayKey = () => dateKey();

let selectedDate = todayKey();
let shownMonth = new Date(
  new Date().getFullYear(),
  new Date().getMonth(),
  1
);

let taskFilter = "all";
let taskSearch = "";
let db;
let data;
let saving = false;
let toastTimer;

/* =========================
   2. IndexedDB 本機儲存
========================= */

function initialData() {
  return {
    profile: {
      name: "生活記錄者",
      bio: "把重要的事記下，把平凡的日子收藏。",
      avatar: ""
    },
    preferences: {
      mondayFirst: true,
      compact: false
    },
    events: [],
    tasks: [],
    photos: {},
    budget: {
      limit: 200,
      rows: [
        { product: "notebook", quantity: 1 },
        { product: "pen", quantity: 2 },
        { product: "print", quantity: 10 }
      ]
    }
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("dayline-database", 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore("storage");
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      reject(new Error("資料庫更新被其他分頁阻擋，請關閉其他日序分頁後重試。"));
    };
  });
}

function readData() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("storage", "readonly");
    const request = transaction.objectStore("storage").get("data");

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeData() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("storage", "readwrite");
    transaction.objectStore("storage").put(data, "data");

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => {
      reject(transaction.error || new Error("儲存已中止"));
    };
  });
}

async function updateData(change, message = "已儲存") {
  if (saving) {
    toast("資料正在儲存，請稍候再試。");
    return false;
  }

  saving = true;
  const previous = structuredClone(data);

  try {
    change();
    await writeData();
    render();
    if (message) toast(message);
    return true;
  } catch (error) {
    data = previous;
    console.error(error);
    toast("儲存失敗，請檢查瀏覽器儲存空間後重試。");
    return false;
  } finally {
    saving = false;
  }
}

function toast(message) {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.classList.add("visible");
  toastTimer = setTimeout(() => {
    toastElement.classList.remove("visible");
  }, 3600);
}

/* =========================
   3. 共用畫面
========================= */

function avatarMarkup(large = false) {
  const className = `avatar${large ? " large" : ""}`;

  if (data.profile.avatar) {
    return `
      <img class="${className}"
        src="${data.profile.avatar}"
        alt="${escapeHTML(data.profile.name)}的頭像">
    `;
  }

  return `
    <span class="${className}" aria-label="預設頭像">
      ${escapeHTML(Array.from(data.profile.name)[0] || "日")}
    </span>
  `;
}

function todayStats() {
  const today = todayKey();
  const events = data.events.filter(item => item.date === today);
  const tasks = data.tasks.filter(item => item.date === today);
  const items = [...events, ...tasks];
  const done = items.filter(item => item.done).length;

  return {
    events: events.length,
    tasks: tasks.length,
    done,
    total: items.length,
    percent: items.length ? Math.round(done / items.length * 100) : 0
  };
}

function render() {
  const currentPage = PAGES[page] || PAGES.home;
  const stats = todayStats();

  document.body.classList.toggle("compact", data.preferences.compact);

  app.innerHTML = `
    <a class="skip-link" href="#main">跳到主要內容</a>

    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="index.html" aria-label="日序首頁">
          <span class="brand-mark" aria-hidden="true">日</span>
          <span>
            <strong>日序</strong>
            <small>DAYLINE</small>
          </span>
        </a>

        <nav class="navigation" aria-label="主要導航">
          ${Object.entries(PAGES).map(([key, item]) => `
            <a href="${item.href}"
              ${key === page ? 'aria-current="page"' : ""}>
              ${item.label}
            </a>
          `).join("")}
        </nav>

        <a class="header-profile" href="profile.html"
          aria-label="前往個人主頁">
          ${avatarMarkup()}
          <span>${escapeHTML(data.profile.name)}</span>
        </a>
      </div>
    </header>

    <div class="workspace">
      <aside class="sidebar" aria-label="今日摘要">
        <p class="eyebrow">A LITTLE ORDER, A LITTLE JOY</p>
        <h1>${currentPage.title}</h1>
        <p class="sidebar-intro">${currentPage.description}</p>
        ${page === "home" ? calendarMarkup() : ""}
        <section class="side-summary">
          <span class="muted">今天的生活節奏</span>
          <p class="side-date">${readableDate(todayKey())}</p>

          <div class="stats">
            <div><strong>${stats.events}</strong><span>今日行程</span></div>
            <div><strong>${stats.tasks}</strong><span>今日待辦</span></div>
            <div><strong>${stats.done}</strong><span>已經完成</span></div>
          </div>

          <div class="progress-track" role="progressbar"
            aria-label="今日完成進度"
            aria-valuemin="0" aria-valuemax="100"
            aria-valuenow="${stats.percent}">
            <div class="progress-fill"
              style="width:${stats.percent}%"></div>
          </div>

          <small>
            ${stats.total
              ? `已完成 ${stats.done} / ${stats.total} 項`
              : "今天尚未安排事項，從一個小計劃開始。"}
          </small>
        </section>

        <p class="side-note">
          不必把每一天排得滿滿的。<br>
          留一點時間，給值得記住的生活。
        </p>
      </aside>

      <main id="main" tabindex="-1">
        ${renderPage()}
      </main>
    </div>

    <footer class="site-footer">
      日序 Dayline · 資料儲存於目前瀏覽器 · VIT2621 Mini Project
    </footer>

    <dialog id="entry-dialog" aria-labelledby="dialog-title"></dialog>
  `;

  app.setAttribute("aria-busy", "false");

  if (page === "settings") updateBudgetPreview();
}

function renderPage() {
  switch (page) {
    case "today":
      return `
        <div class="page-heading">
          <div>
            <h2>今日計劃</h2>
            <p>${readableDate(todayKey())}，一步一步完成就好。</p>
          </div>
          <button class="btn primary" data-action="new-event"
            data-date="${todayKey()}">＋ 新增行程</button>
        </div>
        ${dayDetails(todayKey(), true)}
      `;

    case "tasks":
      return tasksPage();

    case "settings":
      return settingsPage();

    case "profile":
      return profilePage();

        default:
      return `
        <div class="page-heading">
          <div>
            <p class="eyebrow">YOUR DAILY SPACE</p>
            <h2>這一天的安排</h2>
            <p>從左側月曆選擇日期，整理計劃與生活記錄。</p>
          </div>

          <button
            class="btn primary"
            data-action="new-event"
            data-date="${selectedDate}">
            ＋ 新增行程
          </button>
        </div>

        ${dayDetails(selectedDate, true)}
      `;
  }
}


/* =========================
   4. 月曆與每日內容
========================= */

function calendarMarkup() {
  const year = shownMonth.getFullYear();
  const month = shownMonth.getMonth();
  const firstDay = new Date(year, month, 1);

  const mondayFirst = data.preferences.mondayFirst;
  const offset = mondayFirst
    ? (firstDay.getDay() + 6) % 7
    : firstDay.getDay();

  const weekdayNames = mondayFirst
    ? ["一", "二", "三", "四", "五", "六", "日"]
    : ["日", "一", "二", "三", "四", "五", "六"];

  let days = "";

  for (let index = 0; index < 42; index++) {
    const date = new Date(year, month, 1 - offset + index);
    const key = dateKey(date);
    const holiday = holidayName(key);
    const eventCount = data.events.filter(item => item.date === key).length;
    const photoCount = (data.photos[key] || []).length;
    const taskCount = data.tasks.filter(item => item.date === key).length;

    const classes = [
      "day",
      date.getMonth() !== month ? "outside" : "",
      [0, 6].includes(date.getDay()) ? "weekend" : "",
      key === todayKey() ? "today" : "",
      key === selectedDate ? "selected" : "",
      holiday ? "holiday" : ""
    ].filter(Boolean).join(" ");

    const label = [
      readableDate(key),
      holiday,
      `${eventCount}項行程`,
      `${taskCount}項待辦`,
      `${photoCount}張照片`
    ].filter(Boolean).join("，");

    days += `
      <button type="button" class="${classes}"
        data-action="select-date" data-date="${key}"
        aria-label="${escapeHTML(label)}"
        aria-pressed="${key === selectedDate}"
        ${holiday ? `title="${escapeHTML(holiday)}"` : ""}>
        <span class="day-number">${date.getDate()}</span>
        ${holiday
          ? `<span class="holiday-name">${escapeHTML(holiday)}</span>`
          : ""}
        <span class="day-meta">
          ${eventCount + taskCount
            ? `<span class="event-dot" aria-hidden="true"></span>
               <span>${eventCount + taskCount}項</span>`
            : ""}
          ${photoCount ? `<span>照 ${photoCount}</span>` : ""}
        </span>
      </button>
    `;
  }

  return `
    <section class="panel" aria-label="月曆">
      <div class="calendar-toolbar">
        <h2>${year} 年 ${month + 1} 月</h2>
        <div class="actions">
          <button class="btn small" data-action="previous-month"
            aria-label="上一個月">‹</button>
          <button class="btn small" data-action="calendar-today">
            今天
          </button>
          <button class="btn small" data-action="next-month"
            aria-label="下一個月">›</button>
        </div>
      </div>

      <div class="weekdays" aria-hidden="true">
        ${weekdayNames.map(day => `<span>${day}</span>`).join("")}
      </div>

      <div class="calendar-grid">${days}</div>

      <div class="legend">
        <span><i class="event-dot" aria-hidden="true"></i> 有安排事項</span>
        <span>「照」代表生活照片</span>
        <span>底線日期為今天</span>
      </div>

      <p class="help">
        公曆日期及週末自動計算。假期採香港地區：
        已收錄 2026 年公眾假期；其他年份僅顯示固定日期節日，
        不包含完整農曆假期及補假。
      </p>
    </section>
  `;
}

function sortedEntries(entries) {
  return [...entries].sort((a, b) => {
    return a.date.localeCompare(b.date)
      || (a.time || "99:99").localeCompare(b.time || "99:99")
      || a.title.localeCompare(b.title, "zh-Hant");
  });
}

function entryMarkup(item, kind) {
  const overdue = !item.done && item.date < todayKey();

  return `
    <article class="entry ${item.done ? "completed" : ""}">
      <input class="entry-check" type="checkbox"
        data-toggle="${kind}" data-id="${item.id}"
        ${item.done ? "checked" : ""}
        aria-label="${escapeHTML(`標記「${item.title}」為${item.done ? "未完成" : "已完成"}`)}">

      ${kind === "event"
        ? `<span class="entry-time">${item.time || "全天"}</span>`
        : ""}

      <div class="entry-content">
        <p class="entry-title">${escapeHTML(item.title)}</p>
        <div class="entry-meta">
          <span class="tag">${escapeHTML(item.category)}</span>
          ${kind === "task"
            ? `<span class="${overdue ? "overdue" : ""}">
                ${item.date}${overdue ? " · 已逾期" : ""}
               </span>`
            : ""}
          ${item.done ? "<span>已完成</span>" : ""}
        </div>

        ${item.description
          ? `<p class="entry-description">${escapeHTML(item.description)}</p>`
          : ""}
      </div>

      <div class="actions">
        <button class="text-button" data-action="edit-entry"
          data-kind="${kind}" data-id="${item.id}">編輯</button>
        <button class="text-button" data-action="delete-entry"
          data-kind="${kind}" data-id="${item.id}">刪除</button>
      </div>
    </article>
  `;
}

function dayDetails(date, includeTasks = false) {
  const events = sortedEntries(
    data.events.filter(item => item.date === date)
  );

  const tasks = sortedEntries(
    data.tasks.filter(item => item.date === date)
  );

  const photos = data.photos[date] || [];

  return `
    <section class="panel" aria-labelledby="daily-heading">
      <div class="section-heading">
        <div>
          <h3 id="daily-heading">${readableDate(date)}</h3>
          <p>${holidayName(date) || "為今天留下一點值得期待的安排。"}</p>
        </div>

        <button class="btn small" data-action="new-event"
          data-date="${date}">＋ 行程</button>
      </div>

      ${events.length
        ? events.map(item => entryMarkup(item, "event")).join("")
        : `<div class="empty">
            <p>這一天還沒有行程。</p>
            <p>按「＋ 行程」寫下第一個安排。</p>
           </div>`}
    </section>

    ${includeTasks || tasks.length ? `
      <section class="panel">
        <div class="section-heading">
          <h3>${includeTasks ? "今日待辦" : "這一天的待辦"}</h3>
          <button class="btn small" data-action="new-task"
            data-date="${date}">＋ 待辦</button>
        </div>
        ${tasks.length
          ? tasks.map(item => entryMarkup(item, "task")).join("")
          : `<div class="empty"><p>今天沒有待辦事項。</p></div>`}
      </section>
    ` : ""}

    <section class="panel" aria-labelledby="photos-heading">
      <div class="section-heading">
        <div>
          <h3 id="photos-heading">生活片刻</h3>
          <p>${photos.length} 張照片 · 收藏這一天的小事</p>
        </div>

        <label class="btn" for="daily-photos">＋ 上傳照片</label>
        <input id="daily-photos" type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple hidden data-upload-date="${date}">
      </div>

      ${photos.length ? `
        <div class="photo-grid">
          ${photos.map(photo => `
            <figure class="photo-card">
              <a href="${photo.src}" target="_blank" rel="noopener"
                aria-label="查看照片：${escapeHTML(photo.caption)}">
                <img src="${photo.src}"
                  alt="${escapeHTML(photo.caption)}"
                  loading="lazy">
              </a>
              <figcaption>${escapeHTML(photo.caption)}</figcaption>
              <div class="actions">
                <button class="text-button" data-action="photo-caption"
                  data-date="${date}" data-id="${photo.id}">
                  修改描述
                </button>
                <button class="text-button" data-action="delete-photo"
                  data-date="${date}" data-id="${photo.id}">
                  刪除
                </button>
              </div>
            </figure>
          `).join("")}
        </div>
      ` : `
        <div class="empty">
          <p>還沒有照片，今天有什麼值得記住？</p>
          <p>上傳一張照片，替生活留下一個畫面。</p>
        </div>
      `}

      <p class="help">
        支援 JPG、PNG、WebP；每張原圖上限 10 MB，每日最多 20 張。
        上傳後會自動縮小，以節省儲存空間。每張照片均可修改文字描述。
      </p>
    </section>
  `;
}

/* =========================
   5. 待辦事項
========================= */

function tasksPage() {
  const openCount = data.tasks.filter(item => !item.done).length;

  let items = data.tasks.filter(item => {
    const matchesStatus =
      taskFilter === "all"
      || (taskFilter === "open" && !item.done)
      || (taskFilter === "done" && item.done);

    const searchable = `${item.title} ${item.description} ${item.category}`;
    const matchesSearch = searchable.toLocaleLowerCase()
      .includes(taskSearch.toLocaleLowerCase());

    return matchesStatus && matchesSearch;
  });

  items = sortedEntries(items);

  return `
    <div class="page-heading">
      <div>
        <h2>待辦事項</h2>
        <p>還有 ${openCount} 件事，等待你慢慢完成。</p>
      </div>
      <button class="btn primary" data-action="new-task"
        data-date="${todayKey()}">＋ 新增待辦</button>
    </div>

    <section class="panel">
      <form id="search-form" class="search-form" role="search">
        <input type="search" name="query"
          aria-label="搜尋待辦事項"
          placeholder="搜尋標題、描述或分類"
          maxlength="100" value="${escapeHTML(taskSearch)}">
        <button class="btn" type="submit">搜尋</button>
        ${taskSearch
          ? `<button class="btn" type="button"
               data-action="clear-search">清除</button>`
          : ""}
      </form>

      <div class="filters" aria-label="待辦狀態篩選">
        ${[
          ["all", "全部"],
          ["open", "未完成"],
          ["done", "已完成"]
        ].map(([value, label]) => `
          <button class="btn small ${taskFilter === value ? "active" : ""}"
            data-action="task-filter" data-filter="${value}"
            aria-pressed="${taskFilter === value}">
            ${label}
          </button>
        `).join("")}
      </div>

      ${items.length
        ? items.map(item => entryMarkup(item, "task")).join("")
        : `<div class="empty">
            <p>目前沒有符合條件的待辦事項。</p>
            <p>可以調整搜尋條件，或新增一項待辦。</p>
           </div>`}
    </section>
  `;
}

/* =========================
   6. 設定與用品總額計算
========================= */

function settingsPage() {
  return `
    <div class="page-heading">
      <div>
        <h2>設定</h2>
        <p>依照自己的習慣，整理日常。</p>
      </div>
    </div>

    <form id="settings-form">
      <section class="panel">
        <h3>月曆與顯示</h3>

        <label class="check-label">
          <input type="checkbox" name="mondayFirst"
            ${data.preferences.mondayFirst ? "checked" : ""}>
          月曆以星期一作為每週開始
        </label>

        <label class="check-label">
          <input type="checkbox" name="compact"
            ${data.preferences.compact ? "checked" : ""}>
          使用較緊湊的列表與月曆間距
        </label>
      </section>

      <section class="panel">
        <div class="section-heading">
          <div>
            <h3>活動用品預算</h3>
            <p>準備手帳或活動用品，先算好需要多少。</p>
          </div>
        </div>

        <div class="field">
          <label for="budget-limit">預算上限（HKD）</label>
          <input id="budget-limit" name="budgetLimit"
            type="number" min="0" max="1000000" step="0.01"
            required value="${data.budget.limit}">
        </div>

        <div class="table-wrap">
          <table class="budget-table">
            <caption>
              選擇用品及數量後，JavaScript 會即時計算小計與總額。
            </caption>
            <thead>
              <tr>
                <th scope="col">用品</th>
                <th scope="col">單價</th>
                <th scope="col">數量</th>
                <th scope="col">小計</th>
              </tr>
            </thead>
            <tbody>
              ${data.budget.rows.map((row, index) => `
                <tr>
                  <td>
                    <select name="product-${index}"
                      data-budget-product="${index}"
                      aria-label="第 ${index + 1} 項用品">
                      ${PRODUCTS.map(product => `
                        <option value="${product.id}"
                          ${product.id === row.product ? "selected" : ""}>
                          ${product.name}
                        </option>
                      `).join("")}
                    </select>
                  </td>
                  <td data-unit-price="${index}"></td>
                  <td>
                    <input type="number" min="0" max="99" step="1"
                      required name="quantity-${index}"
                      data-budget-quantity="${index}"
                      aria-label="第 ${index + 1} 項數量"
                      value="${row.quantity}">
                  </td>
                  <td data-line-total="${index}"></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <div class="budget-summary">
          <span>預計總額</span>
          <strong id="budget-total">HK$0.00</strong>
        </div>

        <p id="budget-feedback" class="budget-feedback"
          role="status" aria-live="polite"></p>

        <p class="help">
          此處為用品預算試算，價格是作業展示資料，沒有付款或下單功能。
        </p>
      </section>

      <section class="panel">
        <h3>資料儲存</h3>
        <p class="muted">
          名字、頭像、日程、待辦及照片儲存在目前瀏覽器的 IndexedDB。
          清除網站資料、更換瀏覽器或更換網址後，不會自動同步。
        </p>
        <button type="button" class="btn" data-action="export-data">
          下載資料備份
        </button>
        <p class="help">
          備份包含照片，格式為 JSON，方便保留資料及作業展示。
        </p>
      </section>

      <div class="form-footer">
        <button class="btn primary" type="submit">儲存設定與預算</button>
      </div>
    </form>
  `;
}

function readBudgetRows() {
  return data.budget.rows.map((_, index) => {
    const product = document.querySelector(
      `[data-budget-product="${index}"]`
    ).value;

    const rawQuantity = Number(document.querySelector(
      `[data-budget-quantity="${index}"]`
    ).value);

    const quantity = Number.isFinite(rawQuantity)
      ? Math.min(99, Math.max(0, Math.trunc(rawQuantity)))
      : 0;

    return { product, quantity };
  });
}

function updateBudgetPreview() {
  if (!document.getElementById("budget-total")) return;

  const rows = readBudgetRows();
  let total = 0;

  rows.forEach((row, index) => {
    const product = PRODUCTS.find(item => item.id === row.product)
      || PRODUCTS[0];

    const subtotal = product.price * row.quantity;
    total += subtotal;

    document.querySelector(
      `[data-unit-price="${index}"]`
    ).textContent = money(product.price);

    document.querySelector(
      `[data-line-total="${index}"]`
    ).textContent = money(subtotal);
  });

  const rawLimit = Number(document.getElementById("budget-limit").value);
  const limit = Number.isFinite(rawLimit) ? Math.max(0, rawLimit) : 0;

  document.getElementById("budget-total").textContent = money(total);

  const feedback = document.getElementById("budget-feedback");
  feedback.classList.toggle("over", total > limit);
  feedback.textContent = total > limit
    ? `已超出預算 ${money(total - limit)}，可以調整用品或數量。`
    : `目前在預算之內，尚餘 ${money(limit - total)}。`;
}

/* =========================
   7. 個人主頁
========================= */

function profilePage() {
  const photoCount = Object.values(data.photos)
    .reduce((sum, photos) => sum + photos.length, 0);

  return `
    <div class="page-heading">
      <div>
        <h2>個人主頁</h2>
        <p>讓每一頁日常，都帶著你的樣子。</p>
      </div>
    </div>

    <section class="panel">
      <div class="profile-header">
        ${avatarMarkup(true)}
        <div>
          <label class="btn" for="avatar-upload">更換頭像</label>
          <input id="avatar-upload" type="file"
            accept="image/jpeg,image/png,image/webp" hidden>
          <p class="help">支援 JPG、PNG、WebP，原圖不超過 10 MB。</p>
        </div>
      </div>

      <form id="profile-form">
        <div class="field">
          <label for="profile-name">顯示名字</label>
          <input id="profile-name" name="name" required
            maxlength="24" autocomplete="nickname"
            value="${escapeHTML(data.profile.name)}">
        </div>

        <div class="field">
          <label for="profile-bio">關於自己</label>
          <textarea id="profile-bio" name="bio" maxlength="240"
            placeholder="寫一句介紹自己的話">${escapeHTML(data.profile.bio)}</textarea>
        </div>

        <div class="form-footer">
          <button class="btn primary" type="submit">儲存個人資料</button>
        </div>
      </form>
    </section>

    <section class="panel">
      <h3>我的記錄</h3>
      <p class="muted">每一次記下，都是生活留下的足跡。</p>

      <div class="stats">
        <div>
          <strong>${data.events.length}</strong>
          <span>累計行程</span>
        </div>
        <div>
          <strong>${data.tasks.filter(item => item.done).length}</strong>
          <span>已完成待辦</span>
        </div>
        <div>
          <strong>${photoCount}</strong>
          <span>生活照片</span>
        </div>
      </div>
    </section>
  `;
}

/* =========================
   8. 新增與編輯事項視窗
========================= */

function openEntryDialog(kind, date = todayKey(), existing = null) {
  const dialog = document.getElementById("entry-dialog");
  const isTask = kind === "task";
  const label = isTask ? "待辦" : "行程";

  const item = existing || {
    title: "",
    date,
    time: "",
    category: "生活",
    description: ""
  };

  dialog.innerHTML = `
    <form id="entry-form" data-kind="${kind}"
      data-id="${existing ? existing.id : ""}">
      <div class="section-heading">
        <h2 id="dialog-title">${existing ? "編輯" : "新增"}${label}</h2>
        <button class="text-button" type="button"
          data-action="close-dialog" aria-label="關閉視窗">關閉</button>
      </div>

      <div class="field">
        <label for="entry-title">${label}名稱</label>
        <input id="entry-title" name="title"
          required maxlength="80"
          placeholder="例如：完成網站首頁"
          value="${escapeHTML(item.title)}">
      </div>

      <div class="form-grid">
        <div class="field">
          <label for="entry-date">${isTask ? "到期日期" : "日期"}</label>
          <input id="entry-date" name="date" type="date"
            min="1900-01-01" max="2100-12-31"
            required value="${item.date}">
        </div>

        ${!isTask ? `
          <div class="field">
            <label for="entry-time">時間（可留空作全天行程）</label>
            <input id="entry-time" name="time" type="time"
              value="${item.time || ""}">
          </div>
        ` : ""}

        <div class="field full">
          <label for="entry-category">分類</label>
          <select id="entry-category" name="category">
            ${["生活", "學習", "工作", "健康"].map(category => `
              <option value="${category}"
                ${category === item.category ? "selected" : ""}>
                ${category}
              </option>
            `).join("")}
          </select>
        </div>

        <div class="field full">
          <label for="entry-description">事項內容</label>
          <textarea id="entry-description" name="description"
            maxlength="2000"
            placeholder="寫下細節、準備事項或一些提醒……">${escapeHTML(item.description)}</textarea>
        </div>
      </div>

      <div class="form-footer">
        <button type="button" class="btn"
          data-action="close-dialog">取消</button>
        <button type="submit" class="btn primary">儲存${label}</button>
      </div>
    </form>
  `;

  dialog.showModal();
  document.getElementById("entry-title").focus();
}

/* =========================
   9. 圖片處理
========================= */

function resizeImage(file, maxSize = 1400) {
  return new Promise((resolve, reject) => {
    const supportedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!supportedTypes.includes(file.type)) {
      reject(new Error("請選擇 JPG、PNG 或 WebP 圖片。"));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      reject(new Error(`「${file.name}」超過 10 MB，請先縮小圖片。`));
      return;
    }

    const image = new Image();
    const objectURL = URL.createObjectURL(file);

    image.onload = () => {
      try {
        const ratio = Math.min(
          1,
          maxSize / Math.max(image.naturalWidth, image.naturalHeight)
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));

        const context = canvas.getContext("2d");
        if (!context) throw new Error("瀏覽器無法處理圖片。");

        context.fillStyle = "#fffdf9";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectURL);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectURL);
      reject(new Error("無法讀取這張圖片，請選擇其他檔案。"));
    };

    image.src = objectURL;
  });
}

async function uploadDailyPhotos(input) {
  const date = input.dataset.uploadDate;
  const files = Array.from(input.files || []);
  if (!files.length) return;

  const currentCount = (data.photos[date] || []).length;

  if (currentCount + files.length > 20) {
    toast("每日最多儲存 20 張照片，請減少選取數量。");
    input.value = "";
    return;
  }

  input.disabled = true;
  toast("正在處理照片……");

  try {
    const photos = [];

    // 逐張處理，減少同時解碼多張大圖造成的記憶體使用。
    for (const file of files) {
      photos.push({
        id: uid(),
        src: await resizeImage(file),
        caption: file.name.replace(/\.[^.]+$/, "").slice(0, 100)
          || "生活記錄"
      });
    }

    await updateData(() => {
      if (!data.photos[date]) data.photos[date] = [];

      if (data.photos[date].length + photos.length > 20) {
        throw new Error("超過每日照片上限");
      }

      data.photos[date].push(...photos);
    }, `已儲存 ${photos.length} 張生活照片`);
  } catch (error) {
    toast(error.message || "照片上傳失敗，請重試。");
  } finally {
    input.disabled = false;
    input.value = "";
  }
}

/* =========================
   10. 按鈕事件
========================= */

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  const kind = button.dataset.kind;
  const date = button.dataset.date;

  switch (action) {
    case "previous-month":
    case "next-month": {
      const offset = action === "previous-month" ? -1 : 1;
      shownMonth = new Date(
        shownMonth.getFullYear(),
        shownMonth.getMonth() + offset,
        1
      );
      selectedDate = dateKey(shownMonth);
      render();
      break;
    }

    case "calendar-today":
      selectedDate = todayKey();
      shownMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      );
      render();
      break;

    case "select-date": {
      selectedDate = date;
      const selected = parseDate(date);
      shownMonth = new Date(
        selected.getFullYear(),
        selected.getMonth(),
        1
      );
      render();
      break;
    }

    case "new-event":
      openEntryDialog("event", date);
      break;

    case "new-task":
      openEntryDialog("task", date);
      break;

    case "close-dialog":
      document.getElementById("entry-dialog").close();
      break;

    case "edit-entry": {
      const collection = kind === "task" ? data.tasks : data.events;
      const item = collection.find(entry => entry.id === id);
      if (item) openEntryDialog(kind, item.date, item);
      break;
    }

    case "delete-entry":
      if (confirm("確定刪除這項事項嗎？")) {
        await updateData(() => {
          const key = kind === "task" ? "tasks" : "events";
          data[key] = data[key].filter(item => item.id !== id);
        }, "事項已刪除");
      }
      break;

    case "task-filter":
      taskFilter = button.dataset.filter;
      render();
      break;

    case "clear-search":
      taskSearch = "";
      render();
      break;

    case "photo-caption": {
      const photo = (data.photos[date] || [])
        .find(item => item.id === id);

      if (!photo) return;

      const result = prompt("輸入照片描述（最多 100 字）", photo.caption);
      if (result === null) return;

      const caption = result.trim().slice(0, 100);

      if (!caption) {
        toast("請填寫照片描述，方便記錄與閱讀。");
        return;
      }

      await updateData(() => {
        photo.caption = caption;
      }, "照片描述已更新");
      break;
    }

    case "delete-photo":
      if (confirm("確定刪除這張生活照片嗎？")) {
        await updateData(() => {
          data.photos[date] = (data.photos[date] || [])
            .filter(photo => photo.id !== id);
        }, "照片已刪除");
      }
      break;

    case "export-data": {
      const backup = {
        application: "Dayline",
        version: 1,
        exportedAt: new Date().toISOString(),
        data
      };

      const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: "application/json" }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Dayline-backup-${todayKey()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("已建立資料備份");
      break;
    }
  }
});

/* =========================
   11. 表單提交
========================= */

document.addEventListener("submit", async event => {
  const form = event.target;

  if (![
    "entry-form",
    "profile-form",
    "settings-form",
    "search-form"
  ].includes(form.id)) return;

  event.preventDefault();
  if (!form.reportValidity()) return;

  const fields = new FormData(form);

  if (form.id === "search-form") {
    taskSearch = String(fields.get("query") || "").trim();
    render();
    return;
  }

  if (form.id === "entry-form") {
    const title = String(fields.get("title") || "").trim();
    const date = String(fields.get("date") || "");

    if (!title) {
      toast("請填寫事項名稱。");
      return;
    }

    if (!validDate(date)) {
      toast("請選擇有效日期。");
      return;
    }

    const collectionKey = form.dataset.kind === "task"
      ? "tasks"
      : "events";

    const existing = data[collectionKey]
      .find(item => item.id === form.dataset.id);

    const item = {
      id: existing ? existing.id : uid(),
      title,
      date,
      time: String(fields.get("time") || ""),
      category: String(fields.get("category") || "生活"),
      description: String(fields.get("description") || "").trim(),
      done: existing ? existing.done : false
    };

    await updateData(() => {
      if (existing) {
        const index = data[collectionKey]
          .findIndex(entry => entry.id === existing.id);
        data[collectionKey][index] = item;
      } else {
        data[collectionKey].push(item);
      }
    }, existing ? "事項已更新" : "事項已新增");

    return;
  }

  if (form.id === "profile-form") {
    const name = String(fields.get("name") || "").trim();

    if (!name) {
      toast("名字不能只有空白，請重新輸入。");
      return;
    }

    await updateData(() => {
      data.profile.name = name;
      data.profile.bio = String(fields.get("bio") || "").trim();
    }, "個人資料已更新");

    return;
  }

  if (form.id === "settings-form") {
    const rows = readBudgetRows();
    const limit = Number(fields.get("budgetLimit"));

    await updateData(() => {
      data.preferences.mondayFirst = fields.has("mondayFirst");
      data.preferences.compact = fields.has("compact");
      data.budget = { limit, rows };
    }, "設定與用品預算已儲存");
  }
});

/* =========================
   12. 輸入及檔案變更
========================= */

document.addEventListener("input", event => {
  if (event.target.closest("#settings-form")) {
    updateBudgetPreview();
  }
});

document.addEventListener("change", async event => {
  const input = event.target;

  if (input.matches("[data-toggle]")) {
    const key = input.dataset.toggle === "task" ? "tasks" : "events";
    const item = data[key].find(entry => entry.id === input.dataset.id);
    if (!item) return;

    const checked = input.checked;
    const success = await updateData(() => {
      item.done = checked;
    }, checked ? "又完成一件事，做得好。" : "已標記為未完成");

    if (!success) input.checked = !checked;
    return;
  }

  if (input.matches("[data-upload-date]")) {
    await uploadDailyPhotos(input);
    return;
  }

  if (input.id === "avatar-upload") {
    const file = input.files?.[0];
    if (!file) return;

    input.disabled = true;

    try {
      const avatar = await resizeImage(file, 500);

      // 保留更換頭像前，使用者已在表單輸入但尚未提交的文字。
      const draftName = document.getElementById("profile-name")?.value;
      const draftBio = document.getElementById("profile-bio")?.value;

      const success = await updateData(() => {
        data.profile.avatar = avatar;
      }, "頭像已更新");

      if (success) {
        if (draftName !== undefined) {
          document.getElementById("profile-name").value = draftName;
        }
        if (draftBio !== undefined) {
          document.getElementById("profile-bio").value = draftBio;
        }
      }
    } catch (error) {
      toast(error.message || "頭像上傳失敗。");
    } finally {
      input.disabled = false;
      input.value = "";
    }
  }
});

/* =========================
   13. 啟動
========================= */

async function start() {
  try {
    db = await openDatabase();

    const saved = await readData();
    const defaults = initialData();

    data = saved
      ? {
          ...defaults,
          ...saved,
          profile: {
            ...defaults.profile,
            ...saved.profile
          },
          preferences: {
            ...defaults.preferences,
            ...saved.preferences
          }
        }
      : defaults;

    if (!saved) await writeData();

    render();

    // 多個分頁同時開啟時，回到目前分頁會重新讀取已儲存資料。
    window.addEventListener("focus", async () => {
      if (saving || document.querySelector("dialog[open]")) return;

      const active = document.activeElement;

      // 避免覆蓋使用者正在編輯的表單或已修改的預算。
      if (
        ["profile", "settings"].includes(page)
        || active?.matches("input, textarea, select")
      ) return;

      try {
        const latest = await readData();
        if (latest) {
          data = latest;
          render();
        }
      } catch (error) {
        console.error(error);
      }
    });
  } catch (error) {
    console.error(error);

    app.setAttribute("aria-busy", "false");
    app.innerHTML = `
      <main class="panel" style="max-width:620px;margin:60px auto">
        <p class="eyebrow">DAYLINE</p>
        <h1>暫時無法開啟本機資料庫</h1>
        <p>
          請在 VS Code 使用 Live Server 開啟網站，
          並允許瀏覽器儲存網站資料。
          部分私密瀏覽模式可能限制本機儲存。
        </p>
        <button class="btn primary" id="retry-start">重新嘗試</button>
      </main>
    `;

    document.getElementById("retry-start")
      .addEventListener("click", () => location.reload());
  }
}

start();

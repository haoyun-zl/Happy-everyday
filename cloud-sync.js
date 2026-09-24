(function () {
  "use strict";

  const app = window.xinqingApp;
  const config = window.XINQING_CLOUD_CONFIG || {};
  if (!app) return;

  const configured = /^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl || "") &&
    !String(config.supabaseAnonKey || "").startsWith("YOUR_");
  let client = null;
  let session = null;
  let syncing = false;
  let pendingTimer = null;

  const shell = document.createElement("div");
  shell.innerHTML = `
    <button id="accountButton" class="account-button" type="button">登录同步</button>
    <dialog id="accountDialog" class="account-dialog">
      <button id="closeAccount" class="dialog-close" type="button" aria-label="关闭">×</button>
      <div id="signedOutPanel">
        <span class="eyebrow">PERMANENTLY YOURS</span>
        <h2>备份心情，跨设备继续</h2>
        <p>不登录也可以继续记录。登录后，已有游客记录会合并到你的个人云端空间。</p>
        <form id="loginForm">
          <label for="loginEmail">邮箱地址</label>
          <input id="loginEmail" type="email" autocomplete="email" placeholder="name@example.com" required>
          <button id="sendLogin" class="primary" type="submit">发送登录链接</button>
        </form>
        <p class="auth-note">无需设置密码。登录链接会发送到邮箱，点击即可完成登录。</p>
        <p id="setupHint" class="setup-hint" hidden>云同步尚未配置，游客记录仍会正常保存在本机。</p>
      </div>
      <div id="signedInPanel" hidden>
        <span class="eyebrow">CLOUD SYNC</span>
        <h2>记录已受到云端守护</h2>
        <p id="accountEmail"></p>
        <div class="account-status"><span id="accountSyncState">正在检查同步状态…</span><small id="lastSynced"></small></div>
        <button id="syncNow" class="secondary" type="button">立即同步</button>
        <button id="logoutButton" class="text-danger" type="button">退出登录</button>
      </div>
    </dialog>`;
  document.body.append(...shell.children);

  const $ = selector => document.querySelector(selector);
  const accountButton = $("#accountButton");
  const dialog = $("#accountDialog");
  const signedOut = $("#signedOutPanel");
  const signedIn = $("#signedInPanel");

  // Keep the date and account action in normal document flow so they never overlap.
  const pageHeader = document.querySelector("main > header");
  const today = $("#today");
  if (pageHeader && today) {
    const headerActions = document.createElement("div");
    headerActions.className = "header-actions";
    headerActions.append(today, accountButton);
    pageHeader.append(headerActions);
  }

  function setSignedOut() {
    session = null;
    signedOut.hidden = false;
    signedIn.hidden = true;
    accountButton.textContent = "登录同步";
    accountButton.classList.remove("is-synced");
    accountButton.dataset.state = 'local';
    updateStorageCopy('游客模式 · 记录保存在此浏览器，请定期导出备份');
  }

  function setSignedIn(nextSession) {
    session = nextSession;
    signedOut.hidden = true;
    signedIn.hidden = false;
    accountButton.textContent = "已登录 · 待同步";
    accountButton.classList.remove("is-synced");
    updateStorageCopy('已登录 · 云端同步尚待确认，本机记录保留');
    $("#accountEmail").textContent = nextSession.user.email || "已登录";
  }

  function setSyncStatus(text, ok) {
    $("#accountSyncState").textContent = text;
    accountButton.dataset.state = ok ? "ok" : "busy";
    accountButton.textContent = ok ? '已云端同步' : '同步状态';
    accountButton.classList.toggle('is-synced',ok);
    updateStorageCopy(ok ? '本机与云端已同步 · 建议定期导出备份' : text);
    if (ok) $("#lastSynced").textContent = `最近同步：${new Date().toLocaleTimeString("zh-CN", {hour:"2-digit",minute:"2-digit"})}`;
  }

  function updateStorageCopy(text) {
    document.querySelectorAll('.aside-bottom p, footer span:last-child, .form-bottom > span').forEach(node => node.textContent=text);
  }

  function toRow(entry) {
    return {
      id: entry.id,
      user_id: session.user.id,
      occurred_at: entry.date,
      mood: entry.mood,
      intensity: entry.intensity,
      tags: entry.tags,
      note: entry.note,
      client_updated_at: entry.updatedAt || entry.date,
      deleted_at: null
    };
  }

  function fromRow(row) {
    return {
      id: row.id,
      date: row.occurred_at,
      mood: row.mood,
      intensity: row.intensity,
      tags: row.tags || [],
      note: row.note || "",
      updatedAt: row.client_updated_at
    };
  }

  async function syncAll() {
    if (!session || syncing) return;
    syncing = true;
    setSyncStatus("正在同步…", false);
    try {
      const {data: remoteRows, error: readError} = await client
        .from("mood_entries")
        .select("id,occurred_at,mood,intensity,tags,note,client_updated_at,deleted_at");
      if (readError) throw readError;

      const localEntries = app.getEntries();
      const remoteById = new Map((remoteRows || []).map(row => [row.id, row]));
      const merged = [];
      const uploads = [];

      for (const entry of localEntries) {
        const remote = remoteById.get(entry.id);
        if (!remote) {
          uploads.push(toRow(entry));
          merged.push(entry);
          continue;
        }
        remoteById.delete(entry.id);
        if (remote.deleted_at) continue;
        const localTime = new Date(entry.updatedAt || entry.date).getTime();
        const remoteTime = new Date(remote.client_updated_at || remote.occurred_at).getTime();
        merged.push(remoteTime >= localTime ? fromRow(remote) : entry);
        if (localTime > remoteTime) uploads.push(toRow(entry));
      }
      for (const row of remoteById.values()) if (!row.deleted_at) merged.push(fromRow(row));

      if (uploads.length) {
        const {error: writeError} = await client.from("mood_entries").upsert(uploads, {onConflict:"id"});
        if (writeError) throw writeError;
      }
      app.replaceEntries(merged);
      setSyncStatus("所有记录已同步", true);
    } catch (error) {
      console.error("Xinqing sync failed", error);
      setSyncStatus("同步暂时失败，本机记录仍然安全", false);
      app.notify("云端同步暂时失败，记录已保存在本机。稍后可重试。");
    } finally {
      syncing = false;
    }
  }

  async function pushChange(detail) {
    if (!session) return;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(async () => {
      const previous = new Set(detail.previous || []);
      const current = detail.next || app.getEntries();
      const currentIds = new Set(current.map(entry => entry.id));
      const removed = [...previous].filter(id => !currentIds.has(id));
      try {
        setSyncStatus("正在同步…", false);
        if (current.length) {
          const {error} = await client.from("mood_entries").upsert(current.map(toRow), {onConflict:"id"});
          if (error) throw error;
        }
        if (removed.length) {
          const {error} = await client.from("mood_entries").update({deleted_at:new Date().toISOString()}).in("id", removed);
          if (error) throw error;
        }
        setSyncStatus("所有记录已同步", true);
      } catch (error) {
        console.error("Xinqing change upload failed", error);
        setSyncStatus("等待重新同步", false);
      }
    }, 450);
  }

  accountButton.addEventListener("click", () => dialog.showModal());
  $("#closeAccount").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  window.addEventListener("xinqing:local-change", event => pushChange(event.detail));
  $("#syncNow").addEventListener("click", syncAll);
  $("#logoutButton").addEventListener("click", async () => { await client.auth.signOut(); setSignedOut(); dialog.close(); });

  $("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!configured || !client) {
      $("#setupHint").hidden = false;
      return;
    }
    const button = $("#sendLogin");
    button.disabled = true;
    button.textContent = "正在发送…";
    const email = $("#loginEmail").value.trim();
    const redirectTo = `${location.origin}${location.pathname}`;
    const {error} = await client.auth.signInWithOtp({email, options:{emailRedirectTo:redirectTo}});
    button.disabled = false;
    button.textContent = "发送登录链接";
    if (error) app.notify("登录链接发送失败，请检查邮箱后重试。");
    else app.notify("登录链接已发送，请前往邮箱完成登录。");
  });

  async function start() {
    if (!configured) {
      $("#setupHint").hidden = false;
      accountButton.title = "需要先配置 Supabase";
      return;
    }
    const loader = document.createElement("script");
    loader.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    loader.onload = async () => {
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      const {data} = await client.auth.getSession();
      if (data.session) { setSignedIn(data.session); await syncAll(); }
      client.auth.onAuthStateChange((event, nextSession) => {
        if (nextSession) { setSignedIn(nextSession); setTimeout(syncAll, 0); }
        else setSignedOut();
      });
    };
    loader.onerror = () => app.notify("登录组件加载失败，游客记录仍会保存在本机。");
    document.head.appendChild(loader);
  }

  setSignedOut();
  start();
})();

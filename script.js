    /* ── THEME ── */
    function toggleTheme() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ev_theme', next);
    }
    (function () {
      const t = localStorage.getItem('ev_theme') || 'dark';
      document.documentElement.setAttribute('data-theme', t);
      if (t === 'light') setTimeout(() => { const el = document.getElementById('themeToggle'); if (el) el.checked = true }, 50);
    })();

    /* ── HELPERS ── */
    const ICONS = { trip: 'fa-plane', achievement: 'fa-trophy', certificate: 'fa-certificate', journal: 'fa-book-open', event: 'fa-calendar-star', project: 'fa-code', photo: 'fa-camera', other: 'fa-box' };
    const MOOD_ICONS = { happy: 'fa-face-smile', excited: 'fa-face-grin-stars', proud: 'fa-fist-raised', nostalgic: 'fa-heart', adventurous: 'fa-person-hiking', grateful: 'fa-hands', neutral: 'fa-face-meh', sad: 'fa-face-sad-tear' };
    const MOOD_LABELS = { happy: 'Happy', excited: 'Excited', proud: 'Proud', nostalgic: 'Nostalgic', adventurous: 'Adventurous', grateful: 'Grateful', neutral: 'Neutral', sad: 'Sad' };
    const TYPE_LABELS = { trip: 'Trip', achievement: 'Achievement', certificate: 'Certificate', journal: 'Journal', event: 'Event', project: 'Project', photo: 'Photo', other: 'Other' };

    function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
    function fmtDate(d) { if (!d) return ''; return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
    function toast(msg, ok = true) {
      document.getElementById('toastMsg').textContent = msg;
      const ic = document.getElementById('toastIcon');
      const ico = document.getElementById('toastIco');
      ic.className = 'toast-icon ' + (ok ? 'ok' : 'err');
      ico.className = 'fa-solid ' + (ok ? 'fa-check' : 'fa-circle-exclamation');
      const t = document.getElementById('toast'); t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2600);
    }

    /* ── GOOGLE SHEET LOGGER ── */
    const SHEET_URL = 'https://script.google.com/macros/s/AKfycbyW1uGW-UuSTnXy3zn6twP87kbhvCq6sjYlIcdsQ-sbLQYU-LUq2rcEHgtZxhqUjAN4wQ/exec'; // <-- paste here

    function logToSheet(username, action) {
      const device = /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop';
      fetch(SHEET_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, action, device })
      }).catch(() => { }); // silent fail — won't affect the app
    }

    /* ── AUTH ── */
    function simpleHash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0 } return h.toString(36) }

    /* ───────────────────────────────────────────────
       FIREBASE HELPERS
       Each function tries Firestore first, then falls
       back to localStorage so the app works offline.
    ─────────────────────────────────────────────── */
    async function fbGet(collection, docId) {
      try {
        const snap = await window._fsGetDoc(window._fsDoc(window._db, collection, docId));
        return snap.exists() ? snap.data() : null;
      } catch (e) { return null; }
    }
    async function fbSet(collection, docId, data) {
      try {
        await window._fsSetDoc(window._fsDoc(window._db, collection, docId), data, { merge: true });
        return true;
      } catch (e) { return false; }
    }

    /* ── USER ACCOUNT HELPERS (Firestore + localStorage) ── */
    async function getUsers() {
      // Try cloud first so cross-device login works
      const cloud = await fbGet('ev_users', '__accounts__');
      if (cloud && cloud.users) {
        // Keep local in sync
        localStorage.setItem('ev_users', JSON.stringify(cloud.users));
        return cloud.users;
      }
      return JSON.parse(localStorage.getItem('ev_users') || '{}');
    }
    async function saveUsers(u) {
      localStorage.setItem('ev_users', JSON.stringify(u));
      await fbSet('ev_users', '__accounts__', { users: u });
    }

    /* ── MEMORY HELPERS (Firestore + localStorage) ── */
    async function getMem(uid) {
      const cloud = await fbGet('ev_memories', uid);
      if (cloud && cloud.memories) {
        localStorage.setItem('ev_mem_' + uid, JSON.stringify(cloud.memories));
        return cloud.memories;
      }
      return JSON.parse(localStorage.getItem('ev_mem_' + uid) || '[]');
    }
    async function saveMem(uid, m) {
      localStorage.setItem('ev_mem_' + uid, JSON.stringify(m));
      await fbSet('ev_memories', uid, { memories: m });
    }

    let currentUser = null, memories = [], curFilter = 'all', detailId = null, mediaFiles = [], galCurrent = 0, galTotal = 0;

    /* ── LOADING OVERLAY ── */
    function showLoading(msg = 'Syncing…') {
      let el = document.getElementById('fbLoader');
      if (!el) {
        el = document.createElement('div'); el.id = 'fbLoader';
        el.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:var(--ff);color:#fff;font-size:1.1rem';
        el.innerHTML = `<div style="width:48px;height:48px;border:4px solid rgba(255,255,255,.2);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite"></div><span id="fbLoaderMsg">${msg}</span>`;
        if (!document.querySelector('#fbSpinKf')) { const s = document.createElement('style'); s.id = 'fbSpinKf'; s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}'; document.head.appendChild(s); }
        document.body.appendChild(el);
      } else { document.getElementById('fbLoaderMsg').textContent = msg; }
      el.style.display = 'flex';
    }
    function hideLoading() { const el = document.getElementById('fbLoader'); if (el) el.style.display = 'none'; }

    function switchTab(t) {
      document.getElementById('loginForm').style.display = t === 'login' ? 'block' : 'none';
      document.getElementById('signupForm').style.display = t === 'signup' ? 'block' : 'none';
      document.querySelectorAll('.auth-tab').forEach((b, i) => b.classList.toggle('active', (t === 'login' && i === 0) || (t === 'signup' && i === 1)));
      document.getElementById('authErr').classList.remove('show');
    }
    function authErr(m) { const e = document.getElementById('authErr'); document.getElementById('authErrMsg').textContent = m; e.classList.add('show') }

    async function doLogin() {
      const u = document.getElementById('lU').value.trim().toLowerCase();
      const p = document.getElementById('lP').value;
      if (!u || !p) { authErr('Please fill in all fields.'); return }
      showLoading('Checking credentials…');
      const users = await getUsers();
      if (!users[u]) { hideLoading(); authErr('No account found. Create one!'); return }
      if (users[u].hash !== simpleHash(p)) { hideLoading(); authErr('Wrong password. Try again!'); return }
      await loginUser(u);
    }

    async function doSignup() {
      const u = document.getElementById('sU').value.trim().toLowerCase().replace(/\s+/g, '_');
      const p = document.getElementById('sP').value;
      const cp = document.getElementById('sCP').value;
      if (!u || !p || !cp) { authErr('Please fill in all fields.'); return }
      if (u.length < 3) { authErr('Username must be at least 3 characters.'); return }
      if (p.length < 4) { authErr('Password must be at least 4 characters.'); return }
      if (p !== cp) { authErr('Passwords do not match!'); return }
      showLoading('Creating account…');
      const users = await getUsers();
      if (users[u]) { hideLoading(); authErr('Username taken! Try another one.'); return }
      users[u] = { hash: simpleHash(p), created: Date.now() };
      await saveUsers(users);
      logToSheet(u, 'signup');
      await loginUser(u);
    }

    async function loginUser(u) {
      showLoading('Loading your vault…');
      logToSheet(u, 'login');
      currentUser = u; localStorage.setItem('ev_session', u);
      memories = await getMem(u);
      hideLoading();
      document.getElementById('authScreen').style.display = 'none';
      document.getElementById('mainApp').style.display = 'block';
      document.getElementById('navUname').textContent = u;
      document.getElementById('navAv').textContent = u[0].toUpperCase();
      refresh(); toast('Welcome back, ' + u + '!');
    }

    function confirmLogout() {
      openConfirm({
        icon: 'fa-right-from-bracket',
        iconType: 'warn',
        title: 'Sign Out?',
        msg: 'You will be returned to the login screen.',
        okLabel: 'Sign Out',
        okClass: 'warn-ok',
        onOk: doLogout
      });
    }
    function doLogout() {
      currentUser = null; localStorage.removeItem('ev_session');
      document.getElementById('mainApp').style.display = 'none';
      document.getElementById('authScreen').style.display = 'flex';
      document.getElementById('lU').value = ''; document.getElementById('lP').value = '';
      toast('Signed out successfully.');
    }

    /* Auto-login on page load — wait for Firebase to be ready first */
    async function tryAutoLogin() {
      const s = localStorage.getItem('ev_session');
      if (!s) { document.getElementById('authScreen').style.display = 'flex'; return; }
      // Quick local check so we don't show a blank screen
      const localUsers = JSON.parse(localStorage.getItem('ev_users') || '{}');
      if (!localUsers[s]) {
        // Try fetching from cloud (first time on new device)
        showLoading('Checking your account…');
        const cloudUsers = await getUsers();
        hideLoading();
        if (!cloudUsers[s]) { document.getElementById('authScreen').style.display = 'flex'; return; }
      }
      await loginUser(s);
    }

    /* Wait for Firebase module to expose db, then auto-login */
    if (window._firebaseReady) {
      tryAutoLogin();
    } else {
      window.addEventListener('firebase-ready', tryAutoLogin, { once: true });
      /* Safety fallback: if firebase never fires (e.g. blocked), still show auth */
      setTimeout(() => {
        if (!window._firebaseReady && !currentUser) {
          hideLoading();
          document.getElementById('authScreen').style.display = 'flex';
        }
      }, 6000);
    }

    /* ── MEDIA ── */
    function handleMediaUpload(files) {
      const arr = Array.from(files);
      const remaining = 8 - mediaFiles.length;
      if (remaining <= 0) { toast('Max 8 files per memory', false); return }
      arr.slice(0, remaining).forEach(file => {
        const reader = new FileReader();
        reader.onload = e => { mediaFiles.push({ data: e.target.result, type: file.type, name: file.name }); renderMediaPreviews() };
        reader.readAsDataURL(file);
      });
    }
    function renderMediaPreviews() {
      document.getElementById('mediaPreviews').innerHTML = mediaFiles.map((f, i) => {
        const src = f.url || f.data;
        return `<div class="med-prev">
      ${f.type.startsWith('video') ? `<video src="${src}" muted></video><div class="med-vid-badge"><i class="fa-solid fa-video"></i></div>` : `<img src="${src}" alt="preview">`}
      <button class="med-prev-del" onclick="removeMedia(${i})"><i class="fa-solid fa-xmark"></i></button>
    </div>`;
      }).join('');
    }
    function removeMedia(i) { mediaFiles.splice(i, 1); renderMediaPreviews() }

    /* ── UPLOAD MEDIA TO FIREBASE STORAGE ── */
    async function uploadMediaToStorage(uid, memId, mediaArr) {
      const uploaded = [];
      for (let i = 0; i < mediaArr.length; i++) {
        const f = mediaArr[i];
        /* already uploaded on a previous save — keep the storage URL */
        if (f.url) { uploaded.push(f); continue; }
        try {
          const path = `users/${uid}/${memId}_${i}`;
          const storRef = window._stRef(window._storage, path);
          const base64 = f.data.split(',')[1];
          await window._stUpload(storRef, base64, 'base64', { contentType: f.type });
          const url = await window._stGetUrl(storRef);
          /* store url + path (path needed if we ever want to delete from Storage) */
          uploaded.push({ url, type: f.type, name: f.name, path });
        } catch (e) {
          console.warn('Storage upload failed for file', i, e);
          /* fallback: keep base64 so the memory is never lost */
          uploaded.push(f);
        }
      }
      return uploaded;
    }

    /* ── RENDER CARDS ── */
    function render() {
      const q = (document.getElementById('sInput').value || '').toLowerCase();
      let data = [...memories].sort((a, b) => b.date.localeCompare(a.date));
      if (curFilter !== 'all') data = data.filter(m => m.type === curFilter);
      if (q) data = data.filter(m => m.title.toLowerCase().includes(q) || (m.desc || '').toLowerCase().includes(q));
      const area = document.getElementById('cardsArea');
      if (!memories.length) {
        area.innerHTML = `<div class="empty-state"><div class="empty-icon-wrap"><i class="fa-solid fa-vault"></i></div><h3>Your vault is empty</h3><p>Start capturing your echoes — trips, wins, certs and every moment worth keeping.</p><button class="empty-btn" onclick="openAdd()"><i class="fa-solid fa-plus" style="margin-right:7px"></i>Add First Echo</button></div>`; return;
      }
      if (!data.length) {
        area.innerHTML = `<div class="empty-state"><div class="empty-icon-wrap"><i class="fa-solid fa-magnifying-glass"></i></div><h3>No matches found</h3><p>Try a different keyword or change the filter.</p></div>`; return;
      }
      area.innerHTML = `<div class="cards-grid">${data.map(m => {
        const ic = ICONS[m.type] || 'fa-box';
        const mi = MOOD_ICONS[m.mood] || 'fa-face-smile';
        const cover = m.media && m.media.length ? m.media[0] : null;
        const mCount = m.media ? m.media.length : 0;
        return `<div class="m-card t-${m.type}" onclick="openDet(${m.id})" data-id="${m.id}">
      <div class="card-media">
        ${cover ? (cover.type.startsWith('video') ? `<video src="${cover.url || cover.data}" muted></video>` : `<img src="${cover.url || cover.data}" alt="${esc(m.title)}">`) :
            `<div class="card-media-empty"><div class="media-empty-icon"><i class="fa-solid ${ic}"></i></div><span style="font-family:var(--fm);font-size:.62rem;color:var(--txt3)">No media</span></div>`}
        ${mCount > 1 ? `<div class="media-count-badge"><i class="fa-solid fa-photo-film"></i> ${mCount}</div>` : ''}
      </div>
      <div class="card-type-stripe"></div>
      <div class="card-inner">
        <div class="card-top">
          <div class="type-badge"><i class="fa-solid ${ic}"></i> ${TYPE_LABELS[m.type] || m.type}</div>
          <div class="card-mood-icon"><i class="fa-solid ${mi}"></i></div>
        </div>
        <div class="card-title">${esc(m.title)}</div>
        <div class="card-meta">
          <span><i class="fa-solid fa-calendar-days"></i>${fmtDate(m.date)}</span>
          ${m.city ? `<span><i class="fa-solid fa-location-dot"></i>${esc(m.city)}</span>` : ''}
        </div>
        ${m.desc ? `<div class="card-desc">${esc(m.desc)}</div>` : ''}
      </div>
      ${m.tags && m.tags.length ? `<div class="card-foot">${m.tags.slice(0, 4).map(t => `<span class="ctag">#${esc(t)}</span>`).join('')}</div>` : ''}
    </div>`;
      }).join('')}</div>`;
      updateStats();
    }

    function updateStats() {
      document.getElementById('sTot').textContent = memories.length;
      document.getElementById('sSubTot').textContent = memories.length === 1 ? '1 echo saved' : memories.length + ' echoes saved';
      document.getElementById('hc1').textContent = memories.length;
      if (!memories.length) {
        ['sYr', 'sCty', 'sTagSt'].forEach(id => document.getElementById(id).textContent = '—');
        ['hc2', 'hc3', 'hc4'].forEach(id => document.getElementById(id).textContent = '—');
        ['sSubYr', 'sSubCty', 'sSubTag'].forEach(id => document.getElementById(id).textContent = 'No data yet');
        return;
      }
      const ym = {}; memories.forEach(m => { const y = m.date.slice(0, 4); ym[y] = (ym[y] || 0) + 1 });
      const ty = Object.entries(ym).sort((a, b) => b[1] - a[1])[0];
      document.getElementById('sYr').textContent = ty[0]; document.getElementById('sSubYr').textContent = ty[1] + ' echoes'; document.getElementById('hc2').textContent = ty[0];
      const cm = {}; memories.forEach(m => { if (m.city) cm[m.city] = (cm[m.city] || 0) + 1 });
      const tc = Object.entries(cm).sort((a, b) => b[1] - a[1])[0];
      if (tc) { document.getElementById('sCty').textContent = tc[0]; document.getElementById('sSubCty').textContent = tc[1] + ' echoes'; document.getElementById('hc3').textContent = tc[0] }
      else { document.getElementById('sCty').textContent = '—'; document.getElementById('sSubCty').textContent = 'Add city!'; document.getElementById('hc3').textContent = '—' }
      const tm = {}; memories.forEach(m => (m.tags || []).forEach(t => { tm[t] = (tm[t] || 0) + 1 }));
      const tt = Object.entries(tm).sort((a, b) => b[1] - a[1])[0];
      if (tt) { document.getElementById('sTagSt').textContent = '#' + tt[0]; document.getElementById('sSubTag').textContent = tt[1] + ' uses'; document.getElementById('hc4').textContent = '#' + tt[0] }
      else { document.getElementById('sTagSt').textContent = '—'; document.getElementById('sSubTag').textContent = 'Add tags!'; document.getElementById('hc4').textContent = '—' }
    }
    function refresh() { render() }
    function setFilter(t, btn) { curFilter = t; document.querySelectorAll('.fpill').forEach(b => b.classList.remove('active')); btn.classList.add('active'); render() }

    /* ── ADD / SAVE ── */
    function openAdd() {
      mediaFiles = [];
      document.getElementById('mediaPreviews').innerHTML = '';
      document.getElementById('mediaInput').value = '';
      document.getElementById('fDt').value = new Date().toISOString().split('T')[0];
      document.getElementById('addOv').classList.add('open');
    }
    function closeAdd() { document.getElementById('addOv').classList.remove('open') }
    async function saveMemory() {
      const title = document.getElementById('fTi').value.trim();
      const date = document.getElementById('fDt').value;
      if (!title) { toast('Please enter a title.', false); return }
      if (!date) { toast('Please pick a date.', false); return }
      const tags = document.getElementById('fTg').value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      const memId = Date.now();

      /* ── Upload photos/videos to Firebase Storage first ── */
      let processedMedia = [...mediaFiles];
      if (mediaFiles.length > 0) {
        closeAdd(); // close modal so user sees the loader
        showLoading('Uploading photos & videos…');
        processedMedia = await uploadMediaToStorage(currentUser, memId, mediaFiles);
        hideLoading();
      } else {
        closeAdd();
      }

      memories.unshift({
        id: memId, title,
        type: document.getElementById('fTy').value,
        date,
        endDate: document.getElementById('fEd').value || null,
        city: document.getElementById('fCi').value.trim(),
        country: document.getElementById('fCo').value.trim(),
        mood: document.getElementById('fMd').value,
        tags,
        desc: document.getElementById('fDe').value.trim(),
        media: processedMedia   /* {url, type, name, path} instead of {data, type, name} */
      });

      ['fTi', 'fDt', 'fEd', 'fCi', 'fCo', 'fTg', 'fDe'].forEach(id => document.getElementById(id).value = '');
      curFilter = 'all';
      document.querySelectorAll('.fpill').forEach((b, i) => b.classList.toggle('active', i === 0));
      refresh();
      toast('Echo saved to vault.');
      document.getElementById('app').scrollIntoView({ behavior: 'smooth' });
      /* sync the updated memories list (with Storage URLs) to Firestore */
      await saveMem(currentUser, memories);
    }

    /* ═══════════════════════════════
       DETAIL MODAL — FIXED MEDIA
    ═══════════════════════════════ */
    function openDet(id) {
      const m = memories.find(x => x.id === id); if (!m) return;
      detailId = id; galCurrent = 0;
      const ic = ICONS[m.type] || 'fa-box';
      const mi = MOOD_ICONS[m.mood] || 'fa-face-smile';
      const med = m.media || [];
      galTotal = med.length;
      const moodLabel = MOOD_LABELS[m.mood] || '—';

      // Build gallery
      let galleryHTML = '';
      if (med.length) {
        // Build slides
        const slides = med.map((f, i) => {
          const isVid = f.type.startsWith('video');
          const src = f.url || f.data;
          return `<div class="det-gallery-slide">
        ${isVid
              ? `<video src="${src}" controls preload="metadata" style="width:100%;height:100%;object-fit:contain;display:block;background:#000"></video>`
              : `<img src="${src}" alt="Memory ${i + 1}" onclick="openLightbox(${i})" style="width:100%;height:100%;object-fit:cover;display:block;cursor:zoom-in">`}
        ${!isVid ? '<div class="det-gallery-overlay" style="pointer-events:none"></div>' : ''}
      </div>`;
        }).join('');

        // Build thumbs
        const thumbs = med.map((f, i) => {
          const isVid = f.type.startsWith('video');
          const src = f.url || f.data;
          return `<div class="det-thumb ${i === 0 ? 'active' : ''}" onclick="goGalTo(${i})" id="dthumb${i}">
        ${isVid
              ? `<div class="det-thumb-vid"><i class="fa-solid fa-play"></i></div>`
              : `<img src="${src}" alt="">`}
      </div>`;
        }).join('');

        galleryHTML = `<div class="det-gallery" id="detGallery">
      <div class="det-gallery-track" id="detGalTrack">${slides}</div>
      ${med.length > 1 ? `
        <button class="det-gal-btn det-gal-prev" id="galPrevBtn" onclick="shiftDetGal(-1)" disabled><i class="fa-solid fa-chevron-left"></i></button>
        <button class="det-gal-btn det-gal-next" id="galNextBtn" onclick="shiftDetGal(1)"><i class="fa-solid fa-chevron-right"></i></button>
        <div class="det-counter"><i class="fa-solid fa-image"></i><span id="galCounterTxt">1 / ${med.length}</span></div>
        <div class="det-thumbs" id="detThumbs">${thumbs}</div>` : ''}
    </div>`;
      } else {
        galleryHTML = `<div class="det-gallery"><div class="det-gallery-empty"><i class="fa-solid fa-photo-film"></i><span>No media attached</span></div></div>`;
      }

      let pills = `<div class="det-pill"><i class="fa-solid fa-calendar-days"></i>${fmtDate(m.date)}${m.endDate ? ' — ' + fmtDate(m.endDate) : ''}</div>`;
      if (m.city || m.country) pills += `<div class="det-pill"><i class="fa-solid fa-location-dot"></i>${[m.city, m.country].filter(Boolean).map(esc).join(', ')}</div>`;
      if (m.mood) pills += `<div class="det-pill"><i class="fa-solid ${mi}"></i> ${moodLabel}</div>`;
      if (m.type === 'trip' && m.endDate) {
        const d1 = new Date(m.date + 'T00:00:00'), d2 = new Date(m.endDate + 'T00:00:00');
        const days = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        if (days > 0) pills += `<div class="det-pill"><i class="fa-solid fa-clock"></i>${days} day${days !== 1 ? 's' : ''}</div>`;
      }

      document.getElementById('detContent').innerHTML = `
    ${galleryHTML}
    <div class="det-type-stripe t-${m.type}"></div>
    <div class="det-body">
      <div class="det-header-row">
        <div class="det-typebadge t-${m.type}"><i class="fa-solid ${ic}"></i> ${TYPE_LABELS[m.type] || m.type}</div>
      </div>
      <div class="det-title">${esc(m.title)}</div>
      <div class="det-info-pills">${pills}</div>
      ${m.desc ? `
        <div class="det-section-label"><i class="fa-solid fa-pen-to-square"></i> Story</div>
        <div class="det-desc">${esc(m.desc).replace(/\n/g, '<br>')}</div>
      `: `<div class="det-no-desc"><i class="fa-regular fa-file-lines" style="opacity:.35;margin-right:6px"></i>No description added.</div>`}
      ${(m.tags || []).length ? `
        <div style="margin-top:16px">
          <div class="det-section-label"><i class="fa-solid fa-hashtag"></i> Tags</div>
          <div class="det-tags">${m.tags.map(t => `<span class="det-tag t-${m.type}">#${esc(t)}</span>`).join('')}</div>
        </div>`: ''}
    </div>
    <div class="det-actions">
      <button class="det-del-btn" onclick="confirmDeleteEcho()"><i class="fa-solid fa-trash"></i> Delete Echo</button>
    </div>
    <button class="det-close-btn" onclick="closeDet()"><i class="fa-solid fa-xmark"></i></button>`;

      document.getElementById('detOv').classList.add('open');
      // init gallery position
      if (med.length > 0) goGalTo(0);
    }

    function goGalTo(i) {
      if (galTotal === 0) return;
      galCurrent = i;
      const track = document.getElementById('detGalTrack');
      if (track) track.style.transform = `translateX(-${i * 100}%)`;
      // update thumbs
      document.querySelectorAll('.det-thumb').forEach((t, j) => t.classList.toggle('active', j === i));
      // update counter
      const ct = document.getElementById('galCounterTxt');
      if (ct) ct.textContent = `${i + 1} / ${galTotal}`;
      // update nav btns
      const pb = document.getElementById('galPrevBtn'); const nb = document.getElementById('galNextBtn');
      if (pb) pb.disabled = i === 0;
      if (nb) nb.disabled = i === galTotal - 1;
      // pause all videos then play current if video
      document.querySelectorAll('.det-gallery-slide video').forEach((v, j) => {
        if (j !== i) { v.pause() }
      });
    }
    function shiftDetGal(dir) {
      const next = Math.max(0, Math.min(galCurrent + dir, galTotal - 1));
      goGalTo(next);
    }
    function closeDet() {
      // Pause all videos before closing
      document.querySelectorAll('#detContent video').forEach(v => v.pause());
      document.getElementById('detOv').classList.remove('open');
      detailId = null;
    }
    function confirmDeleteEcho() {
      openConfirm({
        icon: 'fa-trash',
        iconType: 'danger',
        title: 'Delete Echo?',
        msg: 'This memory will be permanently removed from your vault. This cannot be undone.',
        okLabel: 'Delete',
        okClass: '',
        onOk: deleteCurrentEcho
      });
    }
    async function deleteCurrentEcho() {
      if (!detailId) return;
      memories = memories.filter(m => m.id !== detailId);
      refresh(); closeDet(); toast('Echo deleted.');
      await saveMem(currentUser, memories); // sync deletion to cloud
    }

    /* ── CONFIRM MODAL ── */
    let _confirmCallback = null;
    function openConfirm({ icon, iconType, title, msg, okLabel, okClass, onOk }) {
      document.getElementById('confirmIco').className = 'fa-solid ' + icon;
      document.getElementById('confirmIcon').className = 'confirm-icon ' + (iconType || 'danger');
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMsg').textContent = msg;
      const okBtn = document.getElementById('confirmOkBtn');
      // update text node only — preserve event listener on the button
      okBtn.className = 'confirm-ok ' + (okClass || '');
      // find/update the text span inside, or set full innerHTML since listener is on button element itself
      okBtn.innerHTML = `<i class="fa-solid fa-check" style="margin-right:6px"></i>${okLabel || 'Confirm'}`;
      _confirmCallback = onOk;
      document.getElementById('confirmOv').classList.add('open');
    }
    function closeConfirm() {
      document.getElementById('confirmOv').classList.remove('open');
      _confirmCallback = null;
    }
    // Use event delegation so innerHTML replacement doesn't break the listener
    document.getElementById('confirmOv').addEventListener('click', function (e) {
      if (e.target === this) { closeConfirm(); return; }
      if (e.target.id === 'confirmOkBtn' || e.target.closest('#confirmOkBtn')) {
        const cb = _confirmCallback;
        closeConfirm();
        if (cb) cb();
      }
    });

    /* ── DRAG & DROP ── */
    const uz = document.getElementById('uploadZone');
    uz.addEventListener('dragover', e => { e.preventDefault(); uz.style.borderStyle = 'solid'; uz.style.background = 'rgba(255,107,107,.06)' });
    uz.addEventListener('dragleave', () => { uz.style.borderStyle = 'dashed'; uz.style.background = '' });
    uz.addEventListener('drop', e => { e.preventDefault(); uz.style.borderStyle = 'dashed'; uz.style.background = ''; handleMediaUpload(e.dataTransfer.files) });

    /* close on backdrop */
    ['addOv', 'detOv'].forEach(id => {
      document.getElementById(id).addEventListener('click', function (e) {
        if (e.target === this) {
          if (id === 'detOv') {
            document.querySelectorAll('#detContent video').forEach(v => v.pause());
          }
          this.classList.remove('open');
        }
      });
    });

    /* enter key on auth */
    document.getElementById('lP').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin() });
    document.getElementById('sCP').addEventListener('keydown', e => { if (e.key === 'Enter') doSignup() });

    /* keyboard gallery nav — handled inside lightbox block above + detail below */
    document.addEventListener('keydown', e => {
      if (document.getElementById('lightboxOv').classList.contains('open')) return; // handled above
      if (!document.getElementById('detOv').classList.contains('open')) return;
      if (e.key === 'ArrowLeft') shiftDetGal(-1);
      if (e.key === 'ArrowRight') shiftDetGal(1);
      if (e.key === 'Escape') closeDet();
    });

    /* ── LIGHTBOX ── */
    let lbCurrent = 0, lbMedia = [], lbTouchStartX = 0, lbTouchStartY = 0;

    function openLightbox(startIndex) {
      const m = memories.find(x => x.id === detailId); if (!m || !m.media || !m.media.length) return;
      lbMedia = m.media;
      lbCurrent = startIndex || 0;

      // Build slides
      document.getElementById('lbTrack').innerHTML = lbMedia.map((f, i) => {
        const isVid = f.type.startsWith('video');
        const src = f.url || f.data;
        return `<div class="lb-slide">
      ${isVid
            ? `<video src="${src}" controls preload="metadata"></video>`
            : `<img src="${src}" alt="Photo ${i + 1}" draggable="false">`}
    </div>`;
      }).join('');

      // Build dots
      document.getElementById('lbDots').innerHTML = lbMedia.length > 1
        ? lbMedia.map((_, i) => `<div class="lb-dot ${i === lbCurrent ? 'active' : ''}" onclick="lbGoTo(${i})"></div>`).join('')
        : '';
      document.getElementById('lbDots').style.display = lbMedia.length > 1 ? 'flex' : 'none';

      // Show/hide prev/next
      document.getElementById('lbPrev').style.display = lbMedia.length > 1 ? 'flex' : 'none';
      document.getElementById('lbNext').style.display = lbMedia.length > 1 ? 'flex' : 'none';

      // Swipe hint on mobile
      const hint = document.getElementById('lbHint');
      if (lbMedia.length > 1 && window.innerWidth <= 600) {
        hint.style.display = 'flex';
        // re-trigger animation
        hint.style.animation = 'none';
        requestAnimationFrame(() => hint.style.animation = 'fadeHint 2.8s ease forwards');
      } else { hint.style.display = 'none' }

      document.getElementById('lightboxOv').classList.add('open');
      document.body.style.overflow = 'hidden';
      lbGoTo(lbCurrent, false);

      // Pause detail gallery videos while lightbox is open
      document.querySelectorAll('.det-gallery-slide video').forEach(v => v.pause());
    }

    function lbGoTo(i, animate = true) {
      lbCurrent = Math.max(0, Math.min(i, lbMedia.length - 1));
      const track = document.getElementById('lbTrack');
      track.style.transition = animate ? 'transform .35s cubic-bezier(.4,0,.2,1)' : 'none';
      track.style.transform = `translateX(-${lbCurrent * 100}%)`;
      // counter
      document.getElementById('lbCounter').textContent = `${lbCurrent + 1} / ${lbMedia.length}`;
      // dots
      document.querySelectorAll('.lb-dot').forEach((d, j) => d.classList.toggle('active', j === lbCurrent));
      // btns
      document.getElementById('lbPrev').disabled = lbCurrent === 0;
      document.getElementById('lbNext').disabled = lbCurrent === lbMedia.length - 1;
      // pause other videos
      document.querySelectorAll('#lbTrack video').forEach((v, j) => { if (j !== lbCurrent) v.pause() });
    }
    function lbNav(dir) { lbGoTo(lbCurrent + dir) }

    function closeLightbox() {
      document.querySelectorAll('#lbTrack video').forEach(v => v.pause());
      document.getElementById('lightboxOv').classList.remove('open');
      document.body.style.overflow = '';
    }

    // Touch swipe for lightbox
    (function () {
      let tx = 0, ty = 0;
      const stage = document.getElementById('lbStage');
      stage.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY }, { passive: true });
      stage.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - tx;
        const dy = e.changedTouches[0].clientY - ty;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) { lbNav(dx < 0 ? 1 : -1) }
      }, { passive: true });
    })();

    // Keyboard for lightbox
    document.addEventListener('keydown', e => {
      if (document.getElementById('lightboxOv').classList.contains('open')) {
        if (e.key === 'ArrowLeft') { e.stopPropagation(); lbNav(-1) }
        if (e.key === 'ArrowRight') { e.stopPropagation(); lbNav(1) }
        if (e.key === 'Escape') { e.stopPropagation(); closeLightbox() }
        return;
      }
    });

    // Close lightbox on backdrop click
    document.getElementById('lightboxOv').addEventListener('click', function (e) {
      if (e.target === this || e.target === document.getElementById('lbStage')) closeLightbox();
    });

    // ── TOUCH SWIPE FOR DETAIL GALLERY ──
    (function () {
      let tx = 0, ty = 0;
      document.addEventListener('touchstart', e => {
        if (!document.getElementById('detOv').classList.contains('open')) return;
        const gal = document.getElementById('detGallery');
        if (gal && gal.contains(e.target)) { tx = e.touches[0].clientX; ty = e.touches[0].clientY }
      }, { passive: true });
      document.addEventListener('touchend', e => {
        if (!document.getElementById('detOv').classList.contains('open')) return;
        const gal = document.getElementById('detGallery');
        if (!gal || !gal.contains(e.target)) return;
        const dx = e.changedTouches[0].clientX - tx;
        const dy = e.changedTouches[0].clientY - ty;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) shiftDetGal(dx < 0 ? 1 : -1);
      }, { passive: true });
    })();

    /* ── INTERSECTION OBSERVER ── */
    const io = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }) }, { threshold: .08 });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));

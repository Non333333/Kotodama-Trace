/* assets/js/game.js
   「意志と時間」：世界(JSON)を読み、舞台(HTML)を動かし、空気(CSS)を切り替える。
   GitHub Pages前提。localStorageで進行保存。
*/
(() => {
  // ===== DOM =====
  const $ = (sel) => document.querySelector(sel);

  const sceneTitle = $("#scene-title");
  const sceneField = $("#scene-field");
  const sceneTalk = $("#scene-talk");
  const sceneKotodama = $("#scene-kotodama");

  const fade = $("#fade");

  const btnStart = $("#btn-start");
  const btnKotodama = $("#btn-kotodama");
  const btnBackTitle = $("#btn-back-title");

  const field = $("#field");
  const hudKotodama = $("#hud-kotodama");

  const talkName = $("#talk-name");
  const talkText = $("#talk-text");

  const kotodamaList = $("#kotodama-list");

  // ===== Paths =====
  const PATH = {
    world: "assets/data/world.json",
    npcs: "assets/data/npcs.json",
    kotodama: "assets/data/kotodama.json",
  };

  // ===== State =====
  const State = {
    world: null,
    npcs: [],
    kotodama: [],
    progress: null, // localStorageの中身
    isTalking: false,
    talkQueue: [],
    talkNpcId: null,
    typeTimer: null,
    typeState: null,
    audio: {
      seTalk: null,
      seGet: null,
      bgmField: null,
    },
  };

  // ===== Storage =====
  const LS_KEY = "kotodama_trace_save_v1";

  function loadProgress() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { talked: {}, kotodamaUnlocked: {} };
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return { talked: {}, kotodamaUnlocked: {} };
      obj.talked ||= {};
      obj.kotodamaUnlocked ||= {};
      return obj;
    } catch {
      return { talked: {}, kotodamaUnlocked: {} };
    }
  }

  function saveProgress() {
    localStorage.setItem(LS_KEY, JSON.stringify(State.progress));
  }

  // ===== Scene Utils =====
  function setScene(which) {
    // シーンは「一つだけis-active」にする（talk overlay除く）
    [sceneTitle, sceneField, sceneKotodama].forEach((s) => s.classList.remove("is-active"));
    if (which === "title") sceneTitle.classList.add("is-active");
    if (which === "field") sceneField.classList.add("is-active");
    if (which === "kotodama") sceneKotodama.classList.add("is-active");

    // talk overlayは別管理
    if (which !== "talk") sceneTalk.classList.remove("is-active");
  }

  async function whiteout() {
    const ms = State.world?.ui?.whiteout?.fadeMs ?? 380;
    const hold = State.world?.ui?.whiteout?.holdMs ?? 250;
    fade.classList.add("is-on");
    await wait(ms + 30);
    await wait(hold);
    fade.classList.remove("is-on");
    await wait(ms);
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ===== Fetch JSON =====
  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load: ${path}`);
    return res.json();
  }

  // ===== Audio =====
  function setupAudioFromWorld() {
    const a = State.world?.audio;
    if (!a) return;

    const seTalkPath = a.se?.talk;
    const seGetPath = a.se?.get;
    const bgmFieldPath = a.bgm?.field;

    if (seTalkPath) State.audio.seTalk = new Audio(seTalkPath);
    if (seGetPath) State.audio.seGet = new Audio(seGetPath);
    if (bgmFieldPath) {
      const bgm = new Audio(bgmFieldPath);
      bgm.loop = true;
      bgm.volume = 0.5;
      State.audio.bgmField = bgm;
    }
  }

  function playSE(which) {
    const a = which === "talk" ? State.audio.seTalk : State.audio.seGet;
    if (!a) return;
    try {
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }

  function startBGM() {
    const bgm = State.audio.bgmField;
    if (!bgm) return;
    bgm.play().catch(() => {});
  }

  function stopBGM() {
    const bgm = State.audio.bgmField;
    if (!bgm) return;
    try {
      bgm.pause();
      bgm.currentTime = 0;
    } catch {}
  }

  // ===== Speech (optional) =====
  function speak(text) {
    const enabled = !!State.world?.audio?.useSpeechSynthesis;
    if (!enabled) return;
    if (!("speechSynthesis" in window)) return;

    // 長文は詰まるので短めだけ読む（空気を壊さない）
    const t = String(text || "").trim();
    if (!t) return;

    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = State.world?.audio?.defaultVoiceLang || "ja-JP";
      u.rate = 1.05;
      u.pitch = 1.0;
      u.volume = 0.9;
      window.speechSynthesis.speak(u);
    } catch {}
  }

  // ===== NPC Render =====
  function clearFieldNPCs() {
    [...field.querySelectorAll(".npc")].forEach((n) => n.remove());
  }

  function renderNPCs() {
    clearFieldNPCs();
    for (const npc of State.npcs) {
      const el = document.createElement("div");
      el.className = "npc";
      el.dataset.id = npc.id;
      el.dataset.name = npc.name;

      // positionは0..1の相対。CSS側のtransformで中心合わせ済み
      el.style.left = `${Math.round((npc.position?.x ?? 0.5) * 100)}%`;
      el.style.top = `${Math.round((npc.position?.y ?? 0.5) * 100)}%`;

      // 2周会話済みなら少し薄く
      const rounds = State.progress.talked[npc.id] || 0;
      const req = State.world?.clearRule?.talkRoundsRequired ?? 2;
      if (rounds >= req) el.classList.add("is-cleared");

      el.addEventListener("click", () => onClickNPC(npc.id), { passive: true });
      field.appendChild(el);
    }
  }

  // ===== HUD =====
  function updateHud() {
    const total = State.kotodama.length;
    const got = State.kotodama.filter((k) => !!State.progress.kotodamaUnlocked[k.id]).length;
    hudKotodama.textContent = `言霊 ${got} / ${total}`;
  }

  // ===== Talk System =====
  function beginTalk(npcId) {
    if (State.isTalking) return;
    const npc = State.npcs.find((n) => n.id === npcId);
    if (!npc) return;

    playSE("talk");

    State.isTalking = true;
    State.talkNpcId = npcId;

    // 何周目か
    const rounds = State.progress.talked[npcId] || 0;
    const req = State.world?.clearRule?.talkRoundsRequired ?? 2;

    let lines;
    if (rounds <= 0) lines = npc.talk?.first || [];
    else if (rounds === 1) lines = npc.talk?.second || [];
    else lines = npc.talk?.repeat || [];

    State.talkQueue = [...lines];

    talkName.textContent = npc.name;
    talkText.textContent = "";

    sceneTalk.classList.add("is-active");
    // 会話中は舞台を触れなくする（CSS pointer-events はtalk-windowのみ有効）
    // ただし完全ロックはJSでやるならここで field.style.pointerEvents = 'none';
    field.style.pointerEvents = "none";

    // 最初の一行
    nextTalkLine();

    // overlayクリックで送り
    sceneTalk.addEventListener("click", onAdvanceTalk, { passive: true });
  }

  function endTalk() {
    sceneTalk.classList.remove("is-active");
    sceneTalk.removeEventListener("click", onAdvanceTalk);

    field.style.pointerEvents = "auto";

    State.isTalking = false;
    State.talkQueue = [];
    State.talkNpcId = null;

    // タイプライター停止
    stopTypewriter();

    // NPCの見た目更新
    renderNPCs();
  }

  function onAdvanceTalk() {
    if (!State.isTalking) return;

    // タイプ中なら一気に表示
    if (State.typeState?.isTyping) {
      State.typeState.finishNow();
      return;
    }
    nextTalkLine();
  }

  function nextTalkLine() {
    if (!State.talkQueue.length) {
      // 会話終了：周回カウント更新（first/secondのときだけ）
      const npcId = State.talkNpcId;
      if (npcId) {
        const prev = State.progress.talked[npcId] || 0;
        const next = Math.min(prev + 1, 99);
        State.progress.talked[npcId] = next;

        // 2回目会話が終わったタイミングで言霊付与（prev==1 → next==2）
        if (prev === 1) {
          grantKotodamaForNPC(npcId);
        }
        saveProgress();
        updateHud();
        checkClear();
      }

      endTalk();
      return;
    }

    const line = State.talkQueue.shift();
    typeLine(String(line || ""));
  }

  function stopTypewriter() {
    if (State.typeTimer) {
      clearInterval(State.typeTimer);
      State.typeTimer = null;
    }
    State.typeState = null;
  }

  function typeLine(line) {
    stopTypewriter();

    // ちょい読み上げ（任意）
    speak(line);

    const tw = State.world?.ui?.typewriter;
    const enabled = tw?.enabled ?? true;
    const cps = tw?.charsPerSecond ?? 28;

    if (!enabled) {
      talkText.textContent = line;
      return;
    }

    let i = 0;
    talkText.textContent = "";

    const state = {
      isTyping: true,
      finishNow: () => {
        if (!state.isTyping) return;
        state.isTyping = false;
        stopTypewriter();
        talkText.textContent = line;
      },
    };
    State.typeState = state;

    const interval = Math.max(10, Math.floor(1000 / Math.max(6, cps)));
    State.typeTimer = setInterval(() => {
      if (!state.isTyping) return;
      i++;
      talkText.textContent = line.slice(0, i);
      if (i >= line.length) {
        state.isTyping = false;
        stopTypewriter();
      }
    }, interval);
  }

  // ===== Kotodama =====
  function grantKotodamaForNPC(npcId) {
    const npc = State.npcs.find((n) => n.id === npcId);
    if (!npc?.kotodamaId) return;

    const id = npc.kotodamaId;
    if (State.progress.kotodamaUnlocked[id]) return;

    State.progress.kotodamaUnlocked[id] = true;
    playSE("get");
    saveProgress();
    renderKotodamaList(); // その場で反映してもいい
  }

  function renderKotodamaList() {
    kotodamaList.innerHTML = "";
    for (const k of State.kotodama) {
      const unlocked = !!State.progress.kotodamaUnlocked[k.id];

      const card = document.createElement("div");
      card.className = "kotodama-card" + (unlocked ? "" : " is-locked");

      const title = document.createElement("div");
      title.className = "kotodama-title";
      title.textContent = unlocked ? k.title : "？？？";

      const text = document.createElement("div");
      text.className = "kotodama-text";
      text.textContent = unlocked ? k.text : "未取得";

      card.appendChild(title);
      card.appendChild(text);
      kotodamaList.appendChild(card);
    }
  }

  // ===== Clear Check =====
  function checkClear() {
    const rule = State.world?.clearRule || { talkRoundsRequired: 2, needAllKotodama: true };
    const reqRounds = rule.talkRoundsRequired ?? 2;

    // 全NPCが2周話したか
    const allTalked = State.npcs.every((n) => (State.progress.talked[n.id] || 0) >= reqRounds);

    // 全言霊取得
    const allKotodama = State.kotodama.every((k) => !!State.progress.kotodamaUnlocked[k.id]);

    if (allTalked && (!rule.needAllKotodama || allKotodama)) {
      // クリア：ホワイトアウト → タイトルへ戻す
      onClear();
    }
  }

  let clearing = false;
  async function onClear() {
    if (clearing) return;
    clearing = true;

    // BGM止めてもいい（空白を作る）
    stopBGM();

    await whiteout();
    setScene("title");
    updateHud();
    renderKotodamaList();

    clearing = false;
  }

  // ===== Events =====
  function onClickNPC(npcId) {
    // タイトルや言霊一覧ではNPCを触れない設計だが、念のため
    if (!sceneField.classList.contains("is-active")) return;
    beginTalk(npcId);
  }

  btnStart.addEventListener("click", async () => {
    // スマホ制限対策：ユーザー操作後に音を鳴らせる
    startBGM();
    await whiteout();
    setScene("field");
  });

  btnKotodama.addEventListener("click", async () => {
    await whiteout();
    renderKotodamaList();
    setScene("kotodama");
  });

  btnBackTitle.addEventListener("click", async () => {
    await whiteout();
    setScene("title");
  });

  // ===== Boot =====
  async function boot() {
    try {
      State.progress = loadProgress();

      // JSONロード
      const [world, npcs, kotodama] = await Promise.all([
        fetchJson(PATH.world),
        fetchJson(PATH.npcs),
        fetchJson(PATH.kotodama),
      ]);

      State.world = world;
      State.npcs = (npcs?.npcs || []).slice();
      State.kotodama = (kotodama?.kotodama || []).slice();

      // Audio
      setupAudioFromWorld();

      // UI
      $("#game-title").textContent = State.world?.title || "言霊巡り";
      updateHud();
      renderNPCs();
      renderKotodamaList();

      // 初期シーン
      setScene("title");

      // もし最初からクリア条件満たしてたら（デバッグ時）反映
      checkClear();
    } catch (e) {
      // 最低限のフェイルセーフ表示
      setScene("title");
      $("#game-title").textContent = "読み込みに失敗しました";
      console.error(e);
    }
  }

  boot();
})();
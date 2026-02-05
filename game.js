/* assets/js/game.js (修正版) */
(() => {
  // ===== データ埋め込み (ローカル実行対策) =====
  // 本来は外部JSONですが、PCで直接開くと読み込めないためここに統合します
  const DATA = {
    world: {
      "gameId": "kotodama-trace",
      "version": 1,
      "title": "言霊巡り",
      "clearRule": { "talkRoundsRequired": 2, "needAllKotodama": true },
      "ui": {
        "typewriter": { "enabled": true, "charsPerSecond": 28, "tapToSkip": true },
        "whiteout": { "fadeMs": 380, "holdMs": 250 }
      },
      "audio": {
        "useSpeechSynthesis": true,
        "defaultVoiceLang": "ja-JP",
        "se": { "talk": "assets/audio/se_talk.wav", "get": "assets/audio/se_get.wav" },
        "bgm": { "field": "assets/audio/bgm_field.mp3" }
      }
    },
    npcs: [
      {
        "id": "npc_miyo", "name": "ミヨ", "position": { "x": 0.22, "y": 0.68 }, "kotodamaId": "koto_miyo_01",
        "talk": {
          "first": ["……あ、来たんだ", "ここ、静かでしょ。理由は知らないけど", "私は、ここにいるだけ。動く理由がなくて", "……あなたは、まだ歩ける顔してるね"],
          "second": ["また来てくれたんだ", "前は言わなかったけど……人を支えるの、向いてなかった", "折れたの、私じゃなくて、たぶん期待", "それでもさ、優しくした時間まで嘘にはしたくない", "……これ、置いていって"],
          "repeat": ["ここにいるよ。急がなくていい"]
        }
      },
      {
        "id": "npc_kai", "name": "カイ", "position": { "x": 0.52, "y": 0.55 }, "kotodamaId": "koto_kai_01",
        "talk": {
          "first": ["お、観光？", "ここ、地図に載らないんだよ。都合いいでしょ", "俺？ただの寄り道が長引いてるだけ", "人生なんて、だいたいそんなもん"],
          "second": ["あー……二回目だな", "寄り道って言い方、便利でさ", "選ばなかった道が増えるほど、帰れなくなる", "笑ってないと、足が止まるんだ"],
          "repeat": ["寄り道は終わらない。終わらせたら帰ることになる"]
        }
      },
      {
        "id": "npc_towa", "name": "トワ", "position": { "x": 0.78, "y": 0.42 }, "kotodamaId": "koto_towa_01",
        "talk": {
          "first": ["……何？", "記録はある。あなたのは、まだ", "ここにいる理由は、書くため", "話は、終わり"],
          "second": ["……また来た", "記録は、増えた", "名前を呼ばれるの、久しぶり", "……悪くない"],
          "repeat": ["記録は逃げない。あなたも、逃げない"]
        }
      },
      {
        "id": "npc_yui", "name": "ユイ", "position": { "x": 0.10, "y": 0.52 }, "kotodamaId": "koto_yui_01",
        "talk": {
          "first": ["あ、こんにちは", "ここ、通り道なんだ", "行く気はあるんだけどね", "今日は、まだ"],
          "second": ["また会った", "ね、まだここにいるでしょ", "終わらせないと、始まらないんだって", "知ってる。でも……"],
          "repeat": ["明日になったら、明日の言い訳が生まれるだけ"]
        }
      }
    ],
    kotodama: [
      { "id": "koto_miyo_01", "ownerNpcId": "npc_miyo", "title": "折れなかった優しさ", "text": "優しさは失敗しなかった\n期待だけが先に倒れただけ" },
      { "id": "koto_kai_01", "ownerNpcId": "npc_kai", "title": "選ばなかった道", "text": "選ばなかった道は\n消えたんじゃなく\n立ち止まる理由になった" },
      { "id": "koto_towa_01", "ownerNpcId": "npc_towa", "title": "呼ばれた名前", "text": "記録に残らなくても\n名前を呼ばれた事実は\n消えない" },
      { "id": "koto_yui_01", "ownerNpcId": "npc_yui", "title": "今日はまだ", "text": "今日はまだ\n明日になる前の\n言い訳だった" }
    ]
  };

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

  // ===== State =====
  const State = {
    world: DATA.world,
    npcs: DATA.npcs,
    kotodama: DATA.kotodama,
    progress: null, 
    isTalking: false,
    talkQueue: [],
    talkNpcId: null,
    typeTimer: null,
    typeState: null,
    audio: { seTalk: null, seGet: null, bgmField: null },
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
    [sceneTitle, sceneField, sceneKotodama].forEach((s) => s.classList.remove("is-active"));
    if (which === "title") sceneTitle.classList.add("is-active");
    if (which === "field") sceneField.classList.add("is-active");
    if (which === "kotodama") sceneKotodama.classList.add("is-active");
    
    if (which !== "talk") sceneTalk.classList.remove("is-active");
  }

  // 【修正】シーン切り替えを「白くなっている間」に行う関数
  async function transitionTo(sceneName, callback) {
    const ms = State.world?.ui?.whiteout?.fadeMs ?? 380;
    const hold = State.world?.ui?.whiteout?.holdMs ?? 250;
    
    // 1. フェードイン（白くなる）
    fade.classList.add("is-on");
    await wait(ms + 50);

    // 2. 画面が白い間にシーン切り替え等の処理を実行
    if(callback) callback();
    setScene(sceneName);
    
    // 3. 少し待つ（演出）
    await wait(hold);

    // 4. フェードアウト（画面が見えるようになる）
    fade.classList.remove("is-on");
    await wait(ms);
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ===== Audio =====
  function setupAudioFromWorld() {
    const a = State.world?.audio;
    if (!a) return;
    // エラー防止のため new Audio で失敗しても握りつぶす
    try {
      if (a.se?.talk) State.audio.seTalk = new Audio(a.se.talk);
      if (a.se?.get) State.audio.seGet = new Audio(a.se.get);
      if (a.bgm?.field) {
        const bgm = new Audio(a.bgm.field);
        bgm.loop = true;
        bgm.volume = 0.5;
        State.audio.bgmField = bgm;
      }
    } catch(e) { console.log("Audio setup failed (ignore)", e); }
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
    try { bgm.pause(); bgm.currentTime = 0; } catch {}
  }

  // ===== Speech =====
  function speak(text) {
    if (!State.world?.audio?.useSpeechSynthesis) return;
    if (!("speechSynthesis" in window)) return;
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
    if(!State.npcs) return; // 安全策

    for (const npc of State.npcs) {
      const el = document.createElement("div");
      el.className = "npc";
      el.dataset.id = npc.id;
      el.dataset.name = npc.name;
      el.style.left = `${Math.round((npc.position?.x ?? 0.5) * 100)}%`;
      el.style.top = `${Math.round((npc.position?.y ?? 0.5) * 100)}%`;

      const rounds = State.progress.talked[npc.id] || 0;
      const req = State.world?.clearRule?.talkRoundsRequired ?? 2;
      if (rounds >= req) el.classList.add("is-cleared");

      el.addEventListener("click", (e) => {
        e.stopPropagation(); // フィールド自体のクリックと分ける
        onClickNPC(npc.id);
      }, { passive: false });
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

    const rounds = State.progress.talked[npcId] || 0;
    let lines;
    if (rounds <= 0) lines = npc.talk?.first || [];
    else if (rounds === 1) lines = npc.talk?.second || [];
    else lines = npc.talk?.repeat || [];

    State.talkQueue = [...lines];
    talkName.textContent = npc.name;
    talkText.textContent = "";

    sceneTalk.classList.add("is-active");
    field.style.pointerEvents = "none";
    nextTalkLine();
    sceneTalk.addEventListener("click", onAdvanceTalk);
  }

  function endTalk() {
    sceneTalk.classList.remove("is-active");
    sceneTalk.removeEventListener("click", onAdvanceTalk);
    field.style.pointerEvents = "auto";
    State.isTalking = false;
    State.talkQueue = [];
    State.talkNpcId = null;
    stopTypewriter();
    renderNPCs();
  }

  function onAdvanceTalk() {
    if (!State.isTalking) return;
    if (State.typeState?.isTyping) {
      State.typeState.finishNow();
      return;
    }
    nextTalkLine();
  }

  function nextTalkLine() {
    if (!State.talkQueue.length) {
      const npcId = State.talkNpcId;
      if (npcId) {
        const prev = State.progress.talked[npcId] || 0;
        const next = Math.min(prev + 1, 99);
        State.progress.talked[npcId] = next;
        if (prev === 1) grantKotodamaForNPC(npcId);
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
    if (State.typeTimer) { clearInterval(State.typeTimer); State.typeTimer = null; }
    State.typeState = null;
  }

  function typeLine(line) {
    stopTypewriter();
    speak(line);
    
    const tw = State.world?.ui?.typewriter;
    if (tw?.enabled === false) {
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
    
    const cps = tw?.charsPerSecond ?? 28;
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
    const allTalked = State.npcs.every((n) => (State.progress.talked[n.id] || 0) >= reqRounds);
    const allKotodama = State.kotodama.every((k) => !!State.progress.kotodamaUnlocked[k.id]);

    if (allTalked && (!rule.needAllKotodama || allKotodama)) {
      onClear();
    }
  }

  let clearing = false;
  async function onClear() {
    if (clearing) return;
    clearing = true;
    stopBGM();
    
    // 画面切り替えラッパーを使用
    await transitionTo("title", () => {
      updateHud();
      renderKotodamaList();
    });
    
    clearing = false;
  }

  // ===== Events =====
  function onClickNPC(npcId) {
    if (!sceneField.classList.contains("is-active")) return;
    beginTalk(npcId);
  }

  // 【修正】STARTボタン
  btnStart.addEventListener("click", () => {
    startBGM();
    // transitionTo関数を使って「白くなっている間に」フィールドへ移動
    transitionTo("field");
  });

  // 【修正】言霊ボタン
  btnKotodama.addEventListener("click", () => {
    transitionTo("kotodama", () => renderKotodamaList());
  });

  // 【修正】戻るボタン
  btnBackTitle.addEventListener("click", () => {
    transitionTo("title");
  });

  // ===== Boot =====
  function boot() {
    State.progress = loadProgress();
    setupAudioFromWorld();

    $("#game-title").textContent = State.world?.title || "言霊巡り";
    updateHud();
    renderNPCs();
    renderKotodamaList();

    setScene("title");
    
    // デバッグ用: もし最初からクリア済みなら(あまりないが)
    // checkClear(); 
  }

  boot();
})();

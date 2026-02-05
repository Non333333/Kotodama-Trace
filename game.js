/* game.js - Final Fix Version */
(() => {
  "use strict";

  // ==========================================
  // 1. DATA & CONFIGURATION
  // ==========================================
  const CONFIG = {
    gameId: "kotodama-trace-v2",
    clearReq: { rounds: 2, needAllItems: true },
    ui: { typeSpeed: 30, fadeTime: 400 },
  };

  const GAME_DATA = {
    npcs: [
      {
        id: "npc_miyo", name: "ミヨ", pos: { x: 22, y: 68 }, itemId: "koto_miyo_01",
        dialogue: {
          first: ["……あ、来たんだ", "ここ、静かでしょ。理由は知らないけど", "私は、ここにいるだけ。"],
          second: ["また来てくれたんだ", "前は言わなかったけど……人を支えるの、向いてなかった", "これ、置いていくね"],
          repeat: ["ここにいるよ。急がなくていい"]
        }
      },
      {
        id: "npc_kai", name: "カイ", pos: { x: 52, y: 55 }, itemId: "koto_kai_01",
        dialogue: {
          first: ["お、観光？", "ここ、地図に載らないんだよ。", "俺？ただの寄り道。"],
          second: ["あー……二回目だな", "寄り道って言い方、便利でさ", "笑ってないと、足が止まるんだ"],
          repeat: ["寄り道は終わらない。"]
        }
      },
      {
        id: "npc_towa", name: "トワ", pos: { x: 78, y: 42 }, itemId: "koto_towa_01",
        dialogue: {
          first: ["……何？", "記録はある。あなたのは、まだ", "話は、終わり"],
          second: ["……また来た", "記録は、増えた", "名前を呼ばれるの、久しぶり"],
          repeat: ["記録は逃げない。"]
        }
      },
      {
        id: "npc_yui", name: "ユイ", pos: { x: 10, y: 52 }, itemId: "koto_yui_01",
        dialogue: {
          first: ["あ、こんにちは", "ここ、通り道なんだ", "今日は、まだ"],
          second: ["また会った", "終わらせないと、始まらないんだって", "知ってる。でも……"],
          repeat: ["明日になったら、明日の言い訳が生まれるだけ"]
        }
      }
    ],
    items: [
      { id: "koto_miyo_01", title: "折れなかった優しさ", text: "優しさは失敗しなかった\n期待だけが先に倒れただけ" },
      { id: "koto_kai_01", title: "選ばなかった道", text: "選ばなかった道は\n消えたんじゃなく\n立ち止まる理由になった" },
      { id: "koto_towa_01", title: "呼ばれた名前", text: "記録に残らなくても\n名前を呼ばれた事実は\n消えない" },
      { id: "koto_yui_01", title: "今日はまだ", text: "今日はまだ\n明日になる前の\n言い訳だった" }
    ]
  };

  // ==========================================
  // 2. STATE MANAGEMENT
  // ==========================================
  const State = {
    saveData: { talkCounts: {}, unlockedItems: {} },
    runtime: { isTalking: false, talkQueue: [], currentNpcId: null, typingTimer: null }
  };

  const SaveSystem = {
    load() {
      try {
        const raw = localStorage.getItem(CONFIG.gameId);
        if (raw) State.saveData = { ...State.saveData, ...JSON.parse(raw) };
      } catch (e) {}
    },
    save() {
      try { localStorage.setItem(CONFIG.gameId, JSON.stringify(State.saveData)); } catch (e) {}
    },
    // ★追加: データを消去する機能
    reset() {
      localStorage.removeItem(CONFIG.gameId);
      State.saveData = { talkCounts: {}, unlockedItems: {} };
      location.reload(); // 画面を再読み込みしてリセット完了
    }
  };

  // ==========================================
  // 3. DOM & AUDIO (Simplified)
  // ==========================================
  const $ = (id) => document.getElementById(id);
  const UI = {
    fade: $("fade-layer"),
    scenes: { title: $("scene-title"), field: $("scene-field"), collection: $("scene-collection") },
    field: { area: $("field-area"), hudCount: $("hud-count") },
    talk: { overlay: $("overlay-talk"), name: $("talk-name"), text: $("talk-text") },
    collection: { list: $("collection-list") },
    buttons: { 
      start: $("btn-start"), 
      kotodama: $("btn-kotodama-list"), 
      back: $("btn-back-title"),
      reset: $("btn-reset") // ★追加
    }
  };

  const AudioSys = {
    playSE(type) { /* ここに効果音処理を追加可能 */ },
    speak(text) {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP"; u.rate = 1.2;
      window.speechSynthesis.speak(u);
    }
  };

  // ==========================================
  // 4. CORE LOGIC
  // ==========================================
  const SceneManager = {
    async change(sceneName, onMidTransition) {
      UI.fade.classList.add("is-active");
      await wait(CONFIG.ui.fadeTime);
      Object.values(UI.scenes).forEach(el => el.classList.remove("is-active"));
      if (UI.scenes[sceneName]) UI.scenes[sceneName].classList.add("is-active");
      if (onMidTransition) onMidTransition();
      await wait(200);
      UI.fade.classList.remove("is-active");
    }
  };

  const Field = {
    render() {
      UI.field.area.innerHTML = "";
      GAME_DATA.npcs.forEach(npc => {
        const el = document.createElement("div");
        el.className = "npc";
        el.style.left = `${npc.pos.x}%`;
        el.style.top = `${npc.pos.y}%`;
        el.dataset.id = npc.id;
        
        const label = document.createElement("span");
        label.className = "npc-name";
        label.textContent = npc.name;
        el.appendChild(label);

        const count = State.saveData.talkCounts[npc.id] || 0;
        if (count >= CONFIG.clearReq.rounds) el.classList.add("cleared");
        
        UI.field.area.appendChild(el);
      });
      this.updateHUD();
    },
    updateHUD() {
      const total = GAME_DATA.items.length;
      const current = Object.keys(State.saveData.unlockedItems).length;
      UI.field.hudCount.textContent = `${current} / ${total}`;
    },
    onNpcClick(npcId) {
      const npc = GAME_DATA.npcs.find(n => n.id === npcId);
      if (npc) TalkSystem.start(npc);
    }
  };

  const TalkSystem = {
    start(npc) {
      if (State.runtime.isTalking) return;
      State.runtime.isTalking = true;
      State.runtime.currentNpcId = npc.id;
      
      const count = State.saveData.talkCounts[npc.id] || 0;
      let lines = [];
      if (count === 0) lines = npc.dialogue.first;
      else if (count === 1) lines = npc.dialogue.second;
      else lines = npc.dialogue.repeat;

      State.runtime.talkQueue = [...lines];
      UI.talk.name.textContent = npc.name;
      UI.talk.overlay.classList.add("is-active");
      this.next();
    },
    next() {
      if (State.runtime.typingTimer) { this.finishTyping(); return; }
      const line = State.runtime.talkQueue.shift();
      if (!line) { this.end(); return; }
      this.typeText(line);
      AudioSys.speak(line);
    },
    typeText(text) {
      let i = 0;
      UI.talk.text.textContent = "";
      State.runtime.currentFullText = text;
      State.runtime.typingTimer = setInterval(() => {
        UI.talk.text.textContent += text.charAt(i);
        i++;
        if (i >= text.length) this.finishTyping();
      }, CONFIG.ui.typeSpeed);
    },
    finishTyping() {
      if (State.runtime.typingTimer) { clearInterval(State.runtime.typingTimer); State.runtime.typingTimer = null; }
      UI.talk.text.textContent = State.runtime.currentFullText;
    },
    end() {
      UI.talk.overlay.classList.remove("is-active");
      State.runtime.isTalking = false;
      
      const npcId = State.runtime.currentNpcId;
      const count = State.saveData.talkCounts[npcId] || 0;
      
      if (count === 1) { // 2回目の会話終了時アイテム取得
        const npc = GAME_DATA.npcs.find(n => n.id === npcId);
        if (npc && npc.itemId && !State.saveData.unlockedItems[npc.itemId]) {
          State.saveData.unlockedItems[npc.itemId] = true;
          // ここで「ポロン♪」と音を鳴らしても良い
        }
      }
      State.saveData.talkCounts[npcId] = Math.min(count + 1, 99);
      SaveSystem.save();
      Field.render();
      
      // ★修正: 会話が終わるたびにクリア判定を行う
      this.checkClear();
    },

    // ★修正: クリア判定ロジックの実装
    async checkClear() {
      // 1. 全員と2回以上話したか？
      const allTalked = GAME_DATA.npcs.every(n => (State.saveData.talkCounts[n.id] || 0) >= CONFIG.clearReq.rounds);
      // 2. 全アイテム持っているか？
      const allItems = GAME_DATA.items.length === Object.keys(State.saveData.unlockedItems).length;

      if (allTalked && allItems) {
        // 少し余韻を持たせてからクリア演出
        await wait(1000);
        alert("言霊がすべて集まりました。\nおめでとうございます。");
        
        // タイトルへ戻る
        SceneManager.change("title");
      }
    }
  };

  const Collection = {
    render() {
      UI.collection.list.innerHTML = "";
      GAME_DATA.items.forEach(item => {
        const isUnlocked = !!State.saveData.unlockedItems[item.id];
        const div = document.createElement("div");
        div.className = `card ${isUnlocked ? "" : "locked"}`;
        div.innerHTML = `<div class="card-title">${isUnlocked ? item.title : "？？？"}</div><div class="card-text">${isUnlocked ? item.text : "まだ見つかっていない"}</div>`;
        UI.collection.list.appendChild(div);
      });
    }
  };

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  function setupEvents() {
    UI.buttons.start.addEventListener("click", () => SceneManager.change("field", () => Field.render()));
    UI.buttons.kotodama.addEventListener("click", () => SceneManager.change("collection", () => Collection.render()));
    UI.buttons.back.addEventListener("click", () => SceneManager.change("title"));
    
    // ★追加: データ削除ボタンの処理
    if (UI.buttons.reset) {
      UI.buttons.reset.addEventListener("click", () => {
        if(confirm("データを削除して最初からやり直しますか？")) {
          SaveSystem.reset();
        }
      });
    }

    UI.field.area.addEventListener("click", (e) => {
      const npcEl = e.target.closest(".npc");
      if (npcEl) Field.onNpcClick(npcEl.dataset.id);
    });
    UI.talk.overlay.addEventListener("click", () => TalkSystem.next());
  }

  function boot() {
    SaveSystem.load();
    setupEvents();
    SceneManager.change("title");
  }

  window.addEventListener("DOMContentLoaded", boot);
})();

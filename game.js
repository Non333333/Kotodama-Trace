/* game.js - Refactored */
(() => {
  "use strict";

  // ==========================================
  // 1. DATA & CONFIGURATION
  // ==========================================
  const CONFIG = {
    gameId: "kotodama-trace-v2",
    clearReq: { rounds: 2, needAllItems: true },
    ui: {
      typeSpeed: 30, // ms per char
      fadeTime: 400  // ms
    },
    audio: {
      // 実際には存在するパスを指定してください
      seTalk: "assets/audio/se_talk.wav",
      seGet: "assets/audio/se_get.wav",
      bgm: "assets/audio/bgm_field.mp3"
    }
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
    saveData: {
      talkCounts: {},    // { npcId: number }
      unlockedItems: {}  // { itemId: boolean }
    },
    runtime: {
      isTalking: false,
      talkQueue: [],
      currentNpcId: null,
      typingTimer: null
    }
  };

  const SaveSystem = {
    load() {
      try {
        const raw = localStorage.getItem(CONFIG.gameId);
        if (raw) {
          const loaded = JSON.parse(raw);
          // マージして構造を保証する
          State.saveData = { ...State.saveData, ...loaded };
        }
      } catch (e) {
        console.warn("Storage access failed:", e);
      }
    },
    save() {
      try {
        localStorage.setItem(CONFIG.gameId, JSON.stringify(State.saveData));
      } catch (e) { /* ignore */ }
    }
  };

  // ==========================================
  // 3. DOM ELEMENTS
  // ==========================================
  const $ = (id) => document.getElementById(id);
  
  const UI = {
    fade: $("fade-layer"),
    scenes: {
      title: $("scene-title"),
      field: $("scene-field"),
      collection: $("scene-collection")
    },
    field: {
      area: $("field-area"),
      hudCount: $("hud-count")
    },
    talk: {
      overlay: $("overlay-talk"),
      name: $("talk-name"),
      text: $("talk-text")
    },
    collection: {
      list: $("collection-list")
    },
    buttons: {
      start: $("btn-start"),
      kotodama: $("btn-kotodama-list"),
      back: $("btn-back-title")
    }
  };

  // ==========================================
  // 4. AUDIO SYSTEM (Minimal)
  // ==========================================
  const AudioSys = {
    instances: {},
    init() {
      // エラーで止まらないようにtry-catch
      try {
        // ※必要ならここでnew Audio()などを実装
      } catch (e) {}
    },
    playSE(type) {
      // 簡易実装
      // const src = type === 'talk' ? CONFIG.audio.seTalk : CONFIG.audio.seGet;
      // new Audio(src).play().catch(()=>{});
    },
    speak(text) {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      u.rate = 1.2;
      window.speechSynthesis.speak(u);
    }
  };

  // ==========================================
  // 5. CORE LOGIC
  // ==========================================
  
  // --- Transition Logic ---
  const SceneManager = {
    async change(sceneName, onMidTransition) {
      // 1. Fade Out (Whiteout)
      UI.fade.classList.add("is-active");
      await wait(CONFIG.ui.fadeTime);

      // 2. Switch Scenes
      Object.values(UI.scenes).forEach(el => el.classList.remove("is-active"));
      if (UI.scenes[sceneName]) {
        UI.scenes[sceneName].classList.add("is-active");
      }

      // 3. Callback (Render updates etc.)
      if (onMidTransition) onMidTransition();

      // 4. Fade In
      await wait(200);
      UI.fade.classList.remove("is-active");
    }
  };

  // --- Field Logic ---
  const Field = {
    render() {
      UI.field.area.innerHTML = ""; // Clear
      
      GAME_DATA.npcs.forEach(npc => {
        const el = document.createElement("div");
        el.className = "npc";
        el.style.left = `${npc.pos.x}%`;
        el.style.top = `${npc.pos.y}%`;
        el.dataset.id = npc.id; // Event Delegation用

        // 名前ラベル
        const nameLabel = document.createElement("span");
        nameLabel.className = "npc-name";
        nameLabel.textContent = npc.name;
        el.appendChild(nameLabel);

        // クリア済みスタイル
        const count = State.saveData.talkCounts[npc.id] || 0;
        if (count >= CONFIG.clearReq.rounds) {
          el.classList.add("cleared");
        }

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
      if (!npc) return;
      TalkSystem.start(npc);
    }
  };

  // --- Talk System ---
  const TalkSystem = {
    start(npc) {
      if (State.runtime.isTalking) return;
      
      State.runtime.isTalking = true;
      State.runtime.currentNpcId = npc.id;
      
      // 会話内容の決定
      const count = State.saveData.talkCounts[npc.id] || 0;
      let lines = [];
      if (count === 0) lines = npc.dialogue.first;
      else if (count === 1) lines = npc.dialogue.second;
      else lines = npc.dialogue.repeat;

      State.runtime.talkQueue = [...lines];
      
      // UI表示
      UI.talk.name.textContent = npc.name;
      UI.talk.text.textContent = "";
      UI.talk.overlay.classList.add("is-active");
      
      this.next();
    },

    next() {
      // タイピング中なら強制完了
      if (State.runtime.typingTimer) {
        this.finishTyping();
        return;
      }

      const line = State.runtime.talkQueue.shift();
      if (!line) {
        this.end();
        return;
      }

      this.typeText(line);
      AudioSys.speak(line);
      AudioSys.playSE('talk');
    },

    typeText(text) {
      let i = 0;
      UI.talk.text.textContent = "";
      
      // 現在表示中のテキストを保持しておく（finishTyping用）
      State.runtime.currentFullText = text;

      State.runtime.typingTimer = setInterval(() => {
        UI.talk.text.textContent += text.charAt(i);
        i++;
        if (i >= text.length) {
          this.finishTyping();
        }
      }, CONFIG.ui.typeSpeed);
    },

    finishTyping() {
      if (State.runtime.typingTimer) {
        clearInterval(State.runtime.typingTimer);
        State.runtime.typingTimer = null;
      }
      UI.talk.text.textContent = State.runtime.currentFullText;
    },

    end() {
      UI.talk.overlay.classList.remove("is-active");
      State.runtime.isTalking = false;
      
      // 進捗更新
      const npcId = State.runtime.currentNpcId;
      const count = State.saveData.talkCounts[npcId] || 0;
      
      // 2回目(index 1)の会話完了時にアイテム付与
      if (count === 1) {
        const npc = GAME_DATA.npcs.find(n => n.id === npcId);
        if (npc && npc.itemId && !State.saveData.unlockedItems[npc.itemId]) {
          State.saveData.unlockedItems[npc.itemId] = true;
          AudioSys.playSE('get');
          // ここで「言霊入手！」のような演出を入れるのも良い
        }
      }

      // 会話数カウントアップ (最大99)
      State.saveData.talkCounts[npcId] = Math.min(count + 1, 99);
      SaveSystem.save();

      // フィールド再描画（色を変えるため）
      Field.render();
      
      // 全クリア判定
      this.checkClear();
    },

    checkClear() {
      // 簡易判定：全員と規定回数話し、アイテムも揃ったらタイトルへ戻す（演出として）
      // ここは仕様次第だが、今回は割愛して「タイトルに戻る」フローはユーザー操作に任せる
    }
  };

  // --- Collection View ---
  const Collection = {
    render() {
      UI.collection.list.innerHTML = "";
      
      GAME_DATA.items.forEach(item => {
        const isUnlocked = !!State.saveData.unlockedItems[item.id];
        const div = document.createElement("div");
        div.className = `card ${isUnlocked ? "" : "locked"}`;
        
        div.innerHTML = `
          <div class="card-title">${isUnlocked ? item.title : "？？？"}</div>
          <div class="card-text">${isUnlocked ? item.text : "まだ見つかっていない"}</div>
        `;
        UI.collection.list.appendChild(div);
      });
    }
  };

  // ==========================================
  // 6. INITIALIZATION & EVENTS
  // ==========================================
  
  function setupEvents() {
    // START
    UI.buttons.start.addEventListener("click", () => {
      SceneManager.change("field", () => {
        Field.render();
      });
    });

    // KOTODAMA LIST
    UI.buttons.kotodama.addEventListener("click", () => {
      SceneManager.change("collection", () => {
        Collection.render();
      });
    });

    // BACK TO TITLE
    UI.buttons.back.addEventListener("click", () => {
      SceneManager.change("title");
    });

    // FIELD NPC CLICKS (Event Delegation)
    UI.field.area.addEventListener("click", (e) => {
      const npcEl = e.target.closest(".npc");
      if (npcEl) {
        Field.onNpcClick(npcEl.dataset.id);
      }
    });

    // TALK ADVANCE
    UI.talk.overlay.addEventListener("click", () => {
      TalkSystem.next();
    });
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function boot() {
    SaveSystem.load();
    AudioSys.init();
    setupEvents();
    
    // 初期表示
    SceneManager.change("title");
  }

  // Start Game
  window.addEventListener("DOMContentLoaded", boot);

})();

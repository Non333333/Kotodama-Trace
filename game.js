/* game.js - Expression Update (Fixed & Enhanced) */
(() => {
  "use strict";

  // --- Global State ---
  const State = {
    config: null,
    saveKey: null, // ★追加: world.json の gameId をここに保持して統一
    npcs: [],
    items: [],
    saveData: { talkCounts: {}, unlockedItems: {} },
    runtime: {
      isTalking: false,
      talkQueue: [],
      currentNpc: null,
      typingTimer: null,
      currentFullText: ""
    }
  };

  const UI = {
    app: document.getElementById("app"),
    fade: document.getElementById("fade-layer"),
    scenes: {
      title: document.getElementById("scene-title"),
      field: document.getElementById("scene-field"),
      collection: document.getElementById("scene-collection")
    },
    field: {
      area: document.getElementById("field-area"),
      hudCount: document.getElementById("hud-count")
    },
    talk: {
      overlay: document.getElementById("overlay-talk"),
      name: document.getElementById("talk-name"),
      text: document.getElementById("talk-text"),
      charImg: document.getElementById("talk-char-img")
    },
    collection: { list: document.getElementById("collection-list") }
  };

  // --- Helpers ---
  function safeJsonParse(str, fallback) {
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }

  function saveNow() {
    if (!State.saveKey) return;
    localStorage.setItem(State.saveKey, JSON.stringify(State.saveData));
  }

  // --- Data Loader ---
  async function loadAllData() {
    try {
      const [worldRes, npcRes, kotoRes] = await Promise.all([
        fetch("world.json"),
        fetch("npcs.json"),
        fetch("kotodama.json")
      ]);

      // ★改善: 404などを即検知して原因が分かるようにする
      if (!worldRes.ok) throw new Error(`world.json load failed: ${worldRes.status}`);
      if (!npcRes.ok) throw new Error(`npcs.json load failed: ${npcRes.status}`);
      if (!kotoRes.ok) throw new Error(`kotodama.json load failed: ${kotoRes.status}`);

      const worldData = await worldRes.json();
      const npcData = await npcRes.json();
      const kotoData = await kotoRes.json();

      State.config = worldData.config;
      State.saveKey = worldData.gameId; // ★統一の核
      State.npcs = npcData.npcs;
      State.items = kotoData.kotodama;

      // ★セーブ読み込み（壊れてても落ちない）
      const rawSave = localStorage.getItem(State.saveKey);
      if (rawSave) {
        const parsed = safeJsonParse(rawSave, null);
        if (parsed && typeof parsed === "object") {
          State.saveData = { ...State.saveData, ...parsed };
          // 中身が欠けてても最低限の形に戻す
          State.saveData.talkCounts = State.saveData.talkCounts || {};
          State.saveData.unlockedItems = State.saveData.unlockedItems || {};
        } else {
          console.warn("Save data corrupted. Resetting to default.");
        }
      }

      return true;
    } catch (e) {
      console.error("Load Error:", e);
      return false;
    }
  }

  // --- Audio System ---
  const AudioSys = {
    speak(text, voiceConfig) {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      if (voiceConfig) {
        u.pitch = voiceConfig.pitch || 1.0;
        u.rate = voiceConfig.rate || 1.0;
      }
      window.speechSynthesis.speak(u);
    },
    playTypeSound() {
      // const audio = new Audio("assets/se_type.mp3");
      // audio.volume = 0.2;
      // audio.play();
    }
  };

  // --- Logic ---
  const SceneManager = {
    async change(sceneName, callback) {
      UI.fade.classList.add("is-active");
      await new Promise(r => setTimeout(r, 400));

      Object.values(UI.scenes).forEach(el => el.classList.remove("is-active"));
      if (UI.scenes[sceneName]) UI.scenes[sceneName].classList.add("is-active");

      if (callback) callback();

      await new Promise(r => setTimeout(r, 200));
      UI.fade.classList.remove("is-active");
    }
  };

  const Field = {
    render() {
      UI.field.area.innerHTML = "";

      State.npcs.forEach(npc => {
        const el = document.createElement("div");
        el.className = "npc";
        el.style.left = `${npc.position.x}%`;
        el.style.top = `${npc.position.y}%`;
        el.dataset.id = npc.id;

        // ★改善: imageSd が無いと壊れ画像になるので、無ければimgを作らない
        if (npc.imageSd) {
          const img = document.createElement("img");
          img.src = npc.imageSd;
          img.alt = npc.name || "";
          el.appendChild(img);
        }

        const count = State.saveData.talkCounts[npc.id] || 0;
        if (count >= State.config.clearRounds) {
          el.style.filter = "grayscale(100%) opacity(0.6)";
        }

        UI.field.area.appendChild(el);
      });

      this.checkAndRenderGate();
      this.updateHUD();
    },

    checkAndRenderGate() {
      const allTalked = State.npcs.every(
        n => (State.saveData.talkCounts[n.id] || 0) >= State.config.clearRounds
      );

      // ★修正: unlockedItems の「数」ではなく「必要な全IDが true か」で判定
      const allItems = State.items.every(item => !!State.saveData.unlockedItems[item.id]);

      if (allTalked && allItems) {
        // ★修正: fade(親) と spin(子) を分離して transform 競合を消す
        const wrap = document.createElement("div");
        wrap.className = "gate-wrap fade-in";
        wrap.style.left = "85%";
        wrap.style.top = "80%";

        const gate = document.createElement("img");
        gate.src = "assets/obj_gate.png";
        gate.className = "gate";

        gate.onclick = () => {
          if (confirm("全ての言霊が集まりました。\nこの世界から脱出しますか？")) {
            alert("Thank you for playing.");
            SceneManager.change("title");
          }
        };

        wrap.appendChild(gate);
        UI.field.area.appendChild(wrap);
      }
    },

    updateHUD() {
      const current = Object.keys(State.saveData.unlockedItems).filter(
        id => !!State.saveData.unlockedItems[id]
      ).length;
      UI.field.hudCount.textContent = `${current} / ${State.items.length}`;
    },

    onNpcClick(npcId) {
      const npc = State.npcs.find(n => n.id === npcId);
      if (npc) TalkSystem.start(npc);
    }
  };

  const TalkSystem = {
    start(npc) {
      State.runtime.isTalking = true;
      State.runtime.currentNpc = npc;

      const count = State.saveData.talkCounts[npc.id] || 0;
      let lines = [];
      if (count === 0) lines = npc.dialogue.first;
      else if (count === 1) lines = npc.dialogue.second;
      else lines = npc.dialogue.repeat;

      State.runtime.talkQueue = [...lines];

      UI.talk.name.textContent = npc.name;
      UI.talk.text.textContent = "";

      this.updateImage("base");
      UI.talk.overlay.classList.add("is-active");

      this.next();
    },

    updateImage(faceType) {
      const npc = State.runtime.currentNpc;
      if (!npc || !npc.images) {
        UI.talk.charImg.style.display = "none";
        return;
      }

      const src = npc.images[faceType] || npc.images["base"];
      if (src) {
        UI.talk.charImg.src = src;
        UI.talk.charImg.style.display = "block";
      } else {
        UI.talk.charImg.style.display = "none";
      }
    },

    next() {
      if (State.runtime.typingTimer) {
        this.finishTyping();
        return;
      }

      const item = State.runtime.talkQueue.shift();
      if (!item) {
        this.end();
        return;
      }

      let text = "";
      if (typeof item === "string") {
        text = item;
      } else {
        text = item.text || "";
        if (item.face) this.updateImage(item.face);
      }

      this.typeText(text);
      AudioSys.speak(text, State.runtime.currentNpc.voice);
    },

    typeText(text) {
      let i = 0;
      UI.talk.text.textContent = "";
      State.runtime.currentFullText = text;

      const speed = State.config.uiTypeSpeed || 30;
      State.runtime.typingTimer = setInterval(() => {
        UI.talk.text.textContent += text.charAt(i);

        // if (i % 3 === 0) AudioSys.playTypeSound();

        i++;
        if (i >= text.length) this.finishTyping();
      }, speed);
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

      const npc = State.runtime.currentNpc;
      const count = State.saveData.talkCounts[npc.id] || 0;

      // 2回目会話終了時に言霊付与（元コードの挙動を維持）
      if (count === 1 && npc.kotodamaId && !State.saveData.unlockedItems[npc.kotodamaId]) {
        State.saveData.unlockedItems[npc.kotodamaId] = true;
      }

      State.saveData.talkCounts[npc.id] = Math.min(count + 1, 99);

      // ★修正: セーブキー直書きを廃止
      saveNow();

      Field.render();
    }
  };

  const Collection = {
    render() {
      UI.collection.list.innerHTML = "";
      State.items.forEach(item => {
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

  async function boot() {
    const success = await loadAllData();
    if (!success) return;

    document.getElementById("btn-start").addEventListener("click", () =>
      SceneManager.change("field", () => Field.render())
    );
    document.getElementById("btn-kotodama-list").addEventListener("click", () =>
      SceneManager.change("collection", () => Collection.render())
    );
    document.getElementById("btn-back-title").addEventListener("click", () =>
      SceneManager.change("title")
    );

    document.getElementById("btn-reset").addEventListener("click", () => {
      if (confirm("データを全て削除しますか？")) {
        if (State.saveKey) localStorage.removeItem(State.saveKey); // ★統一
        location.reload();
      }
    });

    UI.field.area.addEventListener("click", e => {
      const npcEl = e.target.closest(".npc");
      if (npcEl) Field.onNpcClick(npcEl.dataset.id);
    });

    UI.talk.overlay.addEventListener("click", () => TalkSystem.next());

    SceneManager.change("title");
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
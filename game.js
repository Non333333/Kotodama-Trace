/* game.js - Expression Update */
(() => {
  "use strict";

  // --- Global State ---
  const State = {
    config: null,
    npcs: [],
    items: [],
    saveData: { talkCounts: {}, unlockedItems: {} },
    runtime: {
      isTalking: false,
      talkQueue: [],
      currentNpc: null,
      typingTimer: null
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
    field: { area: document.getElementById("field-area"), hudCount: document.getElementById("hud-count") },
    talk: {
      overlay: document.getElementById("overlay-talk"),
      name: document.getElementById("talk-name"),
      text: document.getElementById("talk-text"),
      charImg: document.getElementById("talk-char-img")
    },
    collection: { list: document.getElementById("collection-list") }
  };

  // --- Data Loader ---
  async function loadAllData() {
    try {
      const [worldRes, npcRes, kotoRes] = await Promise.all([
        fetch("world.json"),
        fetch("npcs.json"),
        fetch("kotodama.json")
      ]);
      const worldData = await worldRes.json();
      const npcData = await npcRes.json();
      const kotoData = await kotoRes.json();

      State.config = worldData.config;
      State.npcs = npcData.npcs;
      State.items = kotoData.kotodama;

      const rawSave = localStorage.getItem(worldData.gameId);
      if (rawSave) State.saveData = { ...State.saveData, ...JSON.parse(rawSave) };

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

        const img = document.createElement("img");
        img.src = npc.imageSd || ""; 
        el.appendChild(img);

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
      const allTalked = State.npcs.every(n => (State.saveData.talkCounts[n.id] || 0) >= State.config.clearRounds);
      const allItems = State.items.length === Object.keys(State.saveData.unlockedItems).length;

      if (allTalked && allItems) {
        const gate = document.createElement("img");
        gate.src = "assets/obj_gate.png";
        gate.className = "gate";
        
        // ★ここを変更：右下に配置！
        gate.style.left = "85%";
        gate.style.top = "80%";
        
        gate.onclick = () => {
          if(confirm("全ての言霊が集まりました。\nこの世界から脱出しますか？")) {
            alert("Thank you for playing.");
            SceneManager.change("title");
          }
        };
        UI.field.area.appendChild(gate);
      }
    },

    updateHUD() {
      const current = Object.keys(State.saveData.unlockedItems).length;
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
      
      // 初期立ち絵 (base)
      this.updateImage("base");
      UI.talk.overlay.classList.add("is-active");
      
      this.next();
    },

    // ★画像切り替え機能
    updateImage(faceType) {
      const npc = State.runtime.currentNpc;
      if (!npc || !npc.images) {
        UI.talk.charImg.style.display = "none";
        return;
      }
      
      // JSONの "images" リストから探す
      const src = npc.images[faceType] || npc.images["base"];
      if (src) {
        UI.talk.charImg.src = src;
        UI.talk.charImg.style.display = "block";
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

      // ★文字列かオブジェクトかで処理を分ける
      let text = "";
      if (typeof item === "string") {
        text = item;
      } else {
        text = item.text;
        // 表情指定があれば切り替える
        if (item.face) {
          this.updateImage(item.face);
        }
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

      if (count === 1 && npc.kotodamaId && !State.saveData.unlockedItems[npc.kotodamaId]) {
        State.saveData.unlockedItems[npc.kotodamaId] = true;
      }

      State.saveData.talkCounts[npc.id] = Math.min(count + 1, 99);
      localStorage.setItem("kotodama-trace-v3", JSON.stringify(State.saveData));
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

    document.getElementById("btn-start").addEventListener("click", () => SceneManager.change("field", () => Field.render()));
    document.getElementById("btn-kotodama-list").addEventListener("click", () => SceneManager.change("collection", () => Collection.render()));
    document.getElementById("btn-back-title").addEventListener("click", () => SceneManager.change("title"));
    document.getElementById("btn-reset").addEventListener("click", () => {
      if(confirm("データを全て削除しますか？")) {
        localStorage.removeItem("kotodama-trace-v3");
        location.reload();
      }
    });
    UI.field.area.addEventListener("click", (e) => {
      const npcEl = e.target.closest(".npc");
      if (npcEl) Field.onNpcClick(npcEl.dataset.id);
    });
    UI.talk.overlay.addEventListener("click", () => TalkSystem.next());
    SceneManager.change("title");
  }

  window.addEventListener("DOMContentLoaded", boot);
})();

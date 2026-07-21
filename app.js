(function () {
  const GAMES_PER_PICK = 5;
  const STAT_GAME_LABELS = ["❤️", "🩷", "💛", "💚", "🩵"];
  const LIVE_SOURCE_URL = "https://smok95.github.io/lotto/results/all.json";

  const state = {
    draws: LOTTO_DRAWS, // data.js에 내장된 스냅샷으로 우선 시작
    freq: null,
  };

  // 회차별 [회차, n1..n6, 보너스] 중 1~6번 인덱스(메인 당첨번호)만 사용해 빈도 집계
  function buildFrequency(draws) {
    const freq = new Array(46).fill(0); // index 1~45 사용
    for (const row of draws) {
      for (let i = 1; i <= 6; i++) {
        freq[row[i]]++;
      }
    }
    return freq;
  }

  // 실제 1등 당첨 회차 중 서로 다른 회차 N개를 랜덤으로 선택
  function pickRandomDraws(draws, count) {
    const idxs = new Set();
    while (idxs.size < count) {
      idxs.add(Math.floor(Math.random() * draws.length));
    }
    return [...idxs].map((i) => draws[i]);
  }

  // 가중치 기반 비복원추출: 가중치가 높은 번호일수록 더 자주 뽑히되, 항상 서로 다른 번호 보장
  function weightedPick(freq, count, exclude) {
    const pool = [];
    for (let n = 1; n <= 45; n++) {
      if (exclude && exclude.has(n)) continue;
      pool.push({ n, w: freq[n] + 1 }); // +1로 최소 가중치 보장(0회 번호도 뽑힐 수 있게)
    }

    const picked = [];
    for (let k = 0; k < count; k++) {
      const total = pool.reduce((sum, item) => sum + item.w, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < pool.length; idx++) {
        r -= pool[idx].w;
        if (r <= 0) break;
      }
      idx = Math.min(idx, pool.length - 1);
      picked.push(pool[idx].n);
      pool.splice(idx, 1);
    }
    return picked;
  }

  function ballClass(n) {
    if (n <= 10) return "b1";
    if (n <= 20) return "b2";
    if (n <= 30) return "b3";
    if (n <= 40) return "b4";
    return "b5";
  }

  function makeBall(n) {
    const ball = document.createElement("span");
    ball.className = "ball " + ballClass(n);
    ball.textContent = n;
    return ball;
  }

  function appendGameRow(list, label, main, bonus) {
    const item = document.createElement("div");
    item.className = "game-row";

    const labelEl = document.createElement("div");
    labelEl.className = "game-label";
    labelEl.textContent = label;
    item.appendChild(labelEl);

    const balls = document.createElement("div");
    balls.className = "balls";
    main.forEach((n) => balls.appendChild(makeBall(n)));

    const sep = document.createElement("span");
    sep.className = "ball-sep";
    sep.textContent = "+";
    balls.appendChild(sep);
    balls.appendChild(makeBall(bonus));

    item.appendChild(balls);
    list.appendChild(item);
  }

  function renderRealGames(draws) {
    const list = document.getElementById("realGameList");
    list.innerHTML = "";
    draws
      .slice()
      .sort((a, b) => a[0] - b[0])
      .forEach((row) => {
        const [drawNo, ...rest] = row;
        appendGameRow(list, drawNo + "회", rest.slice(0, 6), rest[6]);
      });
  }

  function renderStatGames(games) {
    const list = document.getElementById("statGameList");
    list.innerHTML = "";
    games.forEach(({ main, bonus }, i) => {
      appendGameRow(list, STAT_GAME_LABELS[i] || i + 1, main, bonus);
    });
  }

  function generateReal() {
    const draws = pickRandomDraws(state.draws, GAMES_PER_PICK);
    renderRealGames(draws);
    document.getElementById("realResults").hidden = false;
  }

  function generateStat() {
    const games = [];
    const seen = new Set();
    while (games.length < GAMES_PER_PICK) {
      const main = weightedPick(state.freq, 6).sort((a, b) => a - b);
      const key = main.join(",");
      if (seen.has(key)) continue; // 5게임끼리는 서로 겹치지 않게
      seen.add(key);
      const bonus = weightedPick(state.freq, 1, new Set(main))[0];
      games.push({ main, bonus });
    }
    renderStatGames(games);
    document.getElementById("statResults").hidden = false;
  }

  function renderTopNumbers(freq) {
    const ranked = [];
    for (let n = 1; n <= 45; n++) ranked.push({ n, count: freq[n] });
    ranked.sort((a, b) => b.count - a.count);
    const top = ranked.slice(0, 6);

    const wrap = document.getElementById("topNumbers");
    wrap.innerHTML = "";
    top.forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "top-chip";
      chip.appendChild(makeBall(item.n));
      chip.appendChild(document.createTextNode(item.count + "회"));
      wrap.appendChild(chip);
    });
  }

  function refreshDerivedUI() {
    const last = state.draws[state.draws.length - 1];
    state.freq = buildFrequency(state.draws);
    document.getElementById("totalDraws").textContent = last[0];
    document.getElementById("lastDrawInfo").textContent = last[0] + "회차";
    renderTopNumbers(state.freq);
  }

  function setSyncStatus(text, mode) {
    const el = document.getElementById("syncStatus");
    el.textContent = text;
    el.className = "sync-status" + (mode ? " " + mode : "");
  }

  // 공개 데이터 소스(smok95/lotto)에서 최신 전체 회차를 받아와 반영
  async function fetchLiveDraws() {
    const res = await fetch(LIVE_SOURCE_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("bad status " + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("empty data");
    return data.map((d) => [d.draw_no, ...d.numbers, d.bonus_no]);
  }

  function syncLiveData() {
    fetchLiveDraws()
      .then((draws) => {
        state.draws = draws;
        refreshDerivedUI();
        const last = draws[draws.length - 1];
        setSyncStatus(last[0] + "회차까지 실시간 반영", "live");
      })
      .catch(() => {
        const last = state.draws[state.draws.length - 1];
        setSyncStatus(
          "최신 데이터를 불러오지 못해 저장된 " + last[0] + "회차 기준으로 보여줘요",
          "offline"
        );
      });
  }

  const TAB_STICKERS = {
    real: "img/together1-sticker.png",
    stat: "img/ekdms-sticker.png",
  };

  function showTabSticker(target, buttonEl) {
    const src = TAB_STICKERS[target];
    if (!src) return;
    const sticker = document.getElementById("popSticker");
    sticker.querySelector(".sticker-img").src = src;

    const rect = buttonEl.getBoundingClientRect();
    const width = sticker.offsetWidth;
    const height = sticker.offsetHeight;
    const margin = 8;
    const gapAboveButton = 24; // 말풍선 꼬리 + 여백 공간

    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    const top = rect.top - height - gapAboveButton;

    // position:absolute이므로 스크롤 위치를 더해 문서 기준 좌표로 변환
    sticker.style.left = Math.round(left + window.scrollX) + "px";
    sticker.style.top = Math.round(top + window.scrollY) + "px";

    sticker.classList.remove("pop");
    void sticker.offsetWidth; // 애니메이션 재시작을 위한 강제 리플로우
    sticker.classList.add("pop");
  }

  function init() {
    refreshDerivedUI();

    document.getElementById("generateRealBtn").addEventListener("click", generateReal);
    document.getElementById("generateStatBtn").addEventListener("click", generateStat);

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;
        document.querySelectorAll(".tab-btn").forEach((b) => {
          b.classList.toggle("active", b === btn);
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        document.querySelectorAll(".tab-panel").forEach((panel) => {
          panel.hidden = panel.dataset.panel !== target;
        });

        showTabSticker(target, btn);
      });
    });

    syncLiveData();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

/* Laboratorio Urbano — modelo basado en agentes (estilo NetLogo)
   Ciudad en rejilla con: lluvia y escurrimiento, inundación, ciudad esponja,
   basura, agua contaminada, incendios, isla de calor y ciudadanos (agentes). */
(function () {
    'use strict';

    const root = document.getElementById('city-lab');
    if (!root) return;

    const COLS = 56, ROWS = 34, N = COLS * ROWS;
    const T = { EMPTY: 0, ROAD: 1, RES: 2, COM: 3, IND: 4, PARK: 5, RIVER: 6, WETLAND: 7, SWALE: 8, PERM: 9, STATION: 10, PLANT: 11, RECYCLE: 12, RUIN: 13 };
    const NAMES = ['Lote baldío', 'Calle', 'Vivienda', 'Comercio', 'Industria', 'Parque / arbolado', 'Río', 'Humedal', 'Jardín de lluvia', 'Pavimento permeable', 'Estación de bomberos', 'Planta de tratamiento', 'Centro de reciclaje', 'Ruinas'];

    // propiedades por tipo de celda
    const INFIL = [0.05, 0.004, 0, 0, 0, 0.07, 0, 0.10, 0.16, 0.09, 0, 0, 0, 0.01];   // infiltración de agua / tick
    const HEATSRC = [0.5, 2.5, 3, 3.5, 4.5, -3, -2.5, -3, -1.5, 1.2, 3, 2, 2, 2.5];     // °C sobre la temperatura base
    const FUEL = [0.2, 0, 0.55, 0.5, 0.7, 0.65, 0, 0.15, 0.2, 0, 0.3, 0.3, 0.5, 0.05];
    const TRASHGEN = [0, 0, 0.040, 0.070, 0.050, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const COST = { park: 10, swale: 14, perm: 12, wetland: 20, station: 40, plant: 60, recycle: 30, clear: 2, demolish: 4 };

    const idx = (x, y) => y * COLS + x;
    const inb = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
    const rnd = Math.random;

    // ---------- estado ----------
    const P = { pop: 220, consumo: 50, colecta: 70, reciclaje: 20, industria: 40, drenaje: 60, lluvia: 35, temp: 27, bomberos: 50, ignicion: 40, speed: 8, viento: 'calma' };
    let type, elev, water, pm, trash, fire, fireAge, moist, heatA, heatTmp, dA, dPm, riverY, bld;
    let people = [];
    let S = {};
    let view = 'normal', tool = 'inspect', running = false, hover = null;
    const hist = { health: [], water: [], flood: [], heat: [] };
    const logLines = [];
    let lastLogKey = {};

    function alloc() {
        type = new Uint8Array(N); elev = new Float32Array(N); water = new Float32Array(N); pm = new Float32Array(N);
        trash = new Float32Array(N); fire = new Float32Array(N); fireAge = new Uint8Array(N); moist = new Float32Array(N);
        heatA = new Float32Array(N); heatTmp = new Float32Array(N); dA = new Float32Array(N); dPm = new Float32Array(N);
        bld = new Float32Array(N); riverY = new Int16Array(COLS);
    }

    function setup() {
        alloc();
        const phase = rnd() * 6;
        for (let x = 0; x < COLS; x++) riverY[x] = Math.round(ROWS * 0.74 + Math.sin(x * 0.16 + phase) * 2.2);
        const cx = Math.floor(COLS / 16), cy = 2;
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const i = idx(x, y), ry = riverY[x], d = Math.abs(y - ry);
            const noise = 0.01 * (Math.sin(x * 0.7) + Math.cos(y * 0.9));
            if (d <= 1) { type[i] = T.RIVER; elev[i] = -0.5 - 0.004 * x; water[i] = 0.5; continue; }
            elev[i] = 0.03 + 0.02 * (d - 2) + noise;
            const bx = Math.floor(x / 8), by = Math.floor(y / 7);
            if (x % 8 === 0 || y % 7 === 0) { type[i] = T.ROAD; continue; }
            const h = Math.abs(Math.sin(bx * 12.9898 + by * 78.233) * 43758.5453) % 1;
            let zone = 'res';
            if (Math.abs(bx - 3) <= 1 && by >= 1 && by <= 2) zone = 'com';
            else if (bx <= 1 && by >= 2) zone = 'ind';
            else if (h < 0.15) zone = 'park';
            const r = rnd();
            if (zone === 'park') type[i] = T.PARK;
            else if (zone === 'res') type[i] = r < 0.78 ? T.RES : (r < 0.9 ? T.PARK : T.EMPTY);
            else if (zone === 'com') type[i] = r < 0.85 ? T.COM : T.EMPTY;
            else type[i] = r < 0.9 ? T.IND : T.EMPTY;
        }
        for (let i = 0; i < N; i++) { moist[i] = 0.5; bld[i] = rnd(); }
        S = { tick: 8, rain: 0, rainLeft: 0, heatLeft: 0, strikeLeft: 0, budget: 300, victims: 0, ruins: 0, burning: 0, Tg: P.temp, health: 100, quality: 100, flood: 0, Tmean: P.temp, Tmax: P.temp, trashAvg: 0, index: 100, goalDays: 0, ignitions: 0 };
        people = [];
        const homes = [];
        for (let i = 0; i < N; i++) if (type[i] === T.RES) homes.push(i);
        for (let k = 0; k < P.pop; k++) {
            const i = homes[(rnd() * homes.length) | 0] || idx(4, 4);
            people.push({ x: i % COLS, y: (i / COLS) | 0, hp: 85 + rnd() * 15 });
        }
        hist.health.length = hist.water.length = hist.flood.length = hist.heat.length = 0;
        logLines.length = 0; lastLogKey = {};
        addLog('Ciudad generada.');
        computeMetrics(); heat(); record();
    }

    function addLog(msg, key, cooldown) {
        if (key) { const last = lastLogKey[key]; if (last !== undefined && S.tick - last < (cooldown || 24)) return; lastLogKey[key] = S.tick; }
        const h = S.tick % 24, d = Math.floor(S.tick / 24) + 1;
        logLines.unshift('Día ' + d + ' · ' + String(h).padStart(2, '0') + ':00 — ' + msg);
        if (logLines.length > 30) logLines.pop();
        if (ui.log) ui.log.innerHTML = logLines.slice(0, 12).map(l => '<li>' + l + '</li>').join('');
        if (ui.last) ui.last.innerHTML = '<b>Último aviso:</b> ' + logLines[0];
    }

    // ---------- reglas ----------
    function step() {
        S.tick++;
        const hour = S.tick % 24;
        weather(hour);
        hydrology();
        trashRules(hour);
        fireRules();
        if (S.tick % 2 === 0) heat();
        agents();
        economy();
        computeMetrics();
        if (S.tick % 6 === 0) record();
        missionTick();
    }

    function weather(hour) {
        if (S.rainLeft > 0) { S.rainLeft--; if (S.rainLeft === 0) { S.rain = 0; addLog('☀️ Terminó la lluvia.', 'rainend', 6); } }
        else if (rnd() < P.lluvia / 100 * 0.014) { S.rain = 0.3 + rnd() * 0.5; S.rainLeft = 6 + ((rnd() * 10) | 0); addLog('🌧️ Comienza a llover.', 'rain', 6); }
        if (S.heatLeft > 0) S.heatLeft--;
        if (S.strikeLeft > 0) { S.strikeLeft--; if (S.strikeLeft === 0) addLog('🗑️ Se reanuda la recolección de basura.'); }
        S.Tg = P.temp + 5 * Math.sin((hour - 9) / 24 * 2 * Math.PI) + (S.heatLeft > 0 ? 6 : 0) - (S.rain > 0 ? 2 : 0);
    }

    function hydrology() {
        const rain = S.rain, drain = P.drenaje / 100 * 0.035;
        for (let i = 0; i < N; i++) {
            if (rain > 0) water[i] += rain * 0.02;
            // basura lavada por el agua → contaminación
            if (trash[i] > 0 && water[i] > 0.05) {
                const w = Math.min(trash[i], 0.05 * water[i] * 6);
                trash[i] -= w; pm[i] += w * 0.6;
            }
        }
        // descargas industriales directas al río
        const dis = P.industria / 100 * 0.0011;
        if (dis > 0) for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) {
            if (type[idx(x, y)] === T.IND) pm[idx(x, riverY[x])] += dis * (0.5 + rnd());
        }
        dA.fill(0); dPm.fill(0);
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const i = idx(x, y), t = type[i];
            if (t === T.RIVER) continue;
            let w = water[i];
            if (w < 0.0015) continue;
            // infiltración (se reduce si está tapado por basura)
            const clog = clamp(localTrash(x, y) * 0.6, 0, 0.9);
            const inf = Math.min(w, INFIL[t] * (1 - clog));
            if (inf > 0) { const f = inf / w; dPm[i] -= pm[i] * f * 0.8; dA[i] -= inf; w -= inf; moist[i] = Math.min(1, moist[i] + inf * 2); }
            // drenaje pluvial: descarga al río de la misma columna
            if ((t === T.ROAD || t === T.PERM) && w > 0) {
                const dr = Math.min(w, drain * (1 - clog));
                if (dr > 0) { const f = dr / water[i]; const j = idx(x, riverY[x]); dA[i] -= dr; dA[j] += dr * 0.6; dPm[i] -= pm[i] * f; dPm[j] += pm[i] * f; w -= dr; }
            }
            // escurrimiento hacia la celda más baja
            const h = elev[i] + w;
            let best = -1, bh = h;
            for (let k = 0; k < 4; k++) {
                const nx = x + N4[k][0], ny = y + N4[k][1];
                if (!inb(nx, ny)) continue;
                const j = idx(nx, ny), hj = elev[j] + water[j];
                if (hj < bh) { bh = hj; best = j; }
            }
            if (best >= 0 && w > 0) {
                const mv = Math.min(w, (h - bh) * 0.5);
                const f = mv / Math.max(water[i], 1e-6);
                dA[i] -= mv; dA[best] += mv;
                const mp = pm[i] * Math.min(1, f); dPm[i] -= mp; dPm[best] += mp;
            }
        }
        for (let i = 0; i < N; i++) {
            water[i] = Math.max(0, water[i] + dA[i]);
            pm[i] = Math.max(0, pm[i] + dPm[i]);
            if (water[i] < 0.0005) water[i] = 0;
            moist[i] = clamp(moist[i] * 0.996 + water[i] * 0.05 + (rain > 0 ? 0.01 : 0), 0, 1);
        }
        // río: nivel base, corriente hacia el este
        for (let x = 0; x < COLS; x++) for (let dy = -1; dy <= 1; dy++) {
            const y = riverY[x] + dy; if (y < 0 || y >= ROWS) continue;
            const i = idx(x, y);
            if (type[i] !== T.RIVER) continue;
            water[i] += (0.5 - water[i]) * 0.3;
        }
        const carry = new Float32Array(N);
        for (let x = 0; x < COLS; x++) for (let dy = -1; dy <= 1; dy++) {
            const y = riverY[x] + dy; if (y < 0 || y >= ROWS) continue;
            const i = idx(x, y);
            if (type[i] !== T.RIVER) continue;
            const m = pm[i] * 0.25; pm[i] -= m;
            if (x + 1 < COLS) { const yy = clamp(y + (riverY[x + 1] - riverY[x]), 0, ROWS - 1); const j = idx(x + 1, yy); if (type[j] === T.RIVER) carry[j] += m; else carry[i] += m; }
            pm[i] *= 0.997;
        }
        for (let i = 0; i < N; i++) if (carry[i]) pm[i] += carry[i];
        // tratamiento: humedales, jardines de lluvia, planta
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const i = idx(x, y), t = type[i];
            if (t === T.WETLAND || t === T.SWALE) {
                pm[i] *= 0.93;
                if (t === T.WETLAND) for (let k = 0; k < 4; k++) { const nx = x + N4[k][0], ny = y + N4[k][1]; if (inb(nx, ny)) pm[idx(nx, ny)] *= 0.96; }
            } else if (t === T.PLANT) {
                for (let xx = Math.max(0, x - 6); xx <= Math.min(COLS - 1, x + 6); xx++) for (let dy = -1; dy <= 1; dy++) {
                    const yy = riverY[xx] + dy; if (yy < 0 || yy >= ROWS) continue;
                    if (Math.abs(xx - x) + Math.abs(yy - y) <= 9) pm[idx(xx, yy)] *= 0.86;
                }
                if (water[i] > 0) pm[i] *= 0.8;
            } else if (t !== T.RIVER) pm[i] *= 0.96;
        }
    }

    function localTrash(x, y) {
        let s = trash[idx(x, y)];
        for (let k = 0; k < 4; k++) { const nx = x + N4[k][0], ny = y + N4[k][1]; if (inb(nx, ny)) s += trash[idx(nx, ny)] * 0.5; }
        return s;
    }

    function trashRules(hour) {
        const gen = P.consumo / 100, rec = P.reciclaje / 100;
        const day = (hour >= 7 && hour <= 21) ? 1 : 0.3;
        const coll = S.strikeLeft > 0 ? 0 : P.colecta / 100;
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const i = idx(x, y), t = type[i], g = TRASHGEN[t];
            if (g > 0) {
                let f = 1 - 0.6 * rec;
                if (nearType(x, y, T.RECYCLE, 6)) f *= 0.6;
                trash[i] += g * gen * f * day * (0.5 + rnd());
                if (trash[i] > 0.3) {                      // la basura se derrama a la calle
                    const k = (rnd() * 4) | 0, nx = x + N4[k][0], ny = y + N4[k][1];
                    if (inb(nx, ny)) { const j = idx(nx, ny), tj = type[j]; if (tj === T.ROAD || tj === T.PERM || tj === T.EMPTY) { trash[j] += trash[i] * 0.2; trash[i] *= 0.8; } }
                }
            }
            if (trash[i] > 0.05 && rnd() < coll * 0.18) trash[i] *= 0.3;
            if (trash[i] > 3) trash[i] = 3;
        }
    }

    const nearCache = {};
    function nearType(x, y, tt, r) {
        for (let yy = Math.max(0, y - r); yy <= Math.min(ROWS - 1, y + r); yy++)
            for (let xx = Math.max(0, x - r); xx <= Math.min(COLS - 1, x + r); xx++)
                if (type[idx(xx, yy)] === tt) return true;
        return false;
    }

    function windVec() {
        switch (P.viento) { case 'norte': return [0, -1]; case 'sur': return [0, 1]; case 'este': return [1, 0]; case 'oeste': return [-1, 0]; default: return [0, 0]; }
    }

    function ignite(i) {
        if (fire[i] > 0 || FUEL[type[i]] <= 0 || type[i] === T.RIVER) return false;
        fire[i] = 0.3; fireAge[i] = 0; return true;
    }

    function fireRules() {
        const dryG = clamp((S.Tg - 22) / 14, 0, 1.2);
        // ignición espontánea (calor + sequía + combustible)
        if (rnd() < P.ignicion / 100 * 0.03 * dryG) {
            const i = (rnd() * N) | 0;
            if (FUEL[type[i]] > 0.2 && rnd() < FUEL[type[i]] * (1 - moist[i]) * dryG && ignite(i)) {
                S.ignitions++;
                addLog('🔥 Se inició un incendio en (' + (i % COLS) + ',' + ((i / COLS) | 0) + ').', 'ign', 8);
            }
        }
        const w = windVec();
        const burning = [];
        for (let i = 0; i < N; i++) if (fire[i] > 0) burning.push(i);
        for (const i of burning) {
            const x = i % COLS, y = (i / COLS) | 0;
            fireAge[i]++;
            fire[i] = Math.min(1, fireAge[i] / 3);
            if (water[i] > 0.12) { fire[i] = 0; fireAge[i] = 0; continue; }
            for (let k = 0; k < 4; k++) {
                const dx = N4[k][0], dy = N4[k][1], nx = x + dx, ny = y + dy;
                if (!inb(nx, ny)) continue;
                const j = idx(nx, ny);
                if (fire[j] > 0 || type[j] === T.RIVER) continue;
                const fuel = FUEL[type[j]] + Math.min(trash[j], 1.5) * 0.15;
                if (fuel <= 0) continue;
                let wf = 1; const dot = dx * w[0] + dy * w[1];
                if (dot > 0) wf = 1.9; else if (dot < 0) wf = 0.4;
                const dry = 0.25 + clamp((S.Tg - 22) / 14, 0, 1.2) * (1 - moist[j]);
                if (rnd() < 0.3 * fuel * dry * wf) ignite(j);
            }
            const burnTime = 5 + FUEL[type[i]] * 6;
            if (fireAge[i] >= burnTime) {
                fire[i] = 0; fireAge[i] = 0;
                if (type[i] !== T.EMPTY && type[i] !== T.ROAD) { type[i] = T.RUIN; trash[i] += 0.8; S.ruins++; }
            }
        }
        // bomberos
        const resp = P.bomberos / 100;
        if (resp > 0) for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            if (type[idx(x, y)] !== T.STATION) continue;
            let n = 0;
            for (let yy = Math.max(0, y - 8); yy <= Math.min(ROWS - 1, y + 8) && n < 3; yy++)
                for (let xx = Math.max(0, x - 8); xx <= Math.min(COLS - 1, x + 8) && n < 3; xx++) {
                    const j = idx(xx, yy);
                    if (fire[j] > 0 && (xx - x) * (xx - x) + (yy - y) * (yy - y) <= 64 && rnd() < resp * 0.7) { fire[j] = 0; fireAge[j] = 0; n++; }
                }
        }
        let b = 0; for (let i = 0; i < N; i++) if (fire[i] > 0) b++;
        S.burning = b;
        if (b >= 8) addLog('🔥 Incendio fuera de control: ' + b + ' celdas ardiendo.', 'bigfire', 24);
    }

    function heat() {
        for (let i = 0; i < N; i++) heatTmp[i] = HEATSRC[type[i]] + (fire[i] > 0 ? 6 : 0);
        for (let pass = 0; pass < 2; pass++) {
            for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
                let s = heatTmp[idx(x, y)] * 2, c = 2;
                for (let k = 0; k < 4; k++) { const nx = x + N4[k][0], ny = y + N4[k][1]; if (inb(nx, ny)) { s += heatTmp[idx(nx, ny)]; c++; } }
                heatA[idx(x, y)] = s / c;
            }
            heatTmp.set(heatA);
        }
    }

    function agents() {
        const w = water, hp = [];
        for (const p of people) {
            // movimiento aleatorio; huyen del fuego
            if (rnd() < 0.6) {
                const k = (rnd() * 4) | 0, nx = p.x + N4[k][0], ny = p.y + N4[k][1];
                if (inb(nx, ny)) { const j = idx(nx, ny); if (type[j] !== T.RIVER && fire[j] === 0) { p.x = nx; p.y = ny; } }
            }
            const i = idx(p.x, p.y);
            let dmg = 0;
            if (fire[i] > 0) dmg += 8;
            else for (let k = 0; k < 4; k++) { const nx = p.x + N4[k][0], ny = p.y + N4[k][1]; if (inb(nx, ny) && fire[idx(nx, ny)] > 0) { dmg += 1.2; break; } }
            if (w[i] > 0.25) dmg += 2 + w[i] * 3;
            if (w[i] > 0.05 && pm[i] > 0.05) dmg += clamp(pm[i] * 8, 0, 2);
            const Tc = S.Tg + heatA[i];
            if (Tc > 36) dmg += 0.4 * (Tc - 36);
            if (trash[i] > 0.8) dmg += 0.3;
            if (dmg > 0) p.hp -= dmg;
            else p.hp = Math.min(100, p.hp + (type[i] === T.PARK ? 0.9 : 0.5));
            if (p.hp <= 0) {
                S.victims++; p.hp = 45;
                const homes = []; for (let q = 0; q < 6; q++) { const r = (rnd() * N) | 0; if (type[r] === T.RES) { p.x = r % COLS; p.y = (r / COLS) | 0; break; } }
            }
        }
    }

    function economy() {
        const total = people.length || 1;
        let h = 0; for (const p of people) h += p.hp;
        S.budget += 3.4 * (h / total / 100) * (1 - Math.min(0.9, S.ruins / 400));
    }

    function computeMetrics() {
        let h = 0; for (const p of people) h += p.hp;
        S.health = people.length ? h / people.length : 0;
        let riverCells = 0, conc = 0, land = 0, flooded = 0, tsum = 0, tmax = -99, tr = 0;
        for (let i = 0; i < N; i++) {
            const t = type[i];
            if (t === T.RIVER) { riverCells++; conc += pm[i] / Math.max(water[i], 0.3); }
            else { land++; if (water[i] > 0.15) flooded++; }
            const tc = S.Tg + heatA[i]; tsum += tc; if (tc > tmax) tmax = tc;
            tr += trash[i];
        }
        S.quality = 100 * Math.max(0, 1 - (conc / Math.max(1, riverCells)) / 0.9);
        S.flood = 100 * flooded / Math.max(1, land);
        S.Tmean = tsum / N; S.Tmax = tmax; S.trashAvg = tr / N;
        const Tday = S.Tmean - (S.Tg - P.temp - (S.heatLeft > 0 ? 6 : 0) + (S.rain > 0 ? 2 : 0)) + (S.heatLeft > 0 ? 6 : 0); // sin el ciclo día/noche
        const thermal = 100 - clamp((Tday - 26) * 8, 0, 100);
        const floodScore = 100 - Math.min(100, S.flood * 4);
        const fireScore = 100 - Math.min(100, S.ruins * 0.6 + S.burning * 2);
        S.thermal = thermal; S.floodScore = floodScore;
        S.index = 0.3 * S.health + 0.25 * S.quality + 0.2 * floodScore + 0.15 * thermal + 0.1 * fireScore;
        if (S.flood > 12) addLog('🌊 Inundación: ' + S.flood.toFixed(0) + '% del suelo urbano bajo el agua.', 'flood', 30);
        if (S.quality < 40) addLog('☣️ El río está muy contaminado (calidad ' + S.quality.toFixed(0) + '%).', 'quality', 48);
        if (S.Tmax > 41) addLog('🌡️ Temperatura extrema: ' + S.Tmax.toFixed(0) + ' °C en el centro urbano.', 'temp', 48);
        if (S.health > 70 && S.index > 70) { /* meta */ }
    }

    function record() {
        const push = (a, v) => { a.push(v); if (a.length > 240) a.shift(); };
        push(hist.health, S.health); push(hist.water, S.quality); push(hist.flood, S.floodScore); push(hist.heat, S.thermal);
    }

    // ---------- eventos ----------
    function evFire() {
        for (let tries = 0; tries < 200; tries++) {
            const i = (rnd() * N) | 0;
            if ((type[i] === T.PARK || type[i] === T.RES) && fire[i] === 0) {
                ignite(i); const x = i % COLS, y = (i / COLS) | 0;
                for (let k = 0; k < 4; k++) { const nx = x + N4[k][0], ny = y + N4[k][1]; if (inb(nx, ny) && rnd() < 0.6) ignite(idx(nx, ny)); }
                addLog('🔥 Incendio provocado en (' + x + ',' + y + ').'); return;
            }
        }
    }
    function evStorm() { S.rain = 1; S.rainLeft = 36; addLog('⛈️ Tormenta intensa: ¿aguantará el drenaje?'); }
    function evHeat() { S.heatLeft = 72; addLog('🌡️ Ola de calor: +6 °C durante 3 días.'); }
    function evSpill() {
        const inds = []; for (let i = 0; i < N; i++) if (type[i] === T.IND) inds.push(i);
        const x = inds.length ? inds[(rnd() * inds.length) | 0] % COLS : 4;
        for (let dx = -2; dx <= 2; dx++) { const xx = clamp(x + dx, 0, COLS - 1); pm[idx(xx, riverY[xx])] += 6; }
        addLog('☣️ Derrame industrial en el río (columna ' + x + ').');
    }
    function evStrike() { S.strikeLeft = 96; addLog('🗑️ Paro de recolección de basura (4 días).'); }
    function evSponge() {
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const i = idx(x, y), t = type[i];
            const nearRoad = N4.some(([dx, dy]) => inb(x + dx, y + dy) && type[idx(x + dx, y + dy)] === T.ROAD);
            if (t === T.ROAD && (x + y) % 3 !== 0 && x % 8 !== 0 && y % 7 === 0) type[i] = T.PERM;
            else if (t === T.ROAD && x % 8 === 0 && y % 3 === 1) type[i] = T.PERM;
            else if ((t === T.RES || t === T.EMPTY) && nearRoad && ((x * 7 + y * 3) % 5 === 0)) type[i] = T.SWALE;
            else if (t === T.RES && ((x * 5 + y * 11) % 9 === 0)) type[i] = T.PARK;
            else if ((t === T.EMPTY || t === T.RUIN) && Math.abs(y - riverY[x]) <= 4) type[i] = T.WETLAND;
        }
        for (let x = 0; x < COLS; x++) for (let y = riverY[x] - 3; y <= riverY[x] - 2; y++) if (inb(x, y) && type[idx(x, y)] !== T.RIVER && type[idx(x, y)] !== T.ROAD && x % 2 === 0) type[idx(x, y)] = T.WETLAND;
        placeSpecial(T.PLANT, COLS - 6, riverY[COLS - 6] - 4);
        placeSpecial(T.STATION, 12, 10); placeSpecial(T.STATION, 28, 17); placeSpecial(T.STATION, 44, 10);
        placeSpecial(T.RECYCLE, 20, 12); placeSpecial(T.RECYCLE, 36, 20);
        addLog('🌿 Se aplicó la infraestructura de «ciudad esponja» (demostración sin costo).');
    }
    function placeSpecial(t, x, y) {
        for (let r = 0; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx, yy = y + dy;
            if (!inb(xx, yy)) continue;
            const i = idx(xx, yy), tt = type[i];
            if (tt === T.RIVER || tt === T.ROAD || tt === T.PERM) continue;
            type[i] = t; return;
        }
    }

    // ---------- herramientas ----------
    const TOOLS = {
        park: { to: T.PARK, cost: COST.park, bad: [T.RIVER, T.ROAD, T.PERM] },
        swale: { to: T.SWALE, cost: COST.swale, bad: [T.RIVER, T.ROAD, T.PERM] },
        perm: { to: T.PERM, cost: COST.perm, only: [T.ROAD] },
        wetland: { to: T.WETLAND, cost: COST.wetland, bad: [T.RIVER, T.ROAD, T.PERM] },
        station: { to: T.STATION, cost: COST.station, bad: [T.RIVER, T.ROAD, T.PERM] },
        plant: { to: T.PLANT, cost: COST.plant, bad: [T.RIVER, T.ROAD, T.PERM] },
        recycle: { to: T.RECYCLE, cost: COST.recycle, bad: [T.RIVER, T.ROAD, T.PERM] },
        demolish: { to: T.EMPTY, cost: COST.demolish, bad: [T.RIVER, T.ROAD, T.PERM, T.EMPTY] }
    };
    let lastCell = -1;
    function applyTool(x, y) {
        if (!inb(x, y)) return;
        const i = idx(x, y);
        if (tool === 'inspect') return;
        if (i === lastCell) return; lastCell = i;
        if (tool === 'clear') {
            if (S.budget < COST.clear) { toast('Presupuesto insuficiente'); return; }
            if (fire[i] > 0 || trash[i] > 0.05 || pm[i] > 0.05 || water[i] > 0.05) {
                S.budget -= COST.clear; fire[i] = 0; fireAge[i] = 0; trash[i] = 0; if (type[i] !== T.RIVER) { pm[i] = 0; water[i] *= 0.3; }
            }
            return;
        }
        const d = TOOLS[tool]; if (!d) return;
        const t = type[i];
        if (d.only ? d.only.indexOf(t) < 0 : d.bad.indexOf(t) >= 0) return;
        if (t === d.to) return;
        if (S.budget < d.cost) { toast('Presupuesto insuficiente ($' + d.cost + ')'); return; }
        S.budget -= d.cost; type[i] = d.to; fire[i] = 0; fireAge[i] = 0;
        if (d.to === T.EMPTY) trash[i] = 0;
        heat();
    }

    // ---------- misiones ----------
    const MISSIONS = {
        libre: {
            icon: '🧪', name: 'Modo libre', days: 0, budget: 500, P: {}, script: [],
            goal: 'Sin objetivo: experimenta. Prueba aplicar «Ciudad esponja» y luego provoca una tormenta para ver la diferencia.',
            live: () => []
        },
        tormenta: {
            icon: '⛈️', name: 'Tormenta del siglo', days: 6, budget: 400, P: { lluvia: 60, drenaje: 45 },
            script: [{ t: 36, fn: () => evStorm() }, { t: 100, fn: () => evStorm() }],
            goal: 'Protege la ciudad de dos tormentas en 6 días. Antes de iniciar, usa tu presupuesto para construir jardines de lluvia, pavimento permeable y humedales.',
            live: () => [{ k: 'Inundación máxima', v: M.maxFlood.toFixed(0) + '% (meta: menos de 15%)', ok: M.maxFlood < 15 }, { k: 'Salud ciudadana', v: S.health.toFixed(0) + '% (meta: más de 70%)', ok: S.health > 70 }],
            check: () => M.maxFlood < 15 && S.health > 70
        },
        incendio: {
            icon: '🔥', name: 'Verano en llamas', days: 6, budget: 400, P: { temp: 35, ignicion: 80, viento: 'este', bomberos: 30, lluvia: 10 },
            script: [{ t: 30, fn: () => evHeat() }, { t: 60, fn: () => evFire() }, { t: 100, fn: () => evFire() }],
            goal: 'Una ola de calor y vientos del este alimentan incendios. Evita que arda la ciudad: construye estaciones de bomberos, humedales y parques húmedos.',
            live: () => [{ k: 'Ruinas', v: S.ruins + ' (meta: 12 o menos)', ok: S.ruins <= 12 }, { k: 'Salud ciudadana', v: S.health.toFixed(0) + '% (meta: más de 60%)', ok: S.health > 60 }],
            check: () => S.ruins <= 12 && S.health > 60
        },
        rio: {
            icon: '☣️', name: 'Río limpio', days: 6, budget: 400, P: { industria: 90, colecta: 40, lluvia: 45 },
            script: [{ t: 48, fn: () => evSpill() }, { t: 100, fn: () => evSpill() }],
            goal: 'Las industrias vierten al río y habrá derrames. Deja el agua en buen estado: planta de tratamiento, humedales, reciclaje y menos descargas.',
            live: () => [{ k: 'Calidad del agua', v: S.quality.toFixed(0) + '% (meta: más de 60%)', ok: S.quality > 60 }, { k: 'Mínimo alcanzado', v: M.minQ.toFixed(0) + '%', ok: M.minQ > 30 }],
            check: () => S.quality > 60
        }
    };
    let M = { id: 'tormenta', start: 0, done: false, maxFlood: 0, minQ: 100, fired: {} };

    function loadMission(id) {
        const m = MISSIONS[id];
        Object.assign(P, { consumo: 50, colecta: 70, reciclaje: 20, industria: 40, drenaje: 60, lluvia: 35, temp: 27, bomberos: 50, ignicion: 40, viento: 'calma' }, m.P);
        setup();
        S.budget = m.budget;
        M = { id, start: S.tick, done: false, maxFlood: 0, minQ: 100, fired: {} };
        running = false;
        if (ui.go) setGoLabel();
        if (ui.result) ui.result.style.display = 'none';
        syncSliders(); renderMission();
        addLog(m.icon + ' Misión «' + m.name + '». ' + (m.days ? 'Tienes $' + m.budget + ' para preparar la ciudad antes de iniciar.' : 'Haz lo que quieras.'));
    }

    function missionTick() {
        const m = MISSIONS[M.id]; if (M.done) return;
        const rel = S.tick - M.start;
        M.maxFlood = Math.max(M.maxFlood, S.flood); M.minQ = Math.min(M.minQ, S.quality);
        (m.script || []).forEach((e, k) => { if (rel >= e.t && !M.fired[k]) { M.fired[k] = 1; e.fn(); } });
        if (m.days && rel >= m.days * 24) {
            M.done = true; running = false; setGoLabel();
            const ok = m.check();
            const stars = ok ? (S.index >= 85 ? 3 : (S.index >= 70 ? 2 : 1)) : 0;
            ui.result.innerHTML = '<h3>' + (ok ? '¡Misión cumplida!' : 'La ciudad no resistió') + '</h3><div class="cl-stars">' + '★'.repeat(stars) + '<span>' + '★'.repeat(3 - stars) + '</span></div><p>' +
                (ok ? 'Índice de sostenibilidad final: <b>' + S.index.toFixed(0) + '</b>. ' + (stars < 3 ? 'Intenta superar 85 para las tres estrellas.' : 'Ciudad ejemplar.') : 'Revisa qué falló en los monitores y prueba otra estrategia de infraestructura.') +
                '</p><div class="cl-rbtn"><button id="cl-retry" class="cl-btn cl-go">↺ Reintentar</button><button id="cl-free" class="cl-btn">🧪 Modo libre</button></div>';
            ui.result.style.display = '';
            ui.result.querySelector('#cl-retry').onclick = () => loadMission(M.id);
            ui.result.querySelector('#cl-free').onclick = () => loadMission('libre');
        }
    }

    // ---------- interfaz ----------
    const ui = {};
    const TOOLINFO = {
        inspect: ['🔍', 'Inspeccionar', '', 'Pasa el cursor sobre el mapa para ver temperatura, agua, contaminación y basura de cada celda.'],
        park: ['🌳', 'Parque', COST.park, 'Absorbe agua y enfría la ciudad. Cuidado: la vegetación seca puede arder.'],
        swale: ['💧', 'Jardín de lluvia', COST.swale, 'Infiltra el agua de lluvia y la limpia. Ideal junto a calles.'],
        perm: ['🛣️', 'Pavimento permeable', COST.perm, 'Solo sobre calles: deja pasar el agua en lugar de dejarla correr.'],
        wetland: ['🌾', 'Humedal', COST.wetland, 'Filtra contaminantes y frena inundaciones. Mejor cerca del río.'],
        station: ['🚒', 'Bomberos', COST.station, 'Apaga incendios en un radio de 8 celdas.'],
        plant: ['🏭', 'Planta de tratamiento', COST.plant, 'Limpia el agua del río en su zona de influencia.'],
        recycle: ['♻️', 'Reciclaje', COST.recycle, 'Reduce la basura generada en 6 celdas a la redonda.'],
        clear: ['🧹', 'Limpiar / apagar', COST.clear, 'Quita fuego, basura y contaminación de una celda.'],
        demolish: ['⛏️', 'Demoler', COST.demolish, 'Deja un lote vacío.']
    };
    const EVINFO = [
        ['storm', '⛈️', 'Tormenta', 'Lluvia muy intensa durante 36 horas.'],
        ['fire', '🔥', 'Incendio', 'Enciende un foco en un parque o vivienda.'],
        ['heat', '🌡️', 'Ola de calor', '+6 °C durante 3 días.'],
        ['spill', '☣️', 'Derrame', 'Vierte contaminantes al río.'],
        ['strike', '🗑️', 'Paro de basura', 'Sin recolección durante 4 días.'],
        ['sponge', '🌿', 'Ciudad esponja', 'Aplica infraestructura verde de golpe (demo).']
    ];
    const SLIDERS = [
        ['Clima', [
            ['lluvia', 'Frecuencia de lluvia', 0, 100, 5, '%', 'Qué tan seguido llueve.'],
            ['temp', 'Temperatura base', 18, 38, 1, ' °C', 'Más calor = más incendios y más riesgo para la salud.']]],
        ['Residuos', [
            ['consumo', 'Generación de residuos', 0, 100, 5, '%', 'Basura que produce cada edificio.'],
            ['colecta', 'Recolección de basura', 0, 100, 5, '%', 'Qué tanta basura se retira.'],
            ['reciclaje', 'Reciclaje', 0, 100, 5, '%', 'Reduce la basura desde el origen.']]],
        ['Agua', [
            ['drenaje', 'Capacidad de drenaje', 0, 100, 5, '%', 'Qué tan rápido se va el agua de las calles.'],
            ['industria', 'Descargas industriales', 0, 100, 5, '%', 'Contaminación vertida al río.']]],
        ['Fuego', [
            ['ignicion', 'Riesgo de ignición', 0, 100, 5, '%', 'Probabilidad de que algo se incendie solo.'],
            ['bomberos', 'Respuesta de bomberos', 0, 100, 5, '%', 'Eficacia de las estaciones construidas.']]],
        ['Población', [
            ['pop', 'Habitantes (al reiniciar)', 50, 400, 10, '', 'Número de ciudadanos simulados.']]]
    ];
    const flatSliders = SLIDERS.reduce((a, g) => a.concat(g[1]), []);
    const NOTES = [
        ['🧩', 'Qué es este modelo', 'Es un <b>modelo basado en agentes</b>, al estilo de NetLogo: una rejilla de celdas (la ciudad) y agentes (los habitantes) que siguen reglas simples. De su interacción surgen inundaciones, incendios o contaminación. Cada paso equivale a <b>1 hora</b>.'],
        ['🌿', 'Agua y ciudad esponja', 'La lluvia cae en todas las celdas y escurre cuesta abajo hacia el río. Calles y edificios <b>no infiltran</b>; parques, jardines de lluvia, humedales y pavimento permeable <b>sí</b>. El drenaje saca agua de las calles, pero la basura lo tapa. Si el agua se acumula hay inundación y daña a la gente.'],
        ['🗑️', 'Basura y agua contaminada', 'Los edificios generan basura que se derrama a la calle. La recolección y el reciclaje la reducen. Cuando llueve, el agua <b>lava la basura</b> y la convierte en contaminación. Las industrias descargan al río y la corriente la lleva hacia el este. Humedales, jardines de lluvia y plantas de tratamiento la limpian.'],
        ['🔥', 'Incendios', 'Pueden iniciar por calor y sequía. El fuego se propaga según el <b>combustible</b> (vegetación, industria, basura), la humedad y el viento. El agua lo apaga y los bomberos lo combaten en un radio de 8 celdas. Lo quemado queda en ruinas.'],
        ['🌡️', 'Isla de calor', 'Cada superficie suma o resta grados: concreto, calles e industria calientan; árboles, humedales y agua enfrían. Una ola de calor sube la temperatura de toda la ciudad. Usa la vista <b>Calor</b> para ver dónde se concentra.'],
        ['❤️', 'Ciudadanos y salud', 'Los puntos del mapa son personas que caminan al azar. Pierden salud por fuego, inundación, agua contaminada, calor extremo y basura. Se recuperan poco a poco, más rápido en parques. Verde es sano; rojo, enfermo.'],
        ['🏙️', 'Índice de sostenibilidad', 'Combina salud (30%), calidad del agua (25%), ausencia de inundación (20%), confort térmico (15%) y ausencia de incendios (10%). Más de 70 es una meta razonable.'],
        ['⚠️', 'Limitaciones', 'Es un modelo simplificado con fines <b>didácticos</b>. Los valores son ilustrativos: no predice una ciudad real ni sustituye estudios técnicos.']
    ];
    const TABS = [['build', '🏗️', 'Construir'], ['events', '⚡', 'Eventos'], ['params', '⚙️', 'Ajustes'], ['chart', '📈', 'Gráfica'], ['model', '📖', 'Modelo']];
    let openTab = '';

    root.innerHTML = `
        <div class="cl-missions" id="cl-missions"></div>
        <div class="cl-goal" id="cl-goal"></div>
        <div class="cl-steps" id="cl-steps"></div>
        <div class="cl-coach" id="cl-coach"></div>
        <div class="cl-kpis" id="cl-mon"></div>
        <div class="cl-card cl-sim">
            <div class="cl-bar">
                <button class="cl-btn cl-go" id="cl-go" title="Inicia o pausa el paso del tiempo">▶ Iniciar simulación</button>
                <button class="cl-btn" id="cl-step" title="Avanza una hora">⏭ 1 hora</button>
                <button class="cl-btn cl-zoombtn" id="cl-zoom" title="Agranda el mapa para tocar con más precisión">🔍 Ampliar mapa</button>
                <button class="cl-btn" id="cl-setup" title="Vuelve a generar la ciudad de esta misión">↺ Reiniciar</button>
                <span class="cl-speed" title="Velocidad de la simulación"><button data-s="4">🐢</button><button data-s="8" class="on">1×</button><button data-s="16">2×</button><button data-s="30">4×</button></span>
                <span class="cl-clockbox"><span id="cl-clock">Día 1 · 08:00</span><span id="cl-hud" class="cl-hud"></span></span>
            </div>
            <div class="cl-bar2">
                <div class="cl-views" id="cl-views" title="Cambia lo que muestra el mapa"><span>Ver mapa:</span>
                    <button data-view="normal" class="on">🏙️ Ciudad</button><button data-view="heat">🌡️ Calor</button><button data-view="water">🌊 Agua</button><button data-view="poll">☣️ Contaminación</button><button data-view="trash">🗑️ Basura</button>
                </div>
                <div class="cl-tabs" id="cl-tabs">${TABS.map(t => '<button data-tab="' + t[0] + '"><span>' + t[1] + '</span> ' + t[2] + '</button>').join('')}</div>
            </div>
            <div class="cl-body" id="cl-body">
                <div class="cl-mapcol">
                    <div class="cl-stage">
                        <canvas id="cl-canvas"></canvas>
                        <div class="cl-toast" id="cl-toast"></div>
                        <div class="cl-guide" id="cl-guide">
                            <h3>Cómo se juega</h3>
                            <ol>
                                <li><b>Elige una misión</b> arriba y lee su objetivo.</li>
                                <li><b>Construye:</b> en la pestaña <em>🏗️ Construir</em> elige una herramienta y haz clic o arrastra sobre el mapa.</li>
                                <li>Presiona <b>▶ Iniciar simulación</b> y observa cómo reacciona la ciudad.</li>
                                <li>Sigue el <b>cuadro azul de consejos</b>: te dice qué hacer cuando algo va mal.</li>
                                <li>La pestaña <em>📖 Modelo</em> explica cómo funciona todo.</li>
                            </ol>
                            <button class="cl-btn cl-go" id="cl-guide-ok">Entendido, ¡a jugar!</button>
                        </div>
                        <div class="cl-result" id="cl-result" style="display:none"></div>
                    </div>
                    <div class="cl-info" id="cl-info"></div>
                    <div class="cl-last" id="cl-last"></div>
                </div>
                <div class="cl-drawer" id="cl-drawer">
                    <div class="cl-dh"><b id="cl-dtitle"></b><button id="cl-dclose" title="Cerrar panel">✕</button></div>
                    <div class="cl-dp" data-pane="build">
                        <div class="cl-tooldesc" id="cl-tooldesc"></div>
                        <div class="cl-toolgrid" id="cl-tools"></div>
                    </div>
                    <div class="cl-dp" data-pane="events">
                        <p class="cl-help">Pon a prueba tu ciudad provocando situaciones.</p>
                        <div class="cl-evgrid" id="cl-events"></div>
                        <h5 class="cl-h5">Historial</h5>
                        <ul class="cl-log" id="cl-log"></ul>
                    </div>
                    <div class="cl-dp" data-pane="params">
                        <p class="cl-help">Cambia las políticas de la ciudad. Se aplican al instante.</p>
                        <div id="cl-sliders"></div>
                        <label class="cl-sl"><span>Viento</span><span class="cl-d">Empuja el fuego en su dirección.</span>
                            <select id="cl-viento"><option value="calma">Calma</option><option value="norte">Norte</option><option value="sur">Sur</option><option value="este">Este</option><option value="oeste">Oeste</option></select>
                        </label>
                    </div>
                    <div class="cl-dp" data-pane="chart">
                        <p class="cl-help">Todas las líneas suben cuando la ciudad mejora.</p>
                        <canvas id="cl-chart" width="320" height="170"></canvas>
                        <div class="cl-legend"><span style="--c:#5fd38d">Salud</span><span style="--c:#4aa3ff">Agua limpia</span><span style="--c:#b58aff">Sin inundación</span><span style="--c:#ff9a4a">Confort térmico</span></div>
                    </div>
                    <div class="cl-dp" data-pane="model">
                        <details class="cl-acc" open><summary>🎨 Leyenda del mapa</summary><div class="cl-legend2" id="cl-legend2"></div></details>
                        ${NOTES.map(n => '<details class="cl-acc"><summary>' + n[0] + ' ' + n[1] + '</summary><p>' + n[2] + '</p></details>').join('')}
                        <button class="cl-btn" id="cl-help" style="margin-top:.6rem">❓ Ver la guía de inicio</button>
                    </div>
                </div>
            </div>
        </div>`;
    const $ = id => root.querySelector('#' + id);
    ui.canvas = $('cl-canvas'); ui.log = $('cl-log'); ui.mon = $('cl-mon'); ui.info = $('cl-info'); ui.clock = $('cl-clock'); ui.hud = $('cl-hud');
    ui.chart = $('cl-chart'); ui.go = $('cl-go'); ui.toast = $('cl-toast'); ui.guide = $('cl-guide'); ui.result = $('cl-result'); ui.goal = $('cl-goal');
    ui.last = $('cl-last'); ui.coach = $('cl-coach'); ui.steps = $('cl-steps'); ui.body = $('cl-body');

    function setGoLabel() {
        const started = S.tick > M.start;
        ui.go.textContent = running ? '⏸ Pausar' : (started ? '▶ Continuar' : '▶ Iniciar simulación');
        ui.go.classList.toggle('run', running);
    }

    // pestañas del panel (se abre y se cierra)
    function setTab(t) {
        openTab = openTab === t ? '' : t;
        ui.body.classList.toggle('open', !!openTab);
        $('cl-drawer').style.display = openTab ? 'block' : 'none';          // no depende de la hoja de estilos
        root.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === openTab));
        root.querySelectorAll('[data-pane]').forEach(p => { const on = p.dataset.pane === openTab; p.classList.toggle('on', on); p.style.display = on ? 'block' : 'none'; });
        const tt = TABS.find(x => x[0] === openTab); $('cl-dtitle').textContent = tt ? tt[1] + ' ' + tt[2] : '';
        if (openTab === 'chart') drawChart();
        renderCoach.last = null; renderCoach();
        setTimeout(resize, 0);
    }
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('cl-dclose').addEventListener('click', () => setTab(openTab));

    // misiones (selector)
    $('cl-missions').innerHTML = Object.keys(MISSIONS).map(id => '<button data-m="' + id + '"><span>' + MISSIONS[id].icon + '</span><b>' + MISSIONS[id].name + '</b></button>').join('');
    root.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { loadMission(b.dataset.m); ui.guide.style.display = 'none'; }));
    function renderMission() {
        root.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === M.id));
        updateGoal();
    }
    function updateGoal() {
        const m = MISSIONS[M.id], rel = Math.max(0, S.tick - M.start), day = Math.min(m.days, rel / 24);
        let h = '<div class="cl-goal-t"><b>🎯 Objetivo</b>' + (m.days ? '<span>Día ' + Math.min(m.days, Math.floor(day) + 1) + ' de ' + m.days + '</span>' : '') + '</div><p>' + m.goal + '</p>';
        if (m.days) h += '<div class="cl-prog"><i style="width:' + (day / m.days * 100) + '%"></i></div><div class="cl-chips">' + m.live().map(c => '<span class="' + (c.ok ? 'ok' : 'bad') + '">' + (c.ok ? '✔' : '✖') + ' ' + c.k + ': ' + c.v + '</span>').join('') + '</div>';
        ui.goal.innerHTML = h;
    }
    function renderSteps() {
        const started = S.tick > M.start, st = M.done ? 3 : (started ? 3 : 2);
        const s = (n, t, on, done) => '<span class="' + (on ? 'on ' : '') + (done ? 'done' : '') + '"><i>' + (done ? '✔' : n) + '</i>' + t + '</span>';
        ui.steps.innerHTML = s(1, 'Elige misión', false, true) + s(2, 'Construye', st === 2, st > 2) + s(3, 'Simula y reacciona', st === 3, M.done);
    }
    function coach() {
        const started = S.tick > M.start;
        if (M.done) return { t: '🏁 La misión terminó. Usa ↺ Reiniciar para reintentar o elige otra misión arriba.' };
        if (S.burning > 0) return { t: '🔥 ¡Hay un incendio! Construye 🚒 Bomberos cerca, o usa 🧹 Limpiar / apagar sobre las llamas.', tab: 'build' };
        if (S.flood > 5) return { t: '🌊 La ciudad se está inundando. Prueba 💧 Jardines de lluvia, 🛣️ Pavimento permeable o 🌾 Humedales, y sube el drenaje en Ajustes.', tab: 'build' };
        if (S.quality < 50) return { t: '☣️ El río está contaminado. Construye 🏭 Planta de tratamiento o 🌾 Humedales, o baja las descargas industriales en Ajustes.', tab: 'build' };
        if (S.Tmax > 38) return { t: '🌡️ Hace mucho calor. Planta 🌳 Parques y 🌾 Humedales; mira la vista 🌡️ Calor para ubicar las zonas más calientes.', tab: 'build' };
        if (S.trashAvg > 0.3) return { t: '🗑️ Se acumula la basura. Sube la recolección o el reciclaje en Ajustes, o construye ♻️ Reciclaje.', tab: 'params' };
        if (!started) return { t: openTab === 'build' ? '👉 Paso 2: elige una herramienta del panel de la derecha y haz clic o arrastra sobre el mapa. Cuando estés listo, presiona ▶ Iniciar simulación.' : '👉 Paso 2: abre 🏗️ Construir, elige una herramienta y haz clic o arrastra sobre el mapa. Cuando estés listo, presiona ▶ Iniciar simulación.', tab: openTab === 'build' ? '' : 'build' };
        if (running) return { t: '👀 Observa cómo reacciona la ciudad. Si algún indicador se pone en rojo, aquí te diré qué hacer.' };
        return { t: '⏸ Simulación en pausa. Puedes seguir construyendo o presionar ▶ Continuar.' };
    }
    function renderCoach() {
        const c = coach();
        const sig = c.t + '|' + (c.tab || '');
        if (sig === renderCoach.last) return; renderCoach.last = sig;
        ui.coach.innerHTML = '<span>' + c.t + '</span>' + (c.tab ? '<button data-open="' + c.tab + '">Abrir ' + TABS.find(x => x[0] === c.tab)[2] + '</button>' : '');
        const b = ui.coach.querySelector('[data-open]');
        if (b) b.addEventListener('click', () => { if (openTab !== b.dataset.open) setTab(b.dataset.open); });
    }

    // sliders agrupados
    $('cl-sliders').innerHTML = SLIDERS.map(g => '<div class="cl-grp"><h5>' + g[0] + '</h5>' + g[1].map(s => `<label class="cl-sl"><span>${s[1]}</span><b data-o="${s[0]}">${P[s[0]]}${s[5]}</b><span class="cl-d">${s[6]}</span><input type="range" data-p="${s[0]}" min="${s[2]}" max="${s[3]}" step="${s[4]}" value="${P[s[0]]}"></label>`).join('') + '</div>').join('');
    root.querySelectorAll('input[data-p]').forEach(el => el.addEventListener('input', () => {
        const k = el.dataset.p; P[k] = +el.value;
        const s = flatSliders.find(q => q[0] === k); root.querySelector('[data-o="' + k + '"]').textContent = P[k] + s[5];
    }));
    function syncSliders() {
        root.querySelectorAll('input[data-p]').forEach(el => { const k = el.dataset.p; el.value = P[k]; const s = flatSliders.find(q => q[0] === k); root.querySelector('[data-o="' + k + '"]').textContent = P[k] + s[5]; });
        $('cl-viento').value = P.viento;
    }
    $('cl-viento').addEventListener('change', e => { P.viento = e.target.value; });

    // vistas del mapa
    root.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
        view = b.dataset.view; root.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('on', x === b)); updateLegend();
    }));

    // herramientas y eventos
    $('cl-tools').innerHTML = Object.keys(TOOLINFO).map(k => { const t = TOOLINFO[k]; return '<button data-tool="' + k + '"' + (k === 'inspect' ? ' class="on"' : '') + ' title="' + t[3] + '"><span class="ic">' + t[0] + '</span><b>' + t[1] + '</b>' + (t[2] !== '' ? '<i>$' + t[2] + '</i>' : '') + '</button>'; }).join('');
    $('cl-events').innerHTML = EVINFO.map(e => '<button data-ev="' + e[0] + '"' + (e[0] === 'sponge' ? ' class="cl-accent"' : '') + '><span class="ic">' + e[1] + '</span><b>' + e[2] + '</b><small>' + e[3] + '</small></button>').join('');
    function updateToolDesc() {
        const t = TOOLINFO[tool];
        $('cl-tooldesc').innerHTML = '<b>' + t[0] + ' ' + t[1] + (t[2] !== '' ? ' · $' + t[2] : '') + '</b><span>' + t[3] + '</span>' + (tool === 'inspect' ? '' : '<em>👆 Ahora haz clic o arrastra sobre el mapa.</em>');
    }
    root.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => {
        tool = b.dataset.tool; root.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('on', x === b));
        ui.canvas.style.touchAction = tool === 'inspect' ? (zoomed ? 'pan-x pan-y' : 'pan-y') : 'none';
        ui.canvas.style.cursor = tool === 'inspect' ? 'crosshair' : 'copy';
        ui.guide.style.display = 'none'; updateToolDesc(); updateInfo();
    }));
    const EVS = { fire: evFire, storm: evStorm, heat: evHeat, spill: evSpill, strike: evStrike, sponge: evSponge };
    root.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => { EVS[b.dataset.ev](); ui.guide.style.display = 'none'; }));

    // controles de simulación
    ui.go.addEventListener('click', () => {
        if (M.done) { toast('La misión terminó: usa Reiniciar o elige otra'); return; }
        running = !running; setGoLabel(); ui.guide.style.display = 'none';
    });
    $('cl-step').addEventListener('click', () => { if (!M.done) { step(); setGoLabel(); } ui.guide.style.display = 'none'; });
    $('cl-setup').addEventListener('click', () => loadMission(M.id));
    $('cl-zoom').addEventListener('click', () => {
        zoomed = !zoomed; ui.canvas.parentElement.classList.toggle('zoom', zoomed);
        $('cl-zoom').textContent = zoomed ? '🔍 Reducir mapa' : '🔍 Ampliar mapa';
        ui.canvas.style.touchAction = tool === 'inspect' ? (zoomed ? 'pan-x pan-y' : 'pan-y') : 'none';
        resize(); if (zoomed) toast('Mapa ampliado: con 🔍 Inspeccionar puedes desplazarlo con el dedo');
    });
    $('cl-help').addEventListener('click', () => { ui.guide.style.display = ''; });
    $('cl-guide-ok').addEventListener('click', () => { ui.guide.style.display = 'none'; });
    root.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => {
        P.speed = +b.dataset.s; root.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', x === b));
    }));

    let toastT = 0;
    function toast(m) { ui.toast.textContent = m; ui.toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => ui.toast.classList.remove('on'), 2200); }

    // leyenda del mapa
    function updateLegend() {
        const sw = (c, t) => '<span><i style="background:' + c + '"></i>' + t + '</span>';
        let h = '';
        if (view === 'heat') h = '<span class="cl-grad"><i style="background:linear-gradient(90deg,#2850c8,#ffd060,#ff3c32)"></i>Fresco → Muy caliente</span>';
        else if (view === 'water') h = sw('rgb(70,150,255)', 'Agua sobre la calle (inundación)') + sw('rgb(165,70,210)', 'Agua contaminada');
        else if (view === 'poll') h = sw('rgb(165,70,210)', 'Contaminación (más intenso = peor)');
        else if (view === 'trash') h = sw('rgb(210,150,70)', 'Basura acumulada');
        else h = sw('#e0cda3', 'Vivienda') + sw('#5d7fb8', 'Comercio / torres') + sw('#85746a', 'Industria') + sw('#3f8a55', 'Parque / árboles') + sw(COL[1], 'Calle') + sw(COL[6], 'Río') + sw('#6ebeff', 'Jardín de lluvia / humedal') +
            sw(COL[10], 'Bomberos') + sw('#2a8f8f', 'Planta de tratamiento') + sw('#3f9a44', 'Reciclaje') + sw(COL[13], 'Ruinas') +
            sw('rgba(70,150,255,.8)', 'Agua') + sw('rgba(165,70,210,.8)', 'Contaminación') + sw('#1f2326', 'Basura') + sw('#ff7a14', 'Fuego') + '<span><i class="dot" style="background:hsl(120,85%,55%)"></i><i class="dot" style="background:hsl(60,85%,55%)"></i><i class="dot" style="background:hsl(0,85%,55%)"></i>Personas: sana → enferma</span>';
        $('cl-legend2').innerHTML = h;
    }

    let down = false;
    function cellFrom(e) {
        const r = ui.canvas.getBoundingClientRect();
        return [Math.floor((e.clientX - r.left) / r.width * COLS), Math.floor((e.clientY - r.top) / r.height * (ROWS + OYF) - OYF)];
    }
    ui.canvas.addEventListener('pointerdown', e => { down = true; lastCell = -1; const [x, y] = cellFrom(e); hover = [x, y]; applyTool(x, y); if (tool !== 'inspect') ui.canvas.setPointerCapture(e.pointerId); });
    ui.canvas.addEventListener('pointermove', e => { const [x, y] = cellFrom(e); hover = [x, y]; if (down) applyTool(x, y); });
    ['pointerup', 'pointercancel'].forEach(ev => ui.canvas.addEventListener(ev, () => { down = false; }));
    ui.canvas.addEventListener('pointerleave', () => { hover = null; });

    // ---------- dibujo ----------
    const ctx = ui.canvas.getContext('2d');
    let cs = 12, dpr = 1, cssW = 0;
    function resize() {
        const base = ui.canvas.parentElement.clientWidth; if (!base) return;
        const w = zoomed ? Math.min(Math.round(base * 2.2), 1800) : base;
        cssW = w; dpr = Math.min(window.devicePixelRatio || 1, 2);
        cs = w / COLS;
        ui.canvas.style.width = w + 'px'; ui.canvas.style.height = (cs * (ROWS + OYF)) + 'px';
        ui.canvas.width = Math.round(w * dpr); ui.canvas.height = Math.round(cs * (ROWS + OYF) * dpr);
    }
    let zoomed = false;
    if (window.ResizeObserver) new ResizeObserver(resize).observe(ui.canvas.parentElement); else window.addEventListener('resize', resize);

    const COL = ['#2c3128', '#3b3f47', '#c2a46a', '#6f86b0', '#8a7468', '#3f8a55', '#2f6f9f', '#3c9a86', '#4fa57e', '#56626e', '#c0392b', '#22a7a7', '#4aa84a', '#3a312d'];
    function heatColor(t) {
        const v = clamp((t - 24) / 22, 0, 1);
        const r = v < 0.5 ? 40 + v * 2 * 215 : 255, g = v < 0.5 ? 90 + v * 2 * 140 : 230 - (v - 0.5) * 2 * 200, b = v < 0.5 ? 200 - v * 2 * 150 : 50 - (v - 0.5) * 2 * 50;
        return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
    }
    function hash(i, k) { return ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1; }

    // ---- render 2.5D (proyección oblicua): suelo, objetos fila por fila, personas, fuego y ambiente ----
    const OYF = 1.4;                       // margen superior (en celdas) para edificios altos
    const GROUND = ['#586246', '#3a3e46', '#5b5f55', '#4d5360', '#555049', '#3f6f45', '#2f6f9f', '#355a4a', '#41603f', '#59636e', '#555a60', '#4d5a5d', '#4f5b4f', '#413a36'];
    const shCache = {};
    function sh(hex, f) {
        const k = hex + f; if (shCache[k]) return shCache[k];
        const n = parseInt(hex.slice(1), 16);
        const r = clamp(((n >> 16) & 255) * f, 0, 255) | 0, g = clamp(((n >> 8) & 255) * f, 0, 255) | 0, b = clamp((n & 255) * f, 0, 255) | 0;
        return (shCache[k] = 'rgb(' + r + ',' + g + ',' + b + ')');
    }
    const isRoadT = (x, y) => inb(x, y) && (type[idx(x, y)] === T.ROAD || type[idx(x, y)] === T.PERM);

    function box(px, base, w, h, d, front, top) {
        ctx.fillStyle = front; ctx.fillRect(px, base - h, w, h);
        ctx.fillStyle = top; ctx.fillRect(px, base - h - d, w, d);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(px + w * 0.8, base - h, w * 0.2, h);
        ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(px, base - h - d, w, Math.max(1, cs * 0.06));
    }
    function windows(px, base, w, h, nc, nr, lit, col) {
        const ww = w / (nc * 2 + 1), wh = h / (nr * 2 + 1);
        for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
            ctx.fillStyle = lit && ((r * 3 + c * 5) % 3 !== 0) ? '#ffe9a0' : col;
            ctx.fillRect(px + ww * (1 + c * 2), base - h + wh * (1 + r * 2), ww, wh);
        }
    }
    function tree(cx, base, r, i, burning) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx + r * 0.2, base, r * 0.95, r * 0.35, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#5b3d28'; ctx.fillRect(cx - r * 0.13, base - r * 0.95, r * 0.26, r * 0.95);
        ctx.fillStyle = burning ? '#7a4a22' : sh('#2f7a45', 0.85 + hash(i, 7) * 0.3); ctx.beginPath(); ctx.arc(cx, base - r * 1.45, r, 0, 6.3); ctx.fill();
        ctx.fillStyle = burning ? '#a8672c' : sh('#58b36f', 0.9 + hash(i, 8) * 0.25); ctx.beginPath(); ctx.arc(cx - r * 0.3, base - r * 1.7, r * 0.55, 0, 6.3); ctx.fill();
    }
    function flames(cx, base, f, time, i) {
        const hg = cs * (0.55 + 0.6 * f);
        ctx.fillStyle = 'rgba(255,120,30,0.28)'; ctx.beginPath(); ctx.arc(cx, base - hg * 0.4, cs * 0.75, 0, 6.3); ctx.fill();
        for (let k = -1; k <= 1; k++) {
            const sw = Math.sin(time * 0.012 + i * 1.7 + k * 2) * cs * 0.07, fx = cx + k * cs * 0.22, th = hg * (0.75 + 0.25 * Math.sin(time * 0.02 + i + k));
            ctx.fillStyle = '#ff6a14'; ctx.beginPath(); ctx.moveTo(fx - cs * 0.14, base); ctx.quadraticCurveTo(fx - cs * 0.12 + sw, base - th * 0.6, fx + sw, base - th); ctx.quadraticCurveTo(fx + cs * 0.12 + sw, base - th * 0.6, fx + cs * 0.14, base); ctx.fill();
            ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.moveTo(fx - cs * 0.07, base); ctx.quadraticCurveTo(fx + sw * 0.6, base - th * 0.55, fx + sw * 0.8, base - th * 0.62); ctx.quadraticCurveTo(fx + cs * 0.06, base - th * 0.3, fx + cs * 0.07, base); ctx.fill();
        }
    }

    function draw(time) {
        if (!cssW) { resize(); if (!cssW) return; }
        const oy = cs * OYF, H = cs * (ROWS + OYF), hour = S.tick % 24;
        const night = hour >= 7 && hour <= 19 ? 0 : (hour >= 21 || hour <= 4 ? 0.38 : 0.18);
        const lit = night > 0.15, flat = view !== 'normal';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#12161a'; ctx.fillRect(0, 0, cssW, H);

        // ---------- 1) suelo ----------
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const i = idx(x, y), t = type[i], px = x * cs, py = y * cs + oy;
            if (view === 'heat') { ctx.fillStyle = heatColor(S.Tg + heatA[i]); ctx.fillRect(px, py, cs + 0.5, cs + 0.5); continue; }
            if (flat) { ctx.fillStyle = '#16191d'; ctx.fillRect(px, py, cs + 0.5, cs + 0.5); }
            else {
                ctx.fillStyle = sh(GROUND[t], 0.94 + hash(i, 9) * 0.12); ctx.fillRect(px, py, cs + 0.5, cs + 0.5);
                if (t === T.ROAD) {
                    const hz = isRoadT(x - 1, y) || isRoadT(x + 1, y), vt = isRoadT(x, y - 1) || isRoadT(x, y + 1);
                    ctx.fillStyle = 'rgba(255,214,90,0.4)';
                    if (hz && !vt) ctx.fillRect(px + cs * 0.15, py + cs * 0.46, cs * 0.7, Math.max(1, cs * 0.08));
                    else if (vt && !hz) ctx.fillRect(px + cs * 0.46, py + cs * 0.15, Math.max(1, cs * 0.08), cs * 0.7);
                } else if (t === T.PERM) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; ctx.beginPath();
                    ctx.moveTo(px, py + cs / 2); ctx.lineTo(px + cs, py + cs / 2); ctx.moveTo(px + cs / 2, py); ctx.lineTo(px + cs / 2, py + cs); ctx.stroke();
                    ctx.fillStyle = 'rgba(120,200,120,0.25)'; ctx.fillRect(px + cs * 0.1, py + cs * 0.1, cs * 0.18, cs * 0.18);
                } else if (t === T.RIVER) {
                    ctx.fillStyle = 'rgba(255,255,255,' + (0.07 + 0.06 * Math.sin(time * 0.002 + x * 0.6 + y)) + ')'; ctx.fillRect(px + cs * 0.1, py + cs * 0.4, cs * 0.8, Math.max(1, cs * 0.1));
                } else if (t === T.WETLAND || t === T.SWALE) {
                    ctx.fillStyle = 'rgba(110,190,255,0.5)'; ctx.beginPath(); ctx.ellipse(px + cs / 2, py + cs * 0.62, cs * 0.38, cs * 0.2, 0, 0, 6.3); ctx.fill();
                }
            }
            const wv = water[i];
            if (wv > 0.02 && t !== T.RIVER) { ctx.fillStyle = 'rgba(70,150,255,' + Math.min(0.8, wv * 1.8 + (view === 'water' ? 0.25 : 0)) + ')'; ctx.fillRect(px, py, cs + 0.5, cs + 0.5); }
            if (view === 'water' && t === T.RIVER) { ctx.fillStyle = 'rgba(60,130,230,0.8)'; ctx.fillRect(px, py, cs + 0.5, cs + 0.5); }
            const c = t === T.RIVER ? pm[i] / Math.max(water[i], 0.3) : (water[i] > 0.02 || view === 'poll' ? pm[i] * 2 : 0);
            if (c > 0.08 && view !== 'water' && view !== 'trash') { ctx.fillStyle = 'rgba(165,70,210,' + Math.min(0.8, c * (view === 'poll' ? 1.6 : 0.8)) + ')'; ctx.fillRect(px, py, cs + 0.5, cs + 0.5); }
            if (view === 'trash' && trash[i] > 0.1) { ctx.fillStyle = 'rgba(210,150,70,' + (0.35 + Math.min(1, trash[i]) * 0.6) + ')'; ctx.fillRect(px, py, cs + 0.5, cs + 0.5); }
            if (fire[i] > 0) { ctx.fillStyle = 'rgba(255,90,20,' + (0.25 + fire[i] * 0.3) + ')'; ctx.fillRect(px, py, cs + 0.5, cs + 0.5); }
        }

        // ---------- 2) objetos fila por fila (los de abajo tapan a los de arriba) ----------
        const rows = []; for (let y = 0; y < ROWS; y++) rows.push([]);
        for (const p of people) rows[p.y].push(p);
        for (let y = 0; y < ROWS; y++) {
            if (!flat) for (let x = 0; x < COLS; x++) {
                const i = idx(x, y), t = type[i], px = x * cs, base = y * cs + oy + cs * 0.92, cx = px + cs / 2, b = bld[i];
                const burning = fire[i] > 0;
                if (t === T.RES) {
                    const h = cs * (0.34 + b * 0.22), w = cs * 0.8, x0 = px + cs * 0.1, roofs = ['#b5523f', '#9c6a3c', '#8d4b4b'];
                    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x0 + w * 0.1, base - 1, w, cs * 0.1);
                    ctx.fillStyle = burning ? '#7a6a58' : '#e0cda3'; ctx.fillRect(x0, base - h, w, h);
                    ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(x0 + w * 0.8, base - h, w * 0.2, h);
                    ctx.fillStyle = roofs[(b * 3) | 0]; ctx.beginPath(); ctx.moveTo(x0 - cs * 0.05, base - h); ctx.lineTo(cx, base - h - cs * 0.36); ctx.lineTo(x0 + w + cs * 0.05, base - h); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.moveTo(x0 - cs * 0.05, base - h); ctx.lineTo(cx, base - h - cs * 0.36); ctx.lineTo(cx, base - h); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = lit ? '#ffe9a0' : '#6b86a3'; ctx.fillRect(x0 + w * 0.14, base - h * 0.75, w * 0.2, h * 0.38); ctx.fillRect(x0 + w * 0.6, base - h * 0.75, w * 0.2, h * 0.38);
                } else if (t === T.COM) {
                    const h = cs * (0.8 + b * 1.15), w = cs * 0.84, x0 = px + cs * 0.08;
                    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x0 + w * 0.15, base - 1, w, cs * 0.12);
                    box(x0, base, w, h, cs * 0.3, burning ? '#5b5f6c' : '#5d7fb8', '#9fb7e0');
                    windows(x0, base, w, h, 3, Math.max(2, Math.round(h / (cs * 0.3))), lit, 'rgba(210,230,255,0.45)');
                } else if (t === T.IND) {
                    const h = cs * (0.5 + b * 0.25), w = cs * 0.86, x0 = px + cs * 0.07;
                    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x0 + w * 0.15, base - 1, w, cs * 0.12);
                    box(x0, base, w, h, cs * 0.26, burning ? '#4d4540' : '#85746a', '#a39287');
                    ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 3; k++) ctx.fillRect(x0 + w * (0.08 + k * 0.3), base - h * 0.45, w * 0.2, h * 0.4);
                    const chx = x0 + w * 0.68; ctx.fillStyle = '#6a5d55'; ctx.fillRect(chx, base - h - cs * 0.62, cs * 0.14, cs * 0.5);
                    ctx.fillStyle = '#c0392b'; ctx.fillRect(chx, base - h - cs * 0.62, cs * 0.14, cs * 0.07);
                    if (running && S.fireless !== true) for (let k = 0; k < 3; k++) { const ph = ((time * 0.0005 + k / 3 + b) % 1); ctx.fillStyle = 'rgba(190,190,195,' + (0.4 * (1 - ph)) + ')'; ctx.beginPath(); ctx.arc(chx + cs * 0.07 + ph * cs * 0.3, base - h - cs * 0.7 - ph * cs * 0.9, cs * (0.1 + ph * 0.18), 0, 6.3); ctx.fill(); }
                } else if (t === T.STATION) {
                    const h = cs * 0.6, w = cs * 0.84, x0 = px + cs * 0.08;
                    box(x0, base, w, h, cs * 0.26, '#c0392b', '#e5685b');
                    ctx.fillStyle = '#fff'; ctx.fillRect(cx - cs * 0.05, base - h * 0.85, cs * 0.1, h * 0.7); ctx.fillRect(cx - cs * 0.19, base - h * 0.58, cs * 0.38, cs * 0.1);
                    ctx.fillStyle = S.burning > 0 && ((time / 250) | 0) % 2 ? '#4aa3ff' : '#ffd24a'; ctx.beginPath(); ctx.arc(cx, base - h - cs * 0.3, cs * 0.08, 0, 6.3); ctx.fill();
                } else if (t === T.PLANT) {
                    const w = cs * 0.84, x0 = px + cs * 0.08, h = cs * 0.45;
                    box(x0, base, w, h * 0.7, cs * 0.2, '#2a8f8f', '#59c4c4');
                    for (let k = 0; k < 2; k++) {
                        const tx = x0 + w * (0.28 + k * 0.45), tr = cs * 0.2;
                        ctx.fillStyle = '#8fdede'; ctx.fillRect(tx - tr, base - h * 1.35, tr * 2, h * 0.9);
                        ctx.fillStyle = '#d7ffff'; ctx.beginPath(); ctx.ellipse(tx, base - h * 1.35, tr, tr * 0.45, 0, 0, 6.3); ctx.fill();
                    }
                } else if (t === T.RECYCLE) {
                    const h = cs * 0.55, w = cs * 0.84, x0 = px + cs * 0.08;
                    box(x0, base, w, h, cs * 0.24, '#3f9a44', '#74cf79');
                    ctx.fillStyle = '#eaffea'; ctx.font = '700 ' + (cs * 0.55) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♻', cx, base - h * 0.5);
                } else if (t === T.PARK) {
                    const r = cs * (0.27 + b * 0.1);
                    if (b > 0.55) { tree(px + cs * 0.27, base - cs * 0.05, r * 0.72, i, burning); tree(px + cs * 0.73, base - cs * 0.1, r * 0.72, i + 1, burning); }
                    else tree(cx, base, r, i, burning);
                } else if (t === T.SWALE || t === T.WETLAND) {
                    for (let k = 0; k < 5; k++) {
                        const rx = px + cs * (0.15 + k * 0.17), rh = cs * (0.28 + hash(i, k) * 0.28), sw = Math.sin(time * 0.002 + k + i) * cs * 0.04;
                        ctx.strokeStyle = t === T.WETLAND ? '#8bd18f' : '#7cc58c'; ctx.lineWidth = Math.max(1, cs * 0.06); ctx.beginPath(); ctx.moveTo(rx, base - cs * 0.12); ctx.quadraticCurveTo(rx + sw, base - rh * 0.6, rx + sw * 1.5, base - rh); ctx.stroke();
                        ctx.fillStyle = t === T.WETLAND ? '#8b5a2b' : '#ff9ccf'; ctx.beginPath(); ctx.ellipse(rx + sw * 1.5, base - rh, cs * 0.05, cs * 0.09, 0, 0, 6.3); ctx.fill();
                    }
                } else if (t === T.RUIN) {
                    for (let k = 0; k < 4; k++) { ctx.fillStyle = sh('#4a423d', 0.8 + hash(i, k) * 0.5); ctx.fillRect(px + cs * (0.1 + hash(i, k + 4) * 0.55), base - cs * (0.12 + hash(i, k + 8) * 0.22), cs * (0.18 + hash(i, k + 12) * 0.2), cs * (0.12 + hash(i, k + 8) * 0.2)); }
                }
                if (trash[i] > 0.25) {
                    const n = trash[i] > 0.9 ? 3 : (trash[i] > 0.5 ? 2 : 1);
                    for (let k = 0; k < n; k++) { const bx = px + cs * (0.15 + hash(i, 20 + k) * 0.6), by = base - cs * 0.04 - hash(i, 30 + k) * cs * 0.15; ctx.fillStyle = '#1f2326'; ctx.beginPath(); ctx.arc(bx, by, cs * 0.1, 0, 6.3); ctx.fill(); ctx.fillStyle = '#3a4046'; ctx.fillRect(bx - cs * 0.025, by - cs * 0.17, cs * 0.05, cs * 0.08); }
                }
                if (burning) flames(cx, base - cs * 0.05, fire[i], time, i);
            }
            // personas de esta fila
            const pr = Math.max(1.5, cs * 0.1);
            for (const p of rows[y]) {
                const bx = p.x * cs + cs * (0.2 + hash(p.x * 7 + p.y, 5) * 0.6), by = y * cs + oy + cs * (0.55 + hash(p.y * 5 + p.x, 6) * 0.4) + Math.sin(time * 0.01 + p.x * 3 + p.y) * cs * 0.02;
                const col = 'hsl(' + (clamp(p.hp, 0, 100) * 1.2 | 0) + ',85%,55%)';
                if (flat) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(bx, by, pr, 0, 6.3); ctx.fill(); continue; }
                ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(bx, by + pr * 1.6, pr * 1.1, pr * 0.45, 0, 0, 6.3); ctx.fill();
                ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(bx, by + pr * 0.4, pr * 0.9, pr * 1.3, 0, 0, 6.3); ctx.fill();
                ctx.fillStyle = '#f3d9bd'; ctx.beginPath(); ctx.arc(bx, by - pr * 1.1, pr * 0.7, 0, 6.3); ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
            }
            if (flat) for (let x = 0; x < COLS; x++) { const i = idx(x, y); if (fire[i] > 0) { ctx.fillStyle = 'rgba(255,120,20,0.85)'; ctx.fillRect(x * cs, y * cs + oy, cs, cs); } }
        }

        // ---------- 3) ambiente ----------
        if (night) { ctx.fillStyle = 'rgba(5,10,35,' + night + ')'; ctx.fillRect(0, 0, cssW, H); }
        if (S.rain > 0 && view === 'normal') {
            ctx.fillStyle = 'rgba(40,60,90,0.18)'; ctx.fillRect(0, 0, cssW, H);
            ctx.strokeStyle = 'rgba(190,215,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath();
            const n = 90 * S.rain | 0;
            for (let k = 0; k < n; k++) { const rx = rnd() * cssW, ry = rnd() * H; ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 9); }
            ctx.stroke();
        }
        // etiquetas de zonas
        const fs = Math.max(9, cs * 0.78);
        ctx.font = '600 ' + fs + 'px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        [['Río', COLS - 10, riverY[COLS - 10]], ['Zona industrial', 8, 20], ['Centro comercial', 28, 14], ['Colonias', 47, 9], ['Colonias', 6, 9]].forEach(l => {
            const tw = ctx.measureText(l[0]).width + fs, X = l[1] * cs + cs / 2, Y = l[2] * cs + cs / 2 + oy;
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(X - tw / 2, Y - fs * 0.8, tw, fs * 1.6, fs * 0.8) : ctx.rect(X - tw / 2, Y - fs * 0.8, tw, fs * 1.6); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillText(l[0], X, Y + 0.5);
        });
        if (hover && inb(hover[0], hover[1])) {
            ctx.strokeStyle = tool === 'inspect' ? 'rgba(255,255,255,0.9)' : '#B58A32'; ctx.lineWidth = 2;
            ctx.strokeRect(hover[0] * cs + 1, hover[1] * cs + oy + 1, cs - 2, cs - 2);
        }
    }

    function updateInfo() {
        if (hover && inb(hover[0], hover[1])) {
            const i = idx(hover[0], hover[1]);
            ui.info.innerHTML = '<b>' + NAMES[type[i]] + '</b> en (' + hover[0] + ',' + hover[1] + '): ' + (S.Tg + heatA[i]).toFixed(1) + ' °C · agua ' + water[i].toFixed(2) + ' · contaminación ' + (type[i] === T.RIVER ? pm[i] / Math.max(water[i], 0.3) : pm[i]).toFixed(2) + ' · basura ' + trash[i].toFixed(2) + (fire[i] > 0 ? ' · 🔥 ardiendo' : '');
        } else if (tool === 'inspect') {
            ui.info.innerHTML = '👆 Pasa el cursor (o toca) el mapa para inspeccionar una celda.';
        } else {
            const t = TOOLINFO[tool];
            ui.info.innerHTML = '<b>' + t[0] + ' ' + t[1] + '</b> — haz clic o arrastra sobre el mapa para construir.';
        }
    }

    function updateUI() {
        const d = Math.floor(S.tick / 24) + 1, h = S.tick % 24;
        ui.clock.textContent = '🕒 Día ' + d + ' · ' + String(h).padStart(2, '0') + ':00';
        const chips = [];
        if (S.rain > 0) chips.push('<em class="b">🌧️ Lluvia</em>');
        if (S.heatLeft > 0) chips.push('<em class="r">🌡️ Ola de calor</em>');
        if (S.strikeLeft > 0) chips.push('<em class="y">🗑️ Paro</em>');
        if (S.burning > 0) chips.push('<em class="r">🔥 ' + S.burning + ' ardiendo</em>');
        if (P.viento !== 'calma') chips.push('<em>💨 ' + P.viento + '</em>');
        ui.hud.innerHTML = chips.join('');
        const lvl = v => v >= 70 ? 'ok' : (v >= 40 ? 'warn' : 'bad');
        const k = (ic, name, v, cls, tip) => '<div class="cl-k ' + cls + '" data-tip="' + tip + '"><span class="ic">' + ic + '</span><div><small>' + name + '</small><b>' + v + '</b></div></div>';
        ui.mon.innerHTML =
            k('🏙️', 'Índice', S.index.toFixed(0) + '<s>/100</s>', lvl(S.index) + ' big', 'Índice de sostenibilidad: resume salud, agua, inundación, calor e incendios. Más alto es mejor; la meta es más de 70.') +
            k('❤️', 'Salud', S.health.toFixed(0) + '%', lvl(S.health), 'Salud promedio de los habitantes (los puntos del mapa). Afectados graves: ' + S.victims + '.') +
            k('💧', 'Agua limpia', S.quality.toFixed(0) + '%', lvl(S.quality), 'Calidad del agua del río. Baja con descargas industriales, basura y escurrimiento sucio.') +
            k('🌊', 'Inundado', S.flood.toFixed(1) + '%', S.flood < 3 ? 'ok' : (S.flood < 10 ? 'warn' : 'bad'), 'Porcentaje del suelo urbano cubierto por agua. Menos es mejor.') +
            k('🌡️', 'Temperatura', S.Tmean.toFixed(0) + ' °C', S.Tmax < 36 ? 'ok' : (S.Tmax < 40 ? 'warn' : 'bad'), 'Temperatura media actual. Máxima en la ciudad: ' + S.Tmax.toFixed(0) + ' °C.') +
            k('🔥', 'Incendios', S.burning + ' · ruinas ' + S.ruins, S.burning === 0 ? 'ok' : 'bad', 'Celdas ardiendo ahora mismo y edificios destruidos acumulados.') +
            k('🗑️', 'Basura', S.trashAvg.toFixed(2), S.trashAvg < 0.2 ? 'ok' : (S.trashAvg < 0.5 ? 'warn' : 'bad'), 'Basura media por celda. Si sube, tapa el drenaje y contamina el agua.') +
            k('💰', 'Presupuesto', '$' + S.budget.toFixed(0), 'money', 'Dinero para construir. Crece mientras la ciudad esté sana.');
        updateGoal(); renderSteps(); renderCoach(); setGoLabel(); updateInfo();
        if (openTab === 'chart') drawChart();
    }
    // al tocar un indicador se muestra su explicación
    ui.mon.addEventListener('click', e => { const c = e.target.closest('[data-tip]'); if (c) toast(c.dataset.tip); });
    ui.mon.addEventListener('mouseover', e => { const c = e.target.closest('[data-tip]'); ui.mon.title = c ? c.dataset.tip : ''; });

    function drawChart() {
        const c = ui.chart, g = c.getContext('2d'), W = c.width, H = c.height;
        g.clearRect(0, 0, W, H);
        g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
        for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(0, H * k / 4); g.lineTo(W, H * k / 4); g.stroke(); }
        const series = [[hist.health, '#5fd38d'], [hist.water, '#4aa3ff'], [hist.flood, '#b58aff'], [hist.heat, '#ff9a4a']];
        for (const [a, col] of series) {
            if (a.length < 2) continue;
            g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
            a.forEach((v, k) => { const x = k / Math.max(a.length - 1, 40) * W, y = H - clamp(v, 0, 100) / 100 * (H - 4) - 2; k ? g.lineTo(x, y) : g.moveTo(x, y); });
            g.stroke();
        }
    }

    // ---------- bucle ----------
    let acc = 0, lastT = 0, visible = false, uiAcc = 0, lastDraw = 0;
    function frame(t) {
        requestAnimationFrame(frame);
        if (!visible || document.hidden) { lastT = t; return; }
        const dt = Math.min(0.25, (t - lastT) / 1000); lastT = t;
        if (running) {
            acc += dt * P.speed;
            let n = 0; while (acc >= 1 && n < 6) { step(); acc -= 1; n++; }
            if (acc > 6) acc = 0;
        }
        uiAcc += dt; if (uiAcc > 0.15) { uiAcc = 0; updateUI(); }
        if (t - lastDraw > (running ? 33 : 120)) { lastDraw = t; draw(t); }
    }
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(es => { visible = es[0].isIntersecting; window.__labActive = visible && es[0].intersectionRatio > 0.5; }, { threshold: [0, 0.5] }).observe(root);
    } else visible = true;

    loadMission('tormenta'); updateLegend(); setTab('build'); updateToolDesc(); updateUI();
    requestAnimationFrame(frame);

    window.CityLab = { step, setup, P, get S() { return S; }, evStorm, evFire, evHeat, evSpill, evStrike, evSponge, setType: (x, y, t) => { type[idx(x, y)] = t; }, get type() { return type; }, COLS, ROWS, T };
})();

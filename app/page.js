"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import JSZip from "jszip";
import "./style.css";

const TZ = "Europe/Rome";
const OHLC_KEYS = ["open", "high", "low", "close"];

function toNum(v) {
  const s = String(v ?? "").trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")) return Number(s.replace(/\./g, "").replace(",", "."));
  if (s.includes(",")) return Number(s.replace(",", "."));
  return Number(s);
}

function findHeader(row, names) {
  const map = {};
  Object.keys(row).forEach(k => map[k.toLowerCase().trim().replace("\ufeff", "")] = k);
  for (const name of names) if (map[name]) return map[name];
  return null;
}

function parseDate(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  if (/^\d{10}$/.test(raw)) return new Date(Number(raw) * 1000);
  if (/^\d{13}$/.test(raw)) return new Date(Number(raw));
  let d = new Date(raw.replace(" ", "T"));
  if (!Number.isNaN(d.getTime())) return d;
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    d = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] || "00"}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function partsIT(d) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(d).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
}

function dayKey(d) {
  const p = partsIT(d);
  return `${p.year}-${p.month}-${p.day}`;
}

function dayLabelFromKey(k) {
  const [y, m, d] = k.split("-");
  return `${d}/${m}/${y}`;
}

function minutesIT(d) {
  const p = partsIT(d);
  return Number(p.hour) * 60 + Number(p.minute);
}

function itDate(d, seconds = true) {
  if (!d) return "-";
  const p = partsIT(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}${seconds ? ":" + p.second : ""}`;
}

function reportDate(d) {
  const s = itDate(d, true);
  const [date, tm] = s.split(" ");
  const [dd, mm, yy] = date.split("/");
  return `${yy}.${mm}.${dd} ${tm}`;
}

function money(v) {
  return Number(v || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\./g, " ");
}

function price(v) {
  return Number(v).toFixed(3);
}

function pnl(side, entry, exit, lot, pointValue) {
  return side === "buy" ? (exit - entry) * lot * pointValue : (entry - exit) * lot * pointValue;
}

function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function setSecond(d, s) { const x = new Date(d); x.setSeconds(Number(s || 0)); return x; }
function parseMaybe(v) { const n = toNum(v); return Number.isNaN(n) ? null : n; }
function inRange(v, min, max) { return (min === null || v >= min) && (max === null || v <= max); }
function downloadBlob(blob, filename) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href); }

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function renderReportBlob(trades, layout, tab, deposit, credit, withdrawal) {
  const totalProfit = trades.reduce((a, t) => a + Number(t.profit || 0), 0);
  const balance = Number(deposit) + Number(credit) - Number(withdrawal) + totalProfit;
  const canvas = document.createElement("canvas");
  canvas.width = 828; canvas.height = 1792;
  const ctx = canvas.getContext("2d");
  const dark = layout === "dark", compact = layout === "compact";
  ctx.fillStyle = dark ? "#080808" : "#ffffff"; ctx.fillRect(0,0,828,1792);
  const blue="#2391f0", red="#e1323c", main=dark?"#fff":"#151515", muted=dark?"#d0d0d0":"#555", grey=dark?"#b0b0b0":"#707070", line=dark?"#2d2d2d":"#e6e6e6";
  if (dark) {
    ctx.fillStyle="#161616"; ctx.strokeStyle="#464646"; roundRect(ctx,35,35,758,82,42,true,true);
    ["Day","Week","Month","Custom"].forEach((t,i)=>{ const x=35+i*758/4; if(t===tab){ctx.fillStyle="#414141";roundRect(ctx,x+8,43,758/4-16,66,36,true,false)} ctx.fillStyle="#fff"; ctx.font="700 32px Arial"; ctx.fillText(t,x+758/8-ctx.measureText(t).width/2,89);});
  } else {
    ctx.fillStyle="#eee"; ctx.strokeStyle="#ddd"; roundRect(ctx,95,24,618,66,8,true,true);
    ["Day","Week","Month","Custom"].forEach((t,i)=>{ const x=95+i*618/4; if(t===tab){ctx.fillStyle="#fff";roundRect(ctx,x+4,28,618/4-8,58,6,true,false)} ctx.fillStyle="#151515"; ctx.font="700 30px Arial"; ctx.fillText(t,x+618/8-ctx.measureText(t).width/2,67);});
  }
  const top=dark?150:118, rowH=compact?96:(dark?106:116), maxRows=compact?11:(dark?10:9);
  trades.slice(0,maxRows).forEach((t,i)=>{ const y=top+i*rowH; ctx.strokeStyle=line; ctx.beginPath(); ctx.moveTo(0,y+rowH-2); ctx.lineTo(828,y+rowH-2); ctx.stroke(); ctx.font="700 32px Arial"; ctx.fillStyle=main; ctx.fillText("XAUUSD, ",20,y+(dark?34:40)); const bw=ctx.measureText("XAUUSD, ").width; ctx.fillStyle=t.side==="buy"?blue:red; ctx.fillText(`${t.side} ${Number(t.lot).toFixed(2)}`,20+bw,y+(dark?34:40)); ctx.font="28px Arial"; ctx.fillStyle=muted; ctx.fillText(`${price(t.entry)} → ${price(t.exit)}`,20,y+(dark?78:86)); ctx.font="700 26px Arial"; const dt=reportDate(t.closeTime); ctx.fillText(dt,808-ctx.measureText(dt).width,y+(dark?42:46)); ctx.font="700 32px Arial"; const pp=money(t.profit); ctx.fillStyle=t.profit>=0?blue:red; ctx.fillText(pp,808-ctx.measureText(pp).width,y+(dark?84:92));});
  const sy=1792-315; ctx.strokeStyle=line; ctx.beginPath(); ctx.moveTo(0,sy); ctx.lineTo(828,sy); ctx.stroke();
  [["Profit:",totalProfit],["Credit:",Number(credit)],["Deposit:",Number(deposit)],["Withdrawal:",Number(withdrawal)],["Balance:",balance]].forEach((r,i)=>{ const y=sy+50+i*40; ctx.font="700 32px Arial"; ctx.fillStyle=grey; ctx.fillText(r[0],20,y); const val=money(r[1]); ctx.fillText(val,798-ctx.measureText(val).width,y);});
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

function MiniChart({ candles, trades }) {
  const visible = candles.slice(-360);
  if (!visible.length) return <div className="empty-chart">Carica un CSV TradingView/OANDA.</div>;
  const W=1200,H=430,L=54,R=20,T=24,B=38;
  const min=Math.min(...visible.map(c=>c.low));
  const max=Math.max(...visible.map(c=>c.high));
  const range=max-min||1;
  const step=(W-L-R)/visible.length;
  const y=v=>T+(max-v)/range*(H-T-B);
  return <svg className="chart" viewBox={`0 0 ${W} ${H}`}>
    <rect x="0" y="0" width={W} height={H} rx="16" fill="#08111d" />
    {visible.map((c,i)=>{const x=L+i*step+step/2; const color=c.close>=c.open?"#089981":"#f23645"; const bodyY=Math.min(y(c.open),y(c.close)); const bodyH=Math.max(2,Math.abs(y(c.close)-y(c.open))); return <g key={c.id}><line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={color}/><rect x={x-Math.max(2,step*.32)} y={bodyY} width={Math.max(3,step*.64)} height={bodyH} fill={color}/></g>})}
    {trades.map((t,i)=>{const oi=visible.findIndex(c=>c.id===t.openCandleId); const ci=visible.findIndex(c=>c.id===t.closeCandleId); if(oi<0||ci<0)return null; const x1=L+oi*step+step/2,x2=L+ci*step+step/2; const color=t.side==="buy"?"#3b82f6":"#ef4444"; return <g key={i}><line x1={x1} y1={y(t.entry)} x2={x2} y2={y(t.exit)} stroke={color} strokeWidth="2"/><circle cx={x1} cy={y(t.entry)} r="5" fill={color}/><circle cx={x2} cy={y(t.exit)} r="5" fill={color}/></g>})}
  </svg>;
}

export default function LucaTradingWeek() {
  const [candles, setCandles] = useState([]);
  const [trades, setTrades] = useState([]);
  const [layout, setLayout] = useState("white");
  const [tab, setTab] = useState("Week");
  const [pointValue, setPointValue] = useState(100);
  const [deposit, setDeposit] = useState(0);
  const [credit, setCredit] = useState(0);
  const [withdrawal, setWithdrawal] = useState(0);
  const [selectedDays, setSelectedDays] = useState([]);
  const [opsPerDay, setOpsPerDay] = useState({});
  const [positivePerDay, setPositivePerDay] = useState(3);
  const [negativePerDay, setNegativePerDay] = useState(0);
  const [lotMin, setLotMin] = useState(0.02);
  const [lotMax, setLotMax] = useState(0.10);
  const [startHour, setStartHour] = useState("");
  const [endHour, setEndHour] = useState("");
  const [entryMin, setEntryMin] = useState("");
  const [entryMax, setEntryMax] = useState("");
  const [exitMin, setExitMin] = useState("");
  const [exitMax, setExitMax] = useState("");
  const [targetMin, setTargetMin] = useState("");
  const [targetMax, setTargetMax] = useState("");

  const totalProfit = useMemo(() => trades.reduce((a,t)=>a+Number(t.profit||0),0), [trades]);
  const days = useMemo(() => Array.from(new Set(candles.map(c=>c.dayKey))).sort(), [candles]);

  function loadCSV(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: res => {
        const rows = res.data.filter(Boolean);
        if (!rows.length) return alert("CSV vuoto");
        const h = {
          time: findHeader(rows[0], ["time","datetime","date","data","timestamp","time utc","time (utc)"]),
          open: findHeader(rows[0], ["open","apertura","otwarcie"]),
          high: findHeader(rows[0], ["high","massimo","max","najwyzszy","najwyższy"]),
          low: findHeader(rows[0], ["low","minimo","min","najnizszy","najniższy"]),
          close: findHeader(rows[0], ["close","chiusura","zamkniecie","zamknięcie"]),
          volume: findHeader(rows[0], ["volume","vol","tick volume"])
        };
        if (!h.time || !h.open || !h.high || !h.low || !h.close) return alert("CSV non valido. Servono colonne time/open/high/low/close.");
        const parsed = rows.map((r, index) => {
          const t = parseDate(r[h.time]);
          return {
            id: `row_${index}`,
            rowIndex: index,
            rawTime: String(r[h.time]),
            time: t,
            dayKey: t ? dayKey(t) : "",
            minute: t ? minutesIT(t) : 0,
            open: toNum(r[h.open]),
            high: toNum(r[h.high]),
            low: toNum(r[h.low]),
            close: toNum(r[h.close]),
            volume: h.volume ? toNum(r[h.volume]) : 0
          };
        }).filter(c => c.time && ![c.open,c.high,c.low,c.close].some(Number.isNaN)).sort((a,b)=>a.time-b.time);
        const foundDays = Array.from(new Set(parsed.map(c=>c.dayKey))).sort();
        setCandles(parsed);
        setSelectedDays(foundDays.slice(-5));
        const nextOps = {};
        foundDays.forEach(d => { nextOps[d] = Number(positivePerDay) + Number(negativePerDay); });
        setOpsPerDay(nextOps);
        setTrades([]);
      }
    });
  }

  function poolForDay(day) {
    const [sh, sm] = startHour ? startHour.split(":").map(Number) : [null, null];
    const [eh, em] = endHour ? endHour.split(":").map(Number) : [null, null];
    const minM = startHour ? sh * 60 + sm : null;
    const maxM = endHour ? eh * 60 + em : null;
    return candles.filter(c => c.dayKey === day && (minM === null || c.minute >= minM) && (maxM === null || c.minute <= maxM));
  }

  function valuesFromCandle(c, min, max) {
    return OHLC_KEYS.map(k => Number(c[k])).filter(v => inRange(v, min, max));
  }

  function makeTrade(day, wantPositive) {
    const pool = poolForDay(day);
    const eMin = parseMaybe(entryMin), eMax = parseMaybe(entryMax), xMin = parseMaybe(exitMin), xMax = parseMaybe(exitMax);
    if (pool.length < 2) return null;
    for (let tries=0; tries<1500; tries++) {
      const a = randInt(0, pool.length - 2);
      const b = randInt(a + 1, pool.length - 1);
      const c1 = pool[a], c2 = pool[b];
      const entries = valuesFromCandle(c1, eMin, eMax);
      const exits = valuesFromCandle(c2, xMin, xMax);
      if (!entries.length || !exits.length) continue;
      const lot = Number(rand(Number(lotMin), Number(lotMax)).toFixed(2));
      const side = Math.random() > 0.5 ? "buy" : "sell";
      const entry = entries[randInt(0, entries.length - 1)];
      const exitCandidates = exits.filter(x => wantPositive ? (side === "buy" ? x > entry : x < entry) : (side === "buy" ? x < entry : x > entry));
      if (!exitCandidates.length) continue;
      const exit = exitCandidates[randInt(0, exitCandidates.length - 1)];
      const profit = pnl(side, entry, exit, lot, Number(pointValue));
      if (wantPositive && profit <= 0) continue;
      if (!wantPositive && profit >= 0) continue;
      return {
        side, lot,
        openCandleId: c1.id,
        closeCandleId: c2.id,
        openTime: setSecond(c1.time, randInt(0,59)),
        closeTime: setSecond(c2.time, randInt(0,59)),
        entry: Number(entry),
        exit: Number(exit),
        profit: Number(profit.toFixed(2))
      };
    }
    return null;
  }

  function generateWeek() {
    if (!selectedDays.length) return alert("Seleziona almeno un giorno.");
    const tMin = parseMaybe(targetMin), tMax = parseMaybe(targetMax);
    let best = null;
    for (let attempt=0; attempt<600; attempt++) {
      const all = [];
      let failed = false;
      for (const day of selectedDays) {
        const totalOps = Number(opsPerDay[day] || (Number(positivePerDay) + Number(negativePerDay)));
        const neg = Math.min(Number(negativePerDay), totalOps);
        const pos = Math.max(0, totalOps - neg);
        for (let i=0; i<pos; i++) { const tr = makeTrade(day, true); if (!tr) failed = true; else all.push(tr); }
        for (let i=0; i<neg; i++) { const tr = makeTrade(day, false); if (!tr) failed = true; else all.push(tr); }
        if (failed) break;
      }
      if (failed) continue;
      all.sort((a,b)=>a.closeTime-b.closeTime);
      const total = all.reduce((a,t)=>a+t.profit,0);
      if ((tMin === null || total >= tMin) && (tMax === null || total <= tMax)) { best = all; break; }
      if (!best) best = all;
    }
    if (!best) return alert("Non sono riuscito a generare operazioni con questi vincoli. Allarga range o orari.");
    setTrades(best);
  }

  function updateTrade(i, field, value) {
    setTrades(prev => prev.map((t, idx) => {
      if (idx !== i) return t;
      const nt = { ...t };
      if (field === "side") nt.side = value;
      else if (["lot","entry","exit"].includes(field)) nt[field] = toNum(value);
      nt.profit = Number(pnl(nt.side, Number(nt.entry), Number(nt.exit), Number(nt.lot), Number(pointValue)).toFixed(2));
      return nt;
    }));
  }

  async function screenshot() {
    const blob = await renderReportBlob(trades, layout, tab, deposit, credit, withdrawal);
    downloadBlob(blob, "luca_trading_week_report.png");
  }

  async function downloadZip() {
    if (!trades.length) return alert("Genera prima il report settimanale.");
    const zip = new JSZip();
    const blob = await renderReportBlob(trades, layout, tab, deposit, credit, withdrawal);
    zip.file("report_settimanale.png", blob);
    const csv = ["side,lot,open_time,entry,close_time,exit,profit"].concat(trades.map(t => `${t.side},${Number(t.lot).toFixed(2)},${itDate(t.openTime)},${price(t.entry)},${itDate(t.closeTime)},${price(t.exit)},${Number(t.profit).toFixed(2)}`)).join("\n");
    zip.file("operazioni_settimanali.csv", csv);
    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, "luca_trading_week.zip");
  }

  return (
    <main className="page">
      <header className="top"><div><h1>🥇 Luca Trading Week</h1><p>Report settimanale: scegli più giorni, genera operazioni per ogni giorno e mostra solo il totale.</p></div><button className="primary" onClick={screenshot}>Scarica screen</button></header>
      <div className="layout">
        <aside className="side">
          <h2>1. Carica CSV</h2><input type="file" accept=".csv" onChange={e => e.target.files?.[0] && loadCSV(e.target.files[0])}/><p className="hint">TradingView/OANDA XAUUSD, 1m, timestamp UNIX.</p>
          <h2>Layout</h2><select value={layout} onChange={e=>setLayout(e.target.value)}><option value="white">Mobile bianco classico</option><option value="compact">Mobile bianco compatto</option><option value="dark">Mobile nero</option></select><select value={tab} onChange={e=>setTab(e.target.value)}><option>Day</option><option>Week</option><option>Month</option><option>Custom</option></select>
          <h2>Account</h2><label>Valore punto 1 lotto</label><input type="number" value={pointValue} onChange={e=>setPointValue(e.target.value)}/><label>Deposit</label><input type="number" value={deposit} onChange={e=>setDeposit(e.target.value)}/><label>Credit</label><input type="number" value={credit} onChange={e=>setCredit(e.target.value)}/><label>Withdrawal</label><input type="number" value={withdrawal} onChange={e=>setWithdrawal(e.target.value)}/>
          <h2>Giorni</h2>{days.map(d => <label className="check" key={d}><input type="checkbox" checked={selectedDays.includes(d)} onChange={e=>setSelectedDays(e.target.checked ? [...selectedDays,d].sort() : selectedDays.filter(x=>x!==d))}/>{dayLabelFromKey(d)}<input className="small" type="number" value={opsPerDay[d] ?? (Number(positivePerDay)+Number(negativePerDay))} onChange={e=>setOpsPerDay({...opsPerDay, [d]: e.target.value})}/></label>)}
          <h2>Vincoli operazioni</h2><label>Positive base/giorno</label><input type="number" value={positivePerDay} onChange={e=>setPositivePerDay(e.target.value)}/><label>Negative base/giorno</label><input type="number" value={negativePerDay} onChange={e=>setNegativePerDay(e.target.value)}/><label>Lotto min</label><input type="number" step="0.01" value={lotMin} onChange={e=>setLotMin(e.target.value)}/><label>Lotto max</label><input type="number" step="0.01" value={lotMax} onChange={e=>setLotMax(e.target.value)}/><label>Ora inizio libera se vuoto</label><input placeholder="09:35" value={startHour} onChange={e=>setStartHour(e.target.value)}/><label>Ora fine libera se vuoto</label><input placeholder="10:55" value={endHour} onChange={e=>setEndHour(e.target.value)}/>
          <h2>Range prezzi opzionale</h2><label>Apertura min</label><input placeholder="libero" value={entryMin} onChange={e=>setEntryMin(e.target.value)}/><label>Apertura max</label><input placeholder="libero" value={entryMax} onChange={e=>setEntryMax(e.target.value)}/><label>Chiusura min</label><input placeholder="libero" value={exitMin} onChange={e=>setExitMin(e.target.value)}/><label>Chiusura max</label><input placeholder="libero" value={exitMax} onChange={e=>setExitMax(e.target.value)}/><label>Profitto totale min</label><input placeholder="libero" value={targetMin} onChange={e=>setTargetMin(e.target.value)}/><label>Profitto totale max</label><input placeholder="libero" value={targetMax} onChange={e=>setTargetMax(e.target.value)}/>
          <button className="primary full" onClick={generateWeek}>Genera settimanale</button><button className="full" onClick={downloadZip}>Scarica ZIP</button>
        </aside>
        <section className="content">
          <div className="cards"><div><span>Candele</span><b>{candles.length}</b></div><div><span>Giorni selezionati</span><b>{selectedDays.length}</b></div><div><span>Operazioni</span><b>{trades.length}</b></div><div><span>Totale</span><b className={totalProfit>=0?"pos":"neg"}>{money(totalProfit)}</b></div></div>
          <MiniChart candles={candles.filter(c=>selectedDays.includes(c.dayKey))} trades={trades}/>
          <table><thead><tr><th>#</th><th>Dir</th><th>Lotto</th><th>Apertura</th><th>Prezzo</th><th>Chiusura</th><th>Prezzo</th><th>P/L</th><th></th></tr></thead><tbody>{trades.map((t,i)=><tr key={i}><td>{i+1}</td><td><select value={t.side} onChange={e=>updateTrade(i,"side",e.target.value)}><option value="buy">BUY</option><option value="sell">SELL</option></select></td><td><input value={t.lot} onChange={e=>updateTrade(i,"lot",e.target.value)}/></td><td>{itDate(t.openTime)}</td><td><input value={price(t.entry)} onChange={e=>updateTrade(i,"entry",e.target.value)}/></td><td>{itDate(t.closeTime)}</td><td><input value={price(t.exit)} onChange={e=>updateTrade(i,"exit",e.target.value)}/></td><td className={t.profit>=0?"pos":"neg"}>{money(t.profit)}</td><td><button onClick={()=>setTrades(trades.filter((_,x)=>x!==i))}>×</button></td></tr>)}</tbody></table>
        </section>
      </div>
    </main>
  );
}

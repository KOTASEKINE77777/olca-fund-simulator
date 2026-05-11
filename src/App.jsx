import { useState, useEffect, useRef, useCallback } from "react";

const SCENARIOS = [
  { key: "bull", label: "強気", sub: "市場活況・希少性上昇", color: "#1a9e65", bg: "rgba(26,158,101,0.08)", border: "rgba(26,158,101,0.25)" },
  { key: "base", label: "中立", sub: "過去平均並みの推移",   color: "#3a7fd4", bg: "rgba(58,127,212,0.08)",  border: "rgba(58,127,212,0.25)" },
  { key: "bear", label: "弱気", sub: "景気低迷・市場縮小",   color: "#c94040", bg: "rgba(201,64,64,0.08)",   border: "rgba(201,64,64,0.25)" },
];
const LINE_COLORS = ["#1a9e65","#3a7fd4","#c94040","#d4941a","#8b5cf6","#0e9fa8"];

const DEFAULT_VEHICLES = [
  { name:"Ferrari F40",      buy:80000,  storage:120, maint:200, insurance:50  },
  { name:"Ferrari F50",      buy:100000, storage:150, maint:250, insurance:60  },
  { name:"LaFerrari",        buy:50000,  storage:120, maint:200, insurance:40  },
  { name:"Ferrari Enzo",     buy:80000,  storage:150, maint:280, insurance:55  },
];
const DEFAULT_RATES = { bull:[13,14,18,15], base:[10,11,14,12], bear:[2,3,4,3] };

function fmtOku(man) {
  const o = man / 10000;
  if (o >= 100) return Math.round(o) + "億円";
  if (o >= 10)  return o.toFixed(1) + "億円";
  return o.toFixed(2) + "億円";
}
function fmtMan(man) { return Math.round(man).toLocaleString() + "万円"; }

function calcIRR(cfs) {
  let lo = -0.99, hi = 5, irr = null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    let npv = 0;
    cfs.forEach((cf, t) => npv += cf / Math.pow(1 + mid, t));
    if (Math.abs(npv) < 0.1) { irr = mid; break; }
    npv > 0 ? lo = mid : hi = mid;
  }
  return irr ?? (lo + hi) / 2;
}

function calcScenario(vehicles, rates, scKey, years, mgmtRate, carryRate) {
  let totalBuy = 0, totalSell = 0, totalRunning = 0;
  vehicles.forEach((v, i) => {
    const r = (rates[scKey][i] ?? 0) / 100;
    totalBuy     += v.buy;
    totalSell    += v.buy * Math.pow(1 + r, years);
    totalRunning += (v.storage + v.maint + v.insurance) * years;
  });
  const mgmtFee     = totalBuy * mgmtRate * years;
  const gross       = totalSell - totalBuy - totalRunning - mgmtFee;
  const carry       = Math.max(0, gross) * carryRate;
  const investorP   = gross - carry;
  const operatorFee = mgmtFee + carry;
  const annualR     = vehicles.reduce((s,v) => s + v.storage + v.maint + v.insurance, 0);
  const cfs = [-totalBuy, ...Array(years-1).fill(-(annualR + totalBuy * mgmtRate)), totalSell - totalRunning - mgmtFee - carry];
  let irr = null;
  try { irr = calcIRR(cfs); } catch(e) {}
  return { totalBuy, totalSell, totalRunning, mgmtFee, carry, operatorFee, investorProfit: investorP, irr };
}

function SparkChart({ vehicles, rates, scKey, years }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, W, H);
    const pts = years + 1;
    const allSeries = vehicles.map((v, i) => {
      const r = (rates[scKey][i] ?? 0) / 100;
      return Array.from({length: pts}, (_, t) => Math.round(v.buy * Math.pow(1 + r, t)));
    });
    const allVals = allSeries.flat();
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);
    const pad = { t: 10, r: 10, b: 24, l: 46 };
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
    ctx.strokeStyle = "rgba(128,128,128,0.1)";
    ctx.lineWidth = 0.5;
    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const y = pad.t + cH * (1 - f);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke();
      const val = minV + (maxV - minV) * f;
      ctx.fillStyle = "rgba(128,128,128,0.6)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(Math.round(val / 10000) + "億", pad.l - 4, y + 3);
    });
    ctx.fillStyle = "rgba(128,128,128,0.6)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    const step = Math.ceil(pts / 6);
    for (let i = 0; i < pts; i += step) {
      const x = pad.l + (i / (pts - 1)) * cW;
      ctx.fillText(i + "年", x, H - 4);
    }
    allSeries.forEach((series, si) => {
      ctx.beginPath();
      series.forEach((val, t) => {
        const x = pad.l + (t / (pts - 1)) * cW;
        const y = pad.t + cH * (1 - (val - minV) / (maxV - minV || 1));
        t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = LINE_COLORS[si % LINE_COLORS.length];
      ctx.lineWidth = 2;
      ctx.stroke();
      const lastX = pad.l + cW;
      const lastY = pad.t + cH * (1 - (series[series.length-1] - minV) / (maxV - minV || 1));
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
      ctx.fillStyle = LINE_COLORS[si % LINE_COLORS.length];
      ctx.fill();
    });
  }, [vehicles, rates, scKey, years]);
  return <canvas ref={canvasRef} style={{width:"100%", height:"100%"}} />;
}

export default function FundSimulator() {
  const [years,   setYears]   = useState(10);
  const [mgmtFee, setMgmtFee] = useState(1.0);
  const [carry,   setCarry]   = useState(20);
  const [vehicles, setVehicles] = useState(DEFAULT_VEHICLES.map(v => ({...v})));
  const [rates, setRates] = useState({
    bull: [...DEFAULT_RATES.bull],
    base: [...DEFAULT_RATES.base],
    bear: [...DEFAULT_RATES.bear],
  });
  const [activeChart, setActiveChart] = useState("bull");

  const ensureRates = useCallback((newVehicles, prevRates) => {
    const n = newVehicles.length;
    const next = {};
    SCENARIOS.forEach(sc => {
      const arr = [...(prevRates[sc.key] || [])];
      while (arr.length < n) arr.push(sc.key==="bull"?8:sc.key==="base"?5:0);
      next[sc.key] = arr.slice(0, n);
    });
    return next;
  }, []);

  const addVehicle = () => {
    const newV = [...vehicles, { name:"新規車両", buy:10000, storage:80, maint:100, insurance:40 }];
    setVehicles(newV);
    setRates(prev => ensureRates(newV, prev));
  };

  const removeVehicle = (i) => {
    if (vehicles.length <= 1) return;
    const newV = vehicles.filter((_, idx) => idx !== i);
    const newR = {};
    SCENARIOS.forEach(sc => { newR[sc.key] = rates[sc.key].filter((_, idx) => idx !== i); });
    setVehicles(newV);
    setRates(newR);
  };

  const updateVehicle = (i, field, val) => {
    setVehicles(prev => prev.map((v, idx) => idx===i ? {...v, [field]: field==="name"?val:Number(val)} : v));
  };
  const updateRate = (sc, i, val) => {
    setRates(prev => ({ ...prev, [sc]: prev[sc].map((r, idx) => idx===i ? Number(val) : r) }));
  };

  const total = vehicles.reduce((s,v) => s+v.buy, 0);
  const results = {};
  SCENARIOS.forEach(sc => {
    results[sc.key] = calcScenario(vehicles, rates, sc.key, years, mgmtFee/100, carry/100);
  });
  const irrs    = SCENARIOS.map(sc => (results[sc.key].irr ?? 0) * 100);
  const profits  = SCENARIOS.map(sc => results[sc.key].investorProfit);
  const maxIRR   = Math.max(...irrs.map(Math.abs), 0.1);
  const maxProfit = Math.max(...profits.map(Math.abs), 0.1);

  const s = {
    wrap:     { fontFamily:"var(--font-sans,sans-serif)", padding:"20px 16px", maxWidth:900, margin:"0 auto", color:"var(--color-text-primary)" },
    header:   { marginBottom:20 },
    h1:       { fontSize:18, fontWeight:500, letterSpacing:"-0.01em", margin:0, color:"var(--color-text-primary)" },
    sub:      { fontSize:11, color:"var(--color-text-tertiary)", marginTop:3 },
    card:     { background:"var(--color-background-secondary)", borderRadius:"var(--border-radius-lg)", padding:"14px 16px", border:"0.5px solid var(--color-border-tertiary)" },
    label10:  { fontSize:10, color:"var(--color-text-tertiary)", marginBottom:4 },
    input:    { width:"100%", padding:"6px 8px", fontSize:12, background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"var(--border-radius-md)", color:"var(--color-text-primary)", boxSizing:"border-box", fontFamily:"inherit" },
    secLabel: { fontSize:10, fontWeight:500, color:"var(--color-text-tertiary)", letterSpacing:"0.05em", textTransform:"uppercase", margin:"20px 0 10px", display:"flex", alignItems:"center", gap:8 },
    secLine:  { flex:1, height:"0.5px", background:"var(--color-border-tertiary)" },
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.h1}>OLCA CLASSIC CAR FUND — 投資シミュレーター</div>
        <div style={s.sub}>投資対象候補車両リスト（取得価格・コスト・シナリオ別リターンを試算）</div>
      </div>
      <div style={{...s.card, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:4}}>
        {[
          {label:"運用期間（年）", val:years,   set:setYears,   min:3,  max:20, step:1},
          {label:"管理報酬（%）", val:mgmtFee, set:setMgmtFee, min:0,  max:3,  step:0.1},
          {label:"成功報酬（%）", val:carry,   set:setCarry,   min:0,  max:30, step:1},
        ].map(p => (
          <div key={p.label}>
            <div style={s.label10}>{p.label}</div>
            <div style={{display:"flex", alignItems:"center", gap:8}}>
              <input type="range" min={p.min} max={p.max} step={p.step} value={p.val}
                onChange={e=>p.set(Number(e.target.value))} style={{flex:1}}/>
              <span style={{fontSize:13, fontWeight:500, minWidth:36, textAlign:"right", color:"var(--color-text-primary)"}}>{p.val}{p.label.includes("年")?"年":"%"}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{fontSize:10, color:"var(--color-text-tertiary)", marginBottom:4, textAlign:"right"}}>
        ファンドサイズ合計: <strong style={{color:"var(--color-text-primary)"}}>{fmtOku(total)}</strong>（{fmtMan(total)}）
      </div>
      <div style={s.secLabel}>投資対象候補車両リスト<div style={s.secLine}/></div>
      <div style={{display:"flex", flexDirection:"column", gap:8}}>
        {vehicles.map((v,i) => {
          const share = Math.round(v.buy / (total||1) * 100);
          const col = LINE_COLORS[i%LINE_COLORS.length];
          return (
            <div key={i} style={s.card}>
              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10}}>
                <input value={v.name} onChange={e=>updateVehicle(i,"name",e.target.value)}
                  style={{fontSize:13, fontWeight:500, background:"transparent", border:"none", outline:"none", color:"var(--color-text-primary)", width:200, fontFamily:"inherit"}}/>
                <button onClick={()=>removeVehicle(i)}
                  style={{background:"none", border:"none", cursor:"pointer", color:"var(--color-text-tertiary)", fontSize:15, padding:"2px 6px", borderRadius:4, lineHeight:1}}>×</button>
              </div>
              <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8}}>
                {[
                  {label:"取得額（万円）",     field:"buy",       note:fmtOku(v.buy), type:"number"},
                  {label:"年間保管料（万円）",  field:"storage",   type:"number"},
                  {label:"年間メンテ（万円）",  field:"maint",     type:"number"},
                  {label:"年間保険料（万円）",  field:"insurance", type:"number"},
                ].map(f => (
                  <div key={f.field}>
                    <div style={s.label10}>{f.label}</div>
                    <input type={f.type} value={v[f.field]} onChange={e=>updateVehicle(i,f.field,e.target.value)} style={s.input}/>
                    {f.note && <div style={{fontSize:10, color:"var(--color-text-tertiary)", textAlign:"right", marginTop:2}}>{f.note}</div>}
                  </div>
                ))}
              </div>
              <div style={{marginTop:8}}>
                <div style={{height:2, background:"var(--color-background-secondary,#eee)", borderRadius:1}}>
                  <div style={{height:"100%", width:share+"%", background:col, borderRadius:1, transition:"width 0.3s"}}/>
                </div>
                <div style={{fontSize:10, color:col, textAlign:"right", marginTop:3}}>ファンド内比率 {share}%</div>
              </div>
            </div>
          );
        })}
        <button onClick={addVehicle} style={{width:"100%", padding:10, background:"transparent", border:"0.5px dashed var(--color-border-secondary)", borderRadius:"var(--border-radius-md)", color:"var(--color-text-tertiary)", fontSize:12, cursor:"pointer", fontFamily:"inherit"}}>
          ＋ 車両を追加
        </button>
      </div>
      <div style={s.secLabel}>シナリオ別 年間価格上昇率<div style={s.secLine}/></div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10}}>
        {SCENARIOS.map(sc => (
          <div key={sc.key} style={{borderRadius:"var(--border-radius-md)", padding:"12px 14px", border:"0.5px solid var(--color-border-tertiary)", background:sc.bg}}>
            <div style={{fontSize:10, fontWeight:500, color:sc.color, marginBottom:10}}>{sc.label}シナリオ</div>
            {vehicles.map((v,i) => (
              <div key={i} style={{marginBottom:8}}>
                <div style={{display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3}}>
                  <span style={{color:"var(--color-text-secondary)", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis", maxWidth:90}}>{v.name}</span>
                  <span style={{fontWeight:500, color:sc.color}}>{rates[sc.key][i]}%</span>
                </div>
                <input type="range" min={-5} max={30} step={0.5} value={rates[sc.key][i]}
                  onChange={e=>updateRate(sc.key,i,e.target.value)} style={{width:"100%"}}/>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={s.secLabel}>シナリオ比較<div style={s.secLine}/></div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10}}>
        {SCENARIOS.map(sc => {
          const r = results[sc.key];
          const irrStr = r.irr !== null && isFinite(r.irr) ? (r.irr*100).toFixed(1)+"%" : "—";
          const irrCol = r.irr >= 0 ? "var(--color-text-success)" : "var(--color-text-danger)";
          const profCol = r.investorProfit >= 0 ? "var(--color-text-success)" : "var(--color-text-danger)";
          return (
            <div key={sc.key} style={{borderRadius:"var(--border-radius-lg)", border:`0.5px solid ${sc.border}`, overflow:"hidden"}}>
              <div style={{padding:"10px 14px", background:sc.bg}}>
                <div style={{fontSize:13, fontWeight:500, color:sc.color}}>{sc.label}</div>
                <div style={{fontSize:10, color:"var(--color-text-tertiary)", marginTop:1}}>{sc.sub}</div>
              </div>
              <div style={{padding:"12px 14px", background:"var(--color-background-primary)"}}>
                {[
                  {label:"投資家 IRR（年率）", val:irrStr, col:irrCol},
                  {label:"投資家手取り利益",   val:fmtMan(r.investorProfit), col:profCol},
                ].map(m => (
                  <div key={m.label} style={{marginBottom:10}}>
                    <div style={{fontSize:10, color:"var(--color-text-tertiary)", marginBottom:2}}>{m.label}</div>
                    <div style={{fontSize:20, fontWeight:300, letterSpacing:"-0.02em", color:m.col}}>{m.val}</div>
                  </div>
                ))}
                <div style={{height:"0.5px", background:"var(--color-border-tertiary)", margin:"8px 0"}}/>
                {[
                  ["売却総額",      fmtMan(r.totalSell)],
                  ["運営コスト",    fmtMan(r.totalRunning)],
                  ["管理費＋Carry", fmtMan(r.operatorFee)],
                  ["ファンドサイズ", fmtMan(r.totalBuy)],
                ].map(([l,v]) => (
                  <div key={l} style={{display:"flex", justifyContent:"space-between", marginBottom:4}}>
                    <span style={{fontSize:10, color:"var(--color-text-tertiary)"}}>{l}</span>
                    <span style={{fontSize:10, fontWeight:500, color:"var(--color-text-secondary)"}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={s.secLabel}>IRR 比較（年率）<div style={s.secLine}/></div>
      <div style={{display:"flex", flexDirection:"column", gap:7}}>
        {SCENARIOS.map((sc,si) => {
          const v = irrs[si], w = Math.round(Math.abs(v)/maxIRR*100);
          return (
            <div key={sc.key} style={{display:"flex", alignItems:"center", gap:8}}>
              <span style={{fontSize:11, color:"var(--color-text-secondary)", minWidth:40}}>{sc.label}</span>
              <div style={{flex:1, height:14, background:"var(--color-background-secondary)", borderRadius:3, overflow:"hidden"}}>
                <div style={{height:"100%", width:w+"%", background:sc.color, borderRadius:3, transition:"width 0.4s"}}/>
              </div>
              <span style={{fontSize:11, fontWeight:500, minWidth:100, textAlign:"right", color:sc.color}}>{v.toFixed(1)}% / 年</span>
            </div>
          );
        })}
      </div>
      <div style={s.secLabel}>投資家手取り利益 比較<div style={s.secLine}/></div>
      <div style={{display:"flex", flexDirection:"column", gap:7}}>
        {SCENARIOS.map((sc,si) => {
          const v = profits[si], w = Math.round(Math.abs(v)/maxProfit*100);
          const col = v >= 0 ? sc.color : "#c94040";
          return (
            <div key={sc.key} style={{display:"flex", alignItems:"center", gap:8}}>
              <span style={{fontSize:11, color:"var(--color-text-secondary)", minWidth:40}}>{sc.label}</span>
              <div style={{flex:1, height:14, background:"var(--color-background-secondary)", borderRadius:3, overflow:"hidden"}}>
                <div style={{height:"100%", width:w+"%", background:col, borderRadius:3, transition:"width 0.4s"}}/>
              </div>
              <span style={{fontSize:11, fontWeight:500, minWidth:100, textAlign:"right", color:col}}>{fmtMan(v)}</span>
            </div>
          );
        })}
      </div>
      <div style={s.secLabel}>価格推移チャート<div style={s.secLine}/></div>
      <div style={{display:"flex", gap:6, marginBottom:10}}>
        {SCENARIOS.map(sc => (
          <button key={sc.key} onClick={()=>setActiveChart(sc.key)}
            style={{padding:"4px 12px", fontSize:11, borderRadius:"var(--border-radius-md)", cursor:"pointer", border:`0.5px solid ${activeChart===sc.key?sc.border:"var(--color-border-secondary)"}`, background:activeChart===sc.key?sc.bg:"transparent", color:activeChart===sc.key?sc.color:"var(--color-text-tertiary)", fontWeight:activeChart===sc.key?500:400, fontFamily:"inherit"}}>
            {sc.label}
          </button>
        ))}
        <div style={{display:"flex", alignItems:"center", gap:12, marginLeft:"auto"}}>
          {vehicles.map((v,i) => (
            <div key={i} style={{display:"flex", alignItems:"center", gap:4}}>
              <div style={{width:10, height:2, background:LINE_COLORS[i%LINE_COLORS.length], borderRadius:1}}/>
              <span style={{fontSize:10, color:"var(--color-text-tertiary)", whiteSpace:"nowrap"}}>{v.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{height:200}}>
        <SparkChart vehicles={vehicles} rates={rates} scKey={activeChart} years={years}/>
      </div>
    </div>
  );
}

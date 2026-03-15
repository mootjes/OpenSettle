import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";

const uid = () => Math.random().toString(36).slice(2, 10);
const cur = (n) => new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(n);

// ─── URL-based state: encode/decode group data in URL hash ───
function compressToUrl(group) {
  try {
    const json = JSON.stringify(group);
    const bytes = new TextEncoder().encode(json);
    // Use base64url encoding (URL-safe)
    const base64 = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return base64;
  } catch {
    return null;
  }
}

function decompressFromUrl(encoded) {
  try {
    // Restore standard base64 from URL-safe variant
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getGroupFromHash() {
  const hash = window.location.hash.slice(1); // remove #
  if (!hash) return null;
  // Check if it starts with "d=" (data prefix)
  if (hash.startsWith("d=")) {
    return decompressFromUrl(hash.slice(2));
  }
  return null;
}

function setGroupToHash(group) {
  const encoded = compressToUrl(group);
  if (encoded) {
    const url = `${window.location.origin}${window.location.pathname}#d=${encoded}`;
    // Use replaceState to avoid filling browser history on every edit
    window.history.replaceState(null, "", url);
    return url;
  }
  return null;
}

function getShareUrl(group) {
  const encoded = compressToUrl(group);
  if (encoded) {
    return `${window.location.origin}${window.location.pathname}#d=${encoded}`;
  }
  return null;
}

function simplifyDebts(balances) {
  const d = [], c = [];
  Object.entries(balances).forEach(([name, bal]) => {
    if (bal < -0.01) d.push({ name, amount: -bal });
    else if (bal > 0.01) c.push({ name, amount: bal });
  });
  d.sort((a, b) => b.amount - a.amount);
  c.sort((a, b) => b.amount - a.amount);
  const r = [];
  let i = 0, j = 0;
  while (i < d.length && j < c.length) {
    const a = Math.min(d[i].amount, c[j].amount);
    if (a > 0.01) r.push({ from: d[i].name, to: c[j].name, amount: Math.round(a * 100) / 100 });
    d[i].amount -= a; c[j].amount -= a;
    if (d[i].amount < 0.01) i++;
    if (c[j].amount < 0.01) j++;
  }
  return r;
}

// ─── Icons ───
const Ico = {
  plus: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="9" y1="3" x2="9" y2="15"/><line x1="3" y1="9" x2="15" y2="9"/></svg>,
  trash: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1m2 0v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4h10z"/></svg>,
  arrow: <svg width="20" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 7h18m-5-5 5 5-5 5"/></svg>,
  check: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5 6.5 12 13 4"/></svg>,
  users: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="6" r="3"/><path d="M2 17c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="15" cy="6" r="2"/><path d="M16 11c2 .5 3.5 2.5 3.5 5"/></svg>,
  receipt: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 2h12v16l-2-1.5L12 18l-2-1.5L8 18l-2-1.5L4 18V2z"/><line x1="7" y1="7" x2="13" y2="7"/><line x1="7" y1="11" x2="11" y2="11"/></svg>,
  scale: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v16M6 6 2 10h8zm8 0 4 4h-8z"/><line x1="4" y1="18" x2="16" y2="18"/></svg>,
  edit: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M8.5 2.5l3 3L4 13H1v-3z"/></svg>,
  pen: <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M7 1.5l3.5 3.5L3.5 12H0V8.5z"/></svg>,
  share: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="3" r="2.5"/><circle cx="12" cy="13" r="2.5"/><circle cx="4" cy="8" r="2.5"/><path d="M6.3 6.8l3.4-2.6M6.3 9.2l3.4 2.6"/></svg>,
  link: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a3 3 0 004.2.4l2-2a3 3 0 00-4.2-4.2L6.8 3.4"/><path d="M8 6a3 3 0 00-4.2-.4l-2 2a3 3 0 004.2 4.2l1.2-1.2"/></svg>,
  reset: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v5h5"/><path d="M3.5 10A6 6 0 1 0 4 4L1 7"/></svg>,
};

function Chip({ label, selected, onClick, small }) {
  return <button onClick={onClick} style={{ padding: small ? "4px 10px" : "6px 14px", borderRadius: 100, border: selected ? "2px solid #1a1a2e" : "1.5px solid #d0d0d8", background: selected ? "#1a1a2e" : "transparent", color: selected ? "#fff" : "#555", fontSize: small ? 12 : 13, fontFamily: "'DM Sans', sans-serif", fontWeight: selected ? 600 : 500, cursor: "pointer", transition: "all .2s", whiteSpace: "nowrap" }}>{label}</button>;
}

/* ═══════ STEP 1: GROUP ═══════ */
function GroupSetup({ group, setGroup, onNext }) {
  const [name, setName] = useState("");
  const [eId, setEId] = useState(null);
  const [eName, setEName] = useState("");
  const add = () => { const t = name.trim(); if (!t || group.participants.find(p => p.name.toLowerCase() === t.toLowerCase())) return; setGroup(g => ({ ...g, participants: [...g.participants, { id: uid(), name: t }] })); setName(""); };
  const rm = id => setGroup(g => ({ ...g, participants: g.participants.filter(p => p.id !== id) }));
  const startE = p => { setEId(p.id); setEName(p.name); };
  const saveE = () => { const t = eName.trim(); if (!t || group.participants.find(p => p.id !== eId && p.name.toLowerCase() === t.toLowerCase())) { setEId(null); return; } setGroup(g => ({ ...g, participants: g.participants.map(p => p.id === eId ? { ...p, name: t } : p) })); setEId(null); };
  return (
    <div className="fi" style={{ maxWidth: 480, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <label style={S.label}>Group name</label>
        <input style={S.input} placeholder="e.g. Trip to Barcelona" value={group.name} onChange={e => setGroup(g => ({ ...g, name: e.target.value }))} />
      </div>
      <label style={S.label}>Participants</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input style={{ ...S.input, flex: 1, marginBottom: 0 }} placeholder="Name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
        <button onClick={add} style={S.btnP}>{Ico.plus} Add</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, minHeight: 40 }}>
        {group.participants.map((p, i) => (
          <div key={p.id} className="fi" style={{ ...S.tag, animationDelay: `${i * 60}ms` }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: `hsl(${(i * 67) % 360}, 50%, 88%)`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#333", marginRight: 6 }}>{p.name[0].toUpperCase()}</span>
            {eId === p.id ? (
              <input autoFocus value={eName} onChange={e => setEName(e.target.value)} onBlur={saveE} onKeyDown={e => { if (e.key === "Enter") saveE(); if (e.key === "Escape") setEId(null); }}
                style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans',sans-serif", width: Math.max(40, eName.length * 8 + 16), borderBottom: "1.5px solid #1a1a2e", padding: "0 2px" }} />
            ) : (<>
              <span style={{ cursor: "pointer" }} onClick={() => startE(p)} title="Click to rename">{p.name}</span>
              <button onClick={() => startE(p)} style={{ ...S.tagX, color: "#999", marginLeft: 2, fontSize: 12 }} title="Rename">{Ico.pen}</button>
            </>)}
            <button onClick={() => rm(p.id)} style={S.tagX}>&times;</button>
          </div>
        ))}
      </div>
      {group.participants.length === 0 && <p style={{ color: "#aaa", fontSize: 13, textAlign: "center", marginTop: 24, fontStyle: "italic" }}>Add at least 2 participants to get started</p>}
      <button disabled={group.participants.length < 2 || !group.name.trim()} onClick={onNext} style={{ ...S.btnL, marginTop: 40, opacity: group.participants.length < 2 || !group.name.trim() ? 0.4 : 1 }}>Continue to expenses →</button>
    </div>
  );
}

/* ═══════ STEP 2: EXPENSES ═══════ */
function Expenses({ group, setGroup, onNext, onBack }) {
  const [show, setShow] = useState(false);
  const [eId, setEId] = useState(null);
  const [desc, setDesc] = useState("");
  const [amt, setAmt] = useState("");
  const [cons, setCons] = useState({});
  const [sMode, setSMode] = useState("equal");
  const [cSplits, setCSplits] = useState({});
  const [pMode, setPMode] = useState("single");
  const [sPayer, setSPayer] = useState("");
  const [mpSel, setMpSel] = useState({});
  const [pAmts, setPAmts] = useState({});
  const [manE, setManE] = useState({});
  const [manSplitE, setManSplitE] = useState({});
  const total = parseFloat(amt) || 0;

  useEffect(() => {
    if (pMode !== "multi") return;
    const ids = Object.keys(mpSel).filter(id => mpSel[id]);
    if (!ids.length || total <= 0 || ids.some(id => manE[id])) return;
    const sh = Math.round((total / ids.length) * 100) / 100;
    const n = {};
    ids.forEach((id, i) => { n[id] = i === ids.length - 1 ? (Math.round((total - sh * (ids.length - 1)) * 100) / 100).toString() : sh.toString(); });
    setPAmts(n);
  }, [mpSel, total, pMode, manE]);

  // Auto-distribute custom split amounts equally among selected consumers
  useEffect(() => {
    if (sMode !== "custom") return;
    const ids = Object.keys(cons).filter(id => cons[id]);
    if (!ids.length || total <= 0 || ids.some(id => manSplitE[id])) return;
    const sh = Math.round((total / ids.length) * 100) / 100;
    const n = {};
    ids.forEach((id, i) => { n[id] = i === ids.length - 1 ? (Math.round((total - sh * (ids.length - 1)) * 100) / 100).toString() : sh.toString(); });
    setCSplits(n);
  }, [cons, total, sMode, manSplitE]);

  const reset = () => { setDesc(""); setAmt(""); setCons({}); setSMode("equal"); setCSplits({}); setPMode("single"); setSPayer(""); setMpSel({}); setPAmts({}); setManE({}); setManSplitE({}); setEId(null); };
  const openNew = () => { reset(); setShow(true); };
  const openEd = tx => {
    setDesc(tx.description); setAmt(tx.amount.toString()); setEId(tx.id);
    const pIds = Object.keys(tx.payers);
    if (pIds.length === 1) { setPMode("single"); setSPayer(pIds[0]); setMpSel({}); setPAmts({}); }
    else { setPMode("multi"); setSPayer(""); const s = {}, a = {}, e = {}; pIds.forEach(id => { s[id] = true; a[id] = tx.payers[id].toString(); e[id] = true; }); setMpSel(s); setPAmts(a); setManE(e); }
    const cm = {}; Object.keys(tx.consumers).forEach(id => cm[id] = true); setCons(cm);
    const cIds = Object.keys(tx.consumers), eq = tx.amount / cIds.length;
    if (cIds.every(id => Math.abs(tx.consumers[id] - eq) < 0.02)) { setSMode("equal"); setCSplits({}); setManSplitE({}); }
    else { setSMode("custom"); setCSplits(Object.fromEntries(Object.entries(tx.consumers).map(([id, v]) => [id, v.toString()]))); const se = {}; cIds.forEach(id => se[id] = true); setManSplitE(se); }
    setShow(true);
  };
  const selC = group.participants.filter(p => cons[p.id]);
  const pSum = Object.values(pAmts).reduce((a, b) => a + (parseFloat(b) || 0), 0);
  const sSum = Object.values(cSplits).reduce((a, b) => a + (parseFloat(b) || 0), 0);
  const pOk = pMode === "single" ? !!sPayer : (Object.values(mpSel).some(Boolean) && Math.abs(pSum - total) < 0.01);
  const sOk = sMode === "equal" ? selC.length > 0 : Math.abs(sSum - total) < 0.01;
  const ok = desc.trim() && total > 0 && pOk && sOk;
  const save = () => {
    const pO = {}; if (pMode === "single") pO[sPayer] = total; else Object.entries(pAmts).forEach(([id, v]) => { const x = parseFloat(v) || 0; if (x > 0) pO[id] = x; });
    const cO = {}; if (sMode === "equal") { const sh = total / selC.length; selC.forEach(p => cO[p.id] = Math.round(sh * 100) / 100); } else Object.entries(cSplits).forEach(([id, v]) => { const x = parseFloat(v) || 0; if (x > 0) cO[id] = x; });
    setGroup(g => ({ ...g, expenses: eId ? g.expenses.map(e => e.id === eId ? { id: eId, description: desc.trim(), amount: total, payers: pO, consumers: cO } : e) : [...g.expenses, { id: uid(), description: desc.trim(), amount: total, payers: pO, consumers: cO }] }));
    reset(); setShow(false);
  };
  const rm = id => setGroup(g => ({ ...g, expenses: g.expenses.filter(e => e.id !== id) }));
  const gn = id => group.participants.find(p => p.id === id)?.name || "?";
  const togMP = id => { setMpSel(p => { const n = { ...p }; n[id] = !n[id]; if (!n[id]) setPAmts(a => { const x = { ...a }; delete x[id]; return x; }); setManE({}); return n; }); };

  return (
    <div className="fi" style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h3 style={{ margin: 0, fontFamily: "'Playfair Display',serif", fontSize: 22 }}>{group.name}</h3>
        <button onClick={openNew} style={S.btnP}>{Ico.plus} Add expense</button>
      </div>
      {group.expenses.length === 0 && !show && <div style={{ textAlign: "center", padding: "48px 0", color: "#aaa" }}><div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div><p style={{ fontStyle: "italic", fontSize: 14 }}>No expenses yet. Add your first one!</p></div>}
      {group.expenses.map((tx, i) => (
        <div key={tx.id} className="fi" style={{ ...S.card, animationDelay: `${i * 40}ms` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{tx.description}</div>
              <div style={{ fontSize: 13, color: "#777" }}>Paid by {Object.entries(tx.payers).map(([id, a], j) => <span key={id}>{j > 0 && ", "}<strong>{gn(id)}</strong> ({cur(a)})</span>)}</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>Split: {Object.keys(tx.consumers).map(id => gn(id)).join(", ")}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 18, fontFamily: "'DM Mono',monospace", color: "#1a1a2e" }}>{cur(tx.amount)}</div>
              <div style={{ display: "flex", gap: 4, marginTop: 8, justifyContent: "flex-end" }}>
                <button onClick={() => openEd(tx)} style={S.iBtn}>{Ico.edit}</button>
                <button onClick={() => rm(tx.id)} style={{ ...S.iBtn, color: "#c44" }}>{Ico.trash}</button>
              </div>
            </div>
          </div>
        </div>
      ))}
      {show && (
        <div className="fi" style={{ ...S.card, border: "2px solid #1a1a2e", marginTop: 16 }}>
          <h4 style={{ margin: "0 0 16px", fontFamily: "'Playfair Display',serif" }}>{eId ? "Edit expense" : "New expense"}</h4>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 2 }}><label style={S.lSm}>Description</label><input style={S.iSm} placeholder="e.g. Dinner" value={desc} onChange={e => setDesc(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={S.lSm}>Amount (€)</label><input style={S.iSm} type="number" min="0" step="0.01" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value)} /></div>
          </div>
          <label style={S.lSm}>Paid by</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <Chip label="Single payer" selected={pMode === "single"} onClick={() => setPMode("single")} small />
            <Chip label="Multiple payers" selected={pMode === "multi"} onClick={() => setPMode("multi")} small />
          </div>
          {pMode === "single" ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {group.participants.map(p => <Chip key={p.id} label={p.name} selected={sPayer === p.id} onClick={() => setSPayer(p.id)} small />)}
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {group.participants.map(p => <Chip key={p.id} label={p.name} selected={!!mpSel[p.id]} onClick={() => togMP(p.id)} small />)}
              </div>
              {group.participants.filter(p => mpSel[p.id]).map(p => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, width: 80, flexShrink: 0, fontWeight: 500 }}>{p.name}</span>
                  <input style={{ ...S.iSm, marginBottom: 0, width: 100 }} type="number" min="0" step="0.01" placeholder="0.00"
                    value={pAmts[p.id] || ""} onChange={e => { setPAmts(pr => ({ ...pr, [p.id]: e.target.value })); setManE(pr => ({ ...pr, [p.id]: true })); }} />
                  <span style={{ fontSize: 11, color: "#999" }}>€</span>
                </div>
              ))}
              {total > 0 && Object.values(mpSel).some(Boolean) && (
                <div style={{ fontSize: 12, marginTop: 6, color: Math.abs(pSum - total) < 0.01 ? "#2a9d2a" : "#c44" }}>Total paid: {cur(pSum)} / {cur(total)} {Math.abs(pSum - total) < 0.01 && "✓"}</div>
              )}
            </div>
          )}
          <label style={S.lSm}>Split between</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <Chip label="Equal split" selected={sMode === "equal"} onClick={() => {
              setSMode("equal");
              const activeIds = Object.keys(cons).filter(id => cons[id]);
              if (activeIds.length === 0) {
                const allCons = {};
                group.participants.forEach(p => { allCons[p.id] = true; });
                setCons(allCons);
              }
            }} small />
            <Chip label="Custom amounts" selected={sMode === "custom"} onClick={() => {
              setSMode("custom");
              setManSplitE({});
              let activeIds = Object.keys(cons).filter(id => cons[id]);
              if (activeIds.length === 0) {
                const allCons = {};
                group.participants.forEach(p => { allCons[p.id] = true; });
                setCons(allCons);
                activeIds = group.participants.map(p => p.id);
              }
              if (activeIds.length > 0 && total > 0) {
                const sh = Math.round((total / activeIds.length) * 100) / 100;
                const n = {};
                activeIds.forEach((id, i) => { n[id] = i === activeIds.length - 1 ? (Math.round((total - sh * (activeIds.length - 1)) * 100) / 100).toString() : sh.toString(); });
                setCSplits(n);
              }
            }} small />
          </div>
          {sMode === "equal" ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {group.participants.map(p => <Chip key={p.id} label={p.name} selected={!!cons[p.id]} onClick={() => setCons(c => { const n = { ...c }; n[p.id] ? delete n[p.id] : (n[p.id] = true); return n; })} small />)}
              </div>
              <button onClick={() => { const a = {}; group.participants.forEach(p => a[p.id] = true); setCons(a); }} style={{ fontSize: 11, color: "#666", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Select all</button>
              {selC.length > 0 && total > 0 && <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>{cur(total / selC.length)} each</div>}
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {group.participants.map(p => <Chip key={p.id} label={p.name} selected={!!cons[p.id]} onClick={() => { setCons(c => { const n = { ...c }; n[p.id] ? delete n[p.id] : (n[p.id] = true); return n; }); setManSplitE({}); }} small />)}
              </div>
              <button onClick={() => { const a = {}; group.participants.forEach(p => a[p.id] = true); setCons(a); setManSplitE({}); }} style={{ fontSize: 11, color: "#666", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Select all</button>
              {group.participants.filter(p => cons[p.id]).map(p => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 13, width: 80, flexShrink: 0, fontWeight: 500 }}>{p.name}</span>
                  <input style={{ ...S.iSm, marginBottom: 0, width: 100 }} type="number" min="0" step="0.01" placeholder="0.00"
                    value={cSplits[p.id] || ""} onChange={e => { setCSplits(pr => ({ ...pr, [p.id]: e.target.value })); setManSplitE(pr => ({ ...pr, [p.id]: true })); }} />
                  <span style={{ fontSize: 11, color: "#999" }}>€</span>
                </div>
              ))}
              {total > 0 && Object.values(cons).some(Boolean) && (
                <div style={{ fontSize: 12, color: Math.abs(sSum - total) < 0.01 ? "#2a9d2a" : "#c44", marginTop: 6 }}>Total split: {cur(sSum)} / {cur(total)} {Math.abs(sSum - total) < 0.01 && "✓"}</div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => { setShow(false); reset(); }} style={S.btnG}>Cancel</button>
            <button disabled={!ok} onClick={save} style={{ ...S.btnP, opacity: ok ? 1 : 0.4 }}>{Ico.check} {eId ? "Update" : "Add expense"}</button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
        <button onClick={onBack} style={S.btnG}>← Back</button>
        <button disabled={!group.expenses.length} onClick={onNext} style={{ ...S.btnL, flex: 1, opacity: group.expenses.length ? 1 : 0.4 }}>Calculate settlements →</button>
      </div>
    </div>
  );
}

/* ═══════ STEP 3: SETTLEMENTS ═══════ */
function Settlements({ group, onBack, shareUrl, onCopy, copied }) {
  const [showUrl, setShowUrl] = useState(false);
  const urlRef = useRef(null);
  const bals = useMemo(() => {
    const b = {}; group.participants.forEach(p => b[p.name] = 0);
    group.expenses.forEach(tx => {
      Object.entries(tx.payers).forEach(([id, a]) => { const n = group.participants.find(p => p.id === id)?.name; if (n) b[n] = (b[n] || 0) + a; });
      Object.entries(tx.consumers).forEach(([id, a]) => { const n = group.participants.find(p => p.id === id)?.name; if (n) b[n] = (b[n] || 0) - a; });
    }); return b;
  }, [group]);
  const sett = useMemo(() => simplifyDebts(bals), [bals]);
  const tot = group.expenses.reduce((s, e) => s + e.amount, 0);
  const urlLen = shareUrl ? shareUrl.length : 0;

  const selectAll = () => {
    if (urlRef.current) {
      urlRef.current.select();
      urlRef.current.focus();
    }
  };

  return (
    <div className="fi" style={{ maxWidth: 560, margin: "0 auto" }}>
      <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, marginBottom: 8 }}>{group.name} — Settlement</h3>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 28 }}>{group.expenses.length} expense{group.expenses.length !== 1 && "s"} · Total: {cur(tot)}</p>
      <div style={{ marginBottom: 32 }}>
        <h4 style={S.sec}>Balances</h4>
        {group.participants.map((p, i) => {
          const bl = bals[p.name] || 0, mx = Math.max(...Object.values(bals).map(Math.abs), 1), pc = Math.abs(bl) / mx * 100;
          return (
            <div key={p.id} className="fi" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, animationDelay: `${i * 60}ms` }}>
              <span style={{ width: 80, fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{p.name}</span>
              <div style={{ flex: 1, height: 24, background: "#f4f4f6", borderRadius: 6, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, [bl >= 0 ? "left" : "right"]: 0, height: "100%", width: `${pc}%`, background: bl >= 0 ? "linear-gradient(90deg,#3ecf8e,#2ab77a)" : "linear-gradient(90deg,#ff6b6b,#ee5a5a)", borderRadius: 6, transition: "width .5s ease" }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, width: 80, textAlign: "right", flexShrink: 0, fontFamily: "'DM Mono',monospace", color: bl >= 0 ? "#2ab77a" : "#ee5a5a" }}>{bl >= 0 ? "+" : ""}{cur(bl)}</span>
            </div>
          );
        })}
      </div>
      <h4 style={S.sec}>{sett.length === 0 ? "All settled up! 🎉" : `Minimum transfers (${sett.length})`}</h4>
      {sett.map((s, i) => (
        <div key={i} className="fi" style={{ ...S.card, display: "flex", alignItems: "center", gap: 16, animationDelay: `${i * 80}ms`, background: "linear-gradient(135deg,#fafafa,#f0f0f4)" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: `hsl(${(i * 97 + 10) % 360},45%,88%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#333", flexShrink: 0 }}>{s.from[0]}</div>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 15 }}>{s.from}</div><div style={{ fontSize: 12, color: "#999" }}>pays</div></div>
          <div style={{ color: "#1a1a2e" }}>{Ico.arrow}</div>
          <div style={{ flex: 1, textAlign: "right" }}><div style={{ fontWeight: 600, fontSize: 15 }}>{s.to}</div><div style={{ fontSize: 12, color: "#999" }}>receives</div></div>
          <div style={{ fontWeight: 700, fontSize: 18, fontFamily: "'DM Mono',monospace", color: "#1a1a2e", flexShrink: 0, marginLeft: 8 }}>{cur(s.amount)}</div>
        </div>
      ))}
      {/* Share — nu instant, geen server nodig */}
      <div style={{ marginTop: 36, padding: "24px", background: "#fff", borderRadius: 14, border: "1.5px solid #e0e0e6", boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>
        <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>{Ico.share} Share this settlement</h4>
        <p style={{ fontSize: 13, color: "#777", marginBottom: 14 }}>All data is encoded in the URL — no server needed. Anyone with the link sees the full settlement.</p>
        <div>
          <button onClick={onCopy} style={{ ...S.btnP, width: "100%", justifyContent: "center", padding: "12px 20px", background: copied ? "#2ab77a" : "#1a1a2e", transition: "background .2s", marginBottom: 10 }}>
            {copied ? <>{Ico.check} Link copied to clipboard!</> : <>{Ico.link} Copy share link</>}
          </button>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={() => setShowUrl(u => !u)} style={{ fontSize: 11, color: "#666", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              {showUrl ? "Hide URL" : "Show full URL"} ({urlLen > 1000 ? `${Math.round(urlLen / 1024)}KB` : `${urlLen} chars`})
            </button>
            <p style={{ fontSize: 11, color: "#aaa", margin: 0 }}>Data lives entirely in the URL</p>
          </div>
          {showUrl && (
            <div className="fi" style={{ marginTop: 10 }}>
              <textarea
                ref={urlRef}
                readOnly
                value={shareUrl}
                onClick={selectAll}
                style={{
                  width: "100%",
                  minHeight: 80,
                  maxHeight: 200,
                  padding: "10px 14px",
                  background: "#f4f4f6",
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: "'DM Mono',monospace",
                  color: "#555",
                  border: "1px solid #e0e0e6",
                  resize: "vertical",
                  lineHeight: 1.5,
                  wordBreak: "break-all",
                }}
              />
              <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>Click to select all · You can also manually copy from here</p>
            </div>
          )}
        </div>
      </div>
      <button onClick={onBack} style={{ ...S.btnG, marginTop: 24 }}>← Back to expenses</button>
    </div>
  );
}

/* ═══════ STEPPER ═══════ */
function Stepper({ step, maxV, go }) {
  const st = [{ icon: Ico.users, label: "Group" }, { icon: Ico.receipt, label: "Expenses" }, { icon: Ico.scale, label: "Settle" }];
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 0, marginBottom: 40 }}>
      {st.map((s, i) => { const cl = i <= maxV; return (
        <div key={i} style={{ display: "flex", alignItems: "center" }}>
          <div onClick={() => cl && go(i)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: step >= i ? 1 : (cl ? 0.55 : 0.3), transition: "opacity .3s", cursor: cl ? "pointer" : "default" }} title={cl ? `Go to ${s.label}` : ""}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: step === i ? "#1a1a2e" : (cl ? "#3a3a5e" : "#e0e0e6"), color: step === i || cl ? "#fff" : "#999", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .3s", boxShadow: cl && step !== i ? "inset 0 0 0 2px rgba(255,255,255,.3)" : "none" }}>
              {i < step ? Ico.check : s.icon}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: step === i ? "#1a1a2e" : (cl ? "#555" : "#bbb") }}>{s.label}</span>
          </div>
          {i < 2 && <div style={{ width: 48, height: 2, background: step > i ? "#1a1a2e" : "#e0e0e6", margin: "0 8px", marginBottom: 20, transition: "background .3s" }} />}
        </div>
      ); })}
    </div>
  );
}

/* ═══════ APP ═══════ */
export default function App() {
  const [step, setStep] = useState(0);
  const [maxV, setMaxV] = useState(0);
  const [group, setGroup] = useState({ name: "", participants: [], expenses: [] });
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // On mount: try to load group data from URL hash
  useEffect(() => {
    const hashData = getGroupFromHash();
    if (hashData && hashData.participants && hashData.participants.length > 0) {
      setGroup(hashData);
      // Determine which step to open at
      if (hashData.expenses && hashData.expenses.length > 0) {
        setStep(2);
        setMaxV(2);
      } else {
        setStep(1);
        setMaxV(1);
      }
    }
    setLoaded(true);
  }, []);

  // Sync group state to URL hash (debounced) when group has meaningful data
  useEffect(() => {
    if (!loaded) return;
    if (group.participants.length > 0 || group.expenses.length > 0) {
      const t = setTimeout(() => setGroupToHash(group), 300);
      return () => clearTimeout(t);
    }
  }, [group, loaded]);

  const shareUrl = useMemo(() => {
    if (group.participants.length === 0) return "";
    return getShareUrl(group) || "";
  }, [group]);

  const go = s => { if (s <= maxV) setStep(s); };
  const adv = n => { setStep(n); setMaxV(p => Math.max(p, n)); };

  const handleCopy = useCallback(() => {
    if (!shareUrl) return;
    const fallbackCopy = (text) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => {
        fallbackCopy(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    } else {
      fallbackCopy(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }, [shareUrl]);

  const handleReset = () => {
    if (window.confirm("Start a new settlement? All current data will be cleared.")) {
      setGroup({ name: "", participants: [], expenses: [] });
      setStep(0);
      setMaxV(0);
      window.history.replaceState(null, "", window.location.pathname);
    }
  };

  if (!loaded) {
    return (
      <Shell onReset={handleReset}>
        <div style={{ textAlign: "center", padding: "60px 0", color: "#999" }}>
          <p style={{ fontSize: 15 }}>Loading...</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onReset={handleReset}>
      <Stepper step={step} maxV={maxV} go={go} />
      {step === 0 && <GroupSetup group={group} setGroup={setGroup} onNext={() => adv(1)} />}
      {step === 1 && <Expenses group={group} setGroup={setGroup} onNext={() => adv(2)} onBack={() => go(0)} />}
      {step === 2 && <Settlements group={group} onBack={() => go(1)} shareUrl={shareUrl} onCopy={handleCopy} copied={copied} />}
    </Shell>
  );
}

/* ═══════ SHELL LAYOUT ═══════ */
function Shell({ children, onReset }) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}body{background:#f7f7fa}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.fi{animation:fadeIn .4s ease both}
        input:focus{outline:none;border-color:#1a1a2e!important;box-shadow:0 0 0 3px rgba(26,26,46,.1)}
        input[type=number]{-moz-appearance:textfield}input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
      `}</style>
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#f7f7fa 0%,#eeeef3 100%)", fontFamily: "'DM Sans',sans-serif", color: "#1a1a2e" }}>
        <header style={{ textAlign: "center", padding: "40px 20px 0" }}>
          <h1 onClick={onReset} style={{ fontFamily: "'Playfair Display',serif", fontSize: 36, fontWeight: 700, letterSpacing: -1, marginBottom: 4, cursor: "pointer" }}>Open<span style={{ color: "#3ecf8e" }}>Settle</span></h1>
          <p style={{ fontSize: 13, color: "#999", letterSpacing: 0.5, marginBottom: 8 }}>Split expenses fairly — no server, no registration</p>
          <p style={{ fontSize: 11, color: "#bbb", letterSpacing: 0.3, marginBottom: 32 }}>All data lives in the URL · Share by copying the link</p>
        </header>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 20px 60px" }}>
          {children}
        </div>
        <footer style={{ textAlign: "center", padding: "20px", fontSize: 11, color: "#bbb" }}>Open source · 100% client-side · No data stored on any server</footer>
      </div>
    </>
  );
}

/* ═══════ STYLES ═══════ */
const S = {
  label: { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, letterSpacing: 0.3, color: "#555" },
  lSm: { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#777" },
  sec: { fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 14, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 12 },
  input: { width: "100%", padding: "12px 16px", fontSize: 15, border: "1.5px solid #ddd", borderRadius: 10, fontFamily: "'DM Sans',sans-serif", background: "#fff", marginBottom: 8, transition: "all .2s" },
  iSm: { padding: "8px 12px", fontSize: 13, border: "1.5px solid #ddd", borderRadius: 8, fontFamily: "'DM Sans',sans-serif", background: "#fff", marginBottom: 6, transition: "all .2s", width: "100%" },
  btnP: { display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,.15)" },
  btnL: { width: "100%", padding: "14px 24px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,.12)" },
  btnG: { padding: "10px 20px", background: "transparent", color: "#666", border: "1.5px solid #ddd", borderRadius: 10, fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans',sans-serif", cursor: "pointer" },
  iBtn: { width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#f0f0f4", border: "none", borderRadius: 6, cursor: "pointer", color: "#666" },
  tag: { display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px 6px 6px", background: "#fff", border: "1.5px solid #e0e0e6", borderRadius: 100, fontSize: 13, fontWeight: 500, boxShadow: "0 1px 3px rgba(0,0,0,.04)" },
  tagX: { marginLeft: 4, background: "none", border: "none", fontSize: 16, color: "#bbb", cursor: "pointer", lineHeight: 1, padding: "0 2px" },
  card: { background: "#fff", borderRadius: 14, padding: "16px 20px", border: "1px solid #e8e8ec", marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,.04)" },
};

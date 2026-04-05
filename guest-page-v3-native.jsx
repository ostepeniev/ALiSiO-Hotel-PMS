import { useState, useRef, useEffect } from "react";

const C = {
  bg: "#F2F2F7",       // iOS system bg
  card: "#FFFFFF",
  text: "#000000",
  sub: "#8E8E93",       // iOS secondary
  sep: "#E5E5EA",       // iOS separator
  blue: "#007AFF",      // iOS blue
  green: "#34C759",     // iOS green
  orange: "#FF9500",
  red: "#FF3B30",
  forest: "#2E6B4F",
  forestLight: "#E8F5EE",
  sand: "#F5F0E8",
  tint: "#2E6B4F",      // brand tint
};

// ── Bottom Sheet ──
function BottomSheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: C.card, borderRadius: "16px 16px 0 0",
        maxHeight: "85vh", display: "flex", flexDirection: "column",
        animation: "slideUp 0.3s ease"
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        <div style={{ padding: "12px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ width: 36, height: 5, borderRadius: 3, background: "#D1D1D6", margin: "0 auto 12px" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px 12px" }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: "50%", background: "#E5E5EA",
            border: "none", fontSize: 14, cursor: "pointer", color: "#666",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>✕</button>
        </div>
        <div style={{ overflow: "auto", padding: "0 20px 32px", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Story bubble ──
function StoryBubble({ emoji, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      background: "none", border: "none", cursor: "pointer", padding: 0, minWidth: 64
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: active ? `linear-gradient(135deg, ${C.forest}, #4CAF50)` : "#F0F0F0",
        padding: active ? 2 : 0,
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <div style={{
          width: active ? 52 : 56, height: active ? 52 : 56, borderRadius: "50%",
          background: active ? C.card : "#F0F0F0",
          border: active ? "2px solid white" : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22
        }}>
          {emoji}
        </div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 500, color: C.sub }}>{label}</span>
    </button>
  );
}

// ── iOS-style list row ──
function ListRow({ icon, label, value, onClick, chevron = true, last = false }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%",
      padding: "13px 0", borderBottom: last ? "none" : `0.5px solid ${C.sep}`,
      background: "none", border: "none", borderBottomStyle: last ? "none" : "solid",
      borderBottomWidth: last ? 0 : 0.5, borderBottomColor: C.sep,
      cursor: onClick ? "pointer" : "default", fontFamily: "inherit", textAlign: "left"
    }}>
      <span style={{ fontSize: 20, width: 28, textAlign: "center" }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 15, color: C.text }}>{label}</span>
      {value && <span style={{ fontSize: 15, color: C.sub }}>{value}</span>}
      {chevron && onClick && <span style={{ fontSize: 14, color: "#C7C7CC" }}>›</span>}
    </button>
  );
}

// ═════════════════════════════════════════════════
export default function GuestPageV3() {
  const [tab, setTab] = useState("home");
  const [phase, setPhase] = useState("during");
  const [sheet, setSheet] = useState(null); // null | "directions" | "wifi" | "entry" | "service" | "checkin" | "chat"
  const [selectedService, setSelectedService] = useState(null);
  const [chatMsgs, setChatMsgs] = useState([
    { from: "host", text: "Hi Marco! Welcome to Kemp Carlsbad. Let us know if you need anything 🌿", time: "14:32" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef(null);
  const [regDone, setRegDone] = useState(true);

  useEffect(() => {
    if (sheet === "chat") chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs, sheet]);

  const services = [
    { emoji: "🥐", name: "Breakfast", price: "250 Kč", desc: "Local bread, eggs, jam, coffee. Delivered to your door by 9:00.", per: "person" },
    { emoji: "🧖", name: "Sauna", price: "800 Kč", desc: "2h private Finnish sauna. Towels & water included.", per: "session" },
    { emoji: "🔥", name: "Campfire", price: "250 Kč", desc: "Firewood, marshmallows, sticks & stargazing card.", per: "set" },
    { emoji: "❤️", name: "Romantic", price: "800 Kč", desc: "Candles, local wine, chocolate, rose petals.", per: "pkg" },
    { emoji: "🚲", name: "Bicycle", price: "350 Kč", desc: "Explore the countryside at your own pace.", per: "day" },
    { emoji: "⚡", name: "E-Bike", price: "600 Kč", desc: "Electric bike for longer trips.", per: "day" },
    { emoji: "⏰", name: "Late C/O", price: "400 Kč", desc: "Stay until 14:00. Subject to availability.", per: "" },
    { emoji: "🐶", name: "Dog Kit", price: "150 Kč", desc: "Bowl, towel, treats & waste bags.", per: "" },
  ];

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const now = new Date();
    setChatMsgs(prev => [...prev, { from: "guest", text: chatInput, time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}` }]);
    setChatInput("");
    setTimeout(() => {
      setChatMsgs(prev => [...prev, { from: "host", text: "Got it! We'll take care of it right away 👍", time: `${now.getHours()}:${String(now.getMinutes() + 1).padStart(2, "0")}` }]);
    }, 1500);
  };

  return (
    <div style={{ fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif", background: C.bg, minHeight: "100vh", maxWidth: 430, margin: "0 auto", position: "relative", overflow: "hidden" }}>

      {/* ── DEMO PHASE SWITCH ── */}
      <div style={{ padding: "6px 10px", background: "#1C1C1E", display: "flex", gap: 4, overflowX: "auto" }}>
        <span style={{ color: "#666", fontSize: 10, lineHeight: "22px", paddingRight: 4 }}>Demo:</span>
        {["pre","checkin_day","during","checkout"].map(p => (
          <button key={p} onClick={() => setPhase(p)} style={{
            padding: "2px 10px", borderRadius: 12, border: "none",
            background: phase === p ? C.tint : "#2C2C2E",
            color: "#FFF", fontSize: 10, cursor: "pointer", fontFamily: "inherit"
          }}>{p === "pre" ? "Before" : p === "checkin_day" ? "Day-of" : p === "during" ? "Staying" : "Checkout"}</button>
        ))}
      </div>

      {/* ════ HOME TAB ════ */}
      {tab === "home" && (
        <div style={{ paddingBottom: 90 }}>

          {/* ── WALLET-STYLE BOOKING CARD ── */}
          <div style={{ padding: "16px 16px 0" }}>
            <div style={{
              background: `linear-gradient(145deg, ${C.forest} 0%, #1E4A36 100%)`,
              borderRadius: 16, padding: "18px 20px", color: "#FFF",
              position: "relative", overflow: "hidden"
            }}>
              {/* Subtle texture */}
              <div style={{ position: "absolute", inset: 0, opacity: 0.04, backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />

              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, letterSpacing: "0.1em", textTransform: "uppercase" }}>Kemp Carlsbad</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>Forest Cabin</div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {["EN","CZ","DE"].map(l => (
                      <span key={l} style={{
                        padding: "2px 7px", borderRadius: 10, fontSize: 9, fontWeight: 600,
                        background: l === "EN" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
                        color: "#FFF", cursor: "pointer"
                      }}>{l}</span>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 10, opacity: 0.5 }}>CHECK-IN</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>Mar 1 · 15:00</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, opacity: 0.5 }}>NIGHTS</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>50</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, opacity: 0.5 }}>CHECK-OUT</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>Apr 20 · 11:00</div>
                  </div>
                </div>

                <div style={{
                  marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.15)",
                  display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {phase === "pre" ? "🗓 3 days to go" :
                     phase === "checkin_day" ? "🌟 Today is the day!" :
                     phase === "during" ? "🌿 Day 2 — enjoy the forest" :
                     "👋 Check-out today"}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>Marco M.</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── STORIES ROW ── */}
          <div style={{ padding: "18px 0 4px", overflowX: "auto", display: "flex", gap: 12, paddingLeft: 16, paddingRight: 16 }}>
            <StoryBubble emoji="📍" label="Directions" active onClick={() => setSheet("directions")} />
            <StoryBubble emoji="🔑" label="Entry" active onClick={() => setSheet("entry")} />
            <StoryBubble emoji="📶" label="Wi-Fi" active onClick={() => setSheet("wifi")} />
            <StoryBubble emoji="🅿️" label="Parking" active onClick={() => setSheet("directions")} />
            <StoryBubble emoji="🍽" label="Restaurant" active={false} onClick={() => setSheet("restaurant")} />
            <StoryBubble emoji="🥾" label="Hiking" active={false} onClick={() => setSheet("hiking")} />
          </div>

          {/* ── ACTION CARD ── */}
          {phase === "pre" && !regDone && (
            <div style={{ padding: "8px 16px 0" }}>
              <div style={{
                background: C.card, borderRadius: 14, padding: "14px 16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: C.orange,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, color: "#FFF", fontWeight: 700
                  }}>!</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>Complete registration</div>
                    <div style={{ fontSize: 12, color: C.sub }}>2 minutes · required before check-in</div>
                  </div>
                </div>
                <button onClick={() => setSheet("checkin")} style={{
                  width: "100%", padding: "12px", borderRadius: 10, border: "none",
                  background: C.tint, color: "#FFF", fontSize: 15, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit"
                }}>Start →</button>
              </div>
            </div>
          )}

          {/* ── WEATHER PILL ── */}
          {(phase === "during" || phase === "checkin_day") && (
            <div style={{ padding: "10px 16px 0" }}>
              <div style={{
                background: C.card, borderRadius: 14, padding: "12px 16px",
                display: "flex", alignItems: "center", gap: 12,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
              }}>
                <span style={{ fontSize: 28 }}>⛅</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>14°C · Partly cloudy</div>
                  <div style={{ fontSize: 12, color: C.sub }}>Great day for the river trail 🌲</div>
                </div>
              </div>
            </div>
          )}

          {/* ── WHAT'S HAPPENING ── */}
          <div style={{ padding: "14px 16px 0" }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
              {phase === "checkout" ? "Before you leave" : phase === "pre" ? "Getting ready" : "Your stay"}
            </div>

            <div style={{ background: C.card, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              {phase === "pre" && (
                <>
                  <ListRow icon="✅" label="Booking confirmed" value="" chevron={false} />
                  <ListRow icon={regDone ? "✅" : "⚠️"} label="Guest registration" value={regDone ? "Done" : "Required"} onClick={regDone ? null : () => setSheet("checkin")} />
                  <ListRow icon="🔒" label="Check-in instructions" value="Mar 1" chevron={false} last />
                </>
              )}
              {phase === "checkin_day" && (
                <>
                  <ListRow icon="✅" label="Registration complete" chevron={false} />
                  <ListRow icon="🔑" label="Entry instructions" onClick={() => setSheet("entry")} />
                  <ListRow icon="📍" label="How to get here" onClick={() => setSheet("directions")} last />
                </>
              )}
              {phase === "during" && (
                <>
                  <ListRow icon="🔥" label="Order firewood" onClick={() => { setSelectedService(services[2]); setSheet("service"); }} />
                  <ListRow icon="🧖" label="Book sauna" onClick={() => { setSelectedService(services[1]); setSheet("service"); }} />
                  <ListRow icon="🥐" label="Breakfast for tomorrow" onClick={() => { setSelectedService(services[0]); setSheet("service"); }} last />
                </>
              )}
              {phase === "checkout" && (
                <>
                  <ListRow icon="☐" label="Close windows & lights" chevron={false} />
                  <ListRow icon="☐" label="Key in the lockbox" chevron={false} />
                  <ListRow icon="⏰" label="Late check-out until 14:00" value="400 Kč" onClick={() => { setSelectedService(services[6]); setSheet("service"); }} last />
                </>
              )}
            </div>
          </div>

          {/* ── QUICK INFO ── */}
          <div style={{ padding: "14px 16px 0" }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Good to know</div>
            <div style={{ background: C.card, borderRadius: 14, overflow: "hidden", padding: "0 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <ListRow icon="🕐" label="Check-in" value="15:00" chevron={false} />
              <ListRow icon="🕚" label="Check-out" value="11:00" chevron={false} />
              <ListRow icon="📶" label="Wi-Fi" value="Tap to copy" onClick={() => { navigator.clipboard?.writeText("glamping2024"); setSheet("wifi"); }} />
              <ListRow icon="🐕" label="Pets" value="Welcome" chevron={false} />
              <ListRow icon="📞" label="Support" value="+420 773 708 849" chevron={false} last />
            </div>
          </div>

          {/* ── CABIN AMENITIES ── */}
          <div style={{ padding: "14px 16px 0" }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Your cabin</div>
            <div style={{ background: C.card, borderRadius: 14, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["🛏 Queen bed","🚿 Shower","🔥 Heating","❄️ A/C","📶 Wi-Fi","🍳 Kitchen","☕ Coffee","🧺 Towels","🧴 Toiletries"].map(a => (
                  <span key={a} style={{ padding: "5px 10px", borderRadius: 14, background: C.bg, fontSize: 12, color: C.text }}>{a}</span>
                ))}
              </div>
            </div>
          </div>

          {/* ── HOUSE RULES ── */}
          <div style={{ padding: "14px 16px 0" }}>
            <div style={{ background: C.card, borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>House rules</div>
              <div style={{ fontSize: 13, color: C.sub, lineHeight: 2 }}>
                🌙 Quiet after 23:00 · 🚭 Smoke-free cabins<br/>
                🔥 Fire pits only · 🐕 Leash in common areas<br/>
                🚗 10 km/h · ♻️ Sort waste · 🧖 Reserve sauna
              </div>
            </div>
          </div>

          {/* ── CHECKOUT: FEEDBACK ── */}
          {phase === "checkout" && (
            <div style={{ padding: "14px 16px 0" }}>
              <div style={{ background: C.card, borderRadius: 14, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>💚 How was your stay?</div>
                <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>What's the one thing you'll remember?</div>
                <textarea placeholder="The campfire under the stars..." style={{
                  width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.sep}`,
                  fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
                  resize: "none", height: 56, outline: "none", background: C.bg
                }} />
                <button style={{
                  marginTop: 8, padding: "10px 20px", borderRadius: 10, border: "none",
                  background: C.tint, color: "#FFF", fontSize: 14, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit"
                }}>Send</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════ SERVICES TAB ════ */}
      {tab === "services" && (
        <div style={{ padding: "16px 16px 90px" }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Services</div>
          <div style={{ fontSize: 14, color: C.sub, marginBottom: 16 }}>Add something special to your stay</div>

          {services.map(s => (
            <button key={s.name} onClick={() => { setSelectedService(s); setSheet("service"); }} style={{
              display: "flex", alignItems: "center", gap: 14, width: "100%",
              background: C.card, borderRadius: 14, padding: "14px 16px", marginBottom: 8,
              border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: C.sand,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, flexShrink: 0
              }}>{s.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{s.name}</div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>{s.desc}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.tint }}>{s.price}</div>
                {s.per && <div style={{ fontSize: 10, color: C.sub }}>/{s.per}</div>}
              </div>
            </button>
          ))}

          {/* Restaurant */}
          <div style={{ marginTop: 8, background: C.card, borderRadius: 14, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>🍽 Restaurant Carlsbad</div>
            <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
              Breakfast 8–10:30 · Lunch 12–15 · Dinner 18–22
            </div>
            <button style={{
              marginTop: 10, padding: "8px 16px", borderRadius: 8,
              background: C.forestLight, border: "none", color: C.tint,
              fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit"
            }}>View Menu →</button>
          </div>
        </div>
      )}

      {/* ════ EXPLORE TAB ════ */}
      {tab === "explore" && (
        <div style={{ padding: "16px 16px 90px" }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Explore</div>
          <div style={{ fontSize: 14, color: C.sub, marginBottom: 16 }}>Discover what's around you</div>

          {[
            { emoji: "🥾", title: "Hiking trails", desc: "River walk (30 min) · Forest loop (1.5h) · Lookout point (2h)", cta: "View routes" },
            { emoji: "🚴", title: "Cycling routes", desc: "Scenic rides from the resort through the countryside", cta: "Open Mapy.cz" },
            { emoji: "🌅", title: "Sunset spot", desc: "Best view is from the hill behind cabin A — 5 min walk", cta: null },
            { emoji: "🛒", title: "Nearest shop", desc: "Večerka Březová — 800m, open daily until 20:00", cta: "Navigate" },
            { emoji: "💊", title: "Pharmacy", desc: "Dr. Max Loketská — in town, 10 min drive", cta: "Navigate" },
            { emoji: "🚗", title: "Karlovy Vary", desc: "Historic spa town — 15 min drive", cta: "Navigate" },
          ].map(p => (
            <div key={p.title} style={{
              background: C.card, borderRadius: 14, padding: "14px 16px", marginBottom: 8,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
            }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{p.emoji} {p.title}</div>
              <div style={{ fontSize: 13, color: C.sub, marginTop: 3, lineHeight: 1.5 }}>{p.desc}</div>
              {p.cta && <div style={{ fontSize: 13, color: C.blue, fontWeight: 500, marginTop: 8, cursor: "pointer" }}>{p.cta} →</div>}
            </div>
          ))}
        </div>
      )}

      {/* ════ BOTTOM SHEETS ════ */}

      {/* Directions */}
      <BottomSheet open={sheet === "directions"} onClose={() => setSheet(null)} title="How to get here">
        <div style={{ background: C.bg, borderRadius: 12, height: 160, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, fontSize: 14, color: C.sub }}>
          🗺 Map placeholder — Google Maps embed
        </div>
        <div style={{ fontSize: 14, color: C.text, lineHeight: 1.7, marginBottom: 16 }}>
          <strong>Address:</strong> Loketská, Radošov, Karlovy Vary<br/>
          <strong>GPS:</strong> 50.1987° N, 12.8234° E<br/>
          <strong>Parking:</strong> Free, directly by the entrance
        </div>
        <div style={{ background: C.forestLight, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: C.forest, marginBottom: 16 }}>
          🎥 Watch the last 500m video guide so you know exactly where to turn
        </div>
        <button style={{
          width: "100%", padding: "14px", borderRadius: 12, border: "none",
          background: C.tint, color: "#FFF", fontSize: 15, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit"
        }}>Open in Google Maps</button>
      </BottomSheet>

      {/* Wi-Fi */}
      <BottomSheet open={sheet === "wifi"} onClose={() => setSheet(null)} title="Wi-Fi">
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📶</div>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 4 }}>Network</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>QA Glamping</div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 16, marginBottom: 4 }}>Password</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace" }}>glamping2024</div>
          <button onClick={() => navigator.clipboard?.writeText("glamping2024")} style={{
            marginTop: 20, padding: "12px 32px", borderRadius: 10, border: "none",
            background: C.tint, color: "#FFF", fontSize: 15, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit"
          }}>Copy Password</button>
        </div>
      </BottomSheet>

      {/* Entry */}
      <BottomSheet open={sheet === "entry"} onClose={() => setSheet(null)} title="Entry instructions">
        <div style={{ background: C.bg, borderRadius: 12, height: 140, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, fontSize: 14, color: C.sub }}>
          📷 Photo of entrance / lockbox
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.8 }}>
          <strong>1.</strong> Walk to your cabin (follow signs to <strong>F</strong>)<br/>
          <strong>2.</strong> Lockbox is on the right side of the door<br/>
          <strong>3.</strong> Code: <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 18, color: C.tint }}>4827</span><br/>
          <strong>4.</strong> Turn the key left to open
        </div>
        <div style={{ background: "#FFF3E6", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.orange, marginTop: 16 }}>
          🌙 Arriving after dark? Pathway lights turn on automatically at sunset.
        </div>
      </BottomSheet>

      {/* Service detail */}
      <BottomSheet open={sheet === "service" && !!selectedService} onClose={() => { setSheet(null); setSelectedService(null); }} title={selectedService?.name || ""}>
        {selectedService && (
          <>
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 56, marginBottom: 8 }}>{selectedService.emoji}</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{selectedService.price}</div>
              {selectedService.per && <div style={{ fontSize: 13, color: C.sub }}>per {selectedService.per}</div>}
            </div>
            <div style={{ fontSize: 15, color: C.text, lineHeight: 1.6, marginBottom: 20 }}>{selectedService.desc}</div>
            <button style={{
              width: "100%", padding: "14px", borderRadius: 12, border: "none",
              background: C.tint, color: "#FFF", fontSize: 16, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit"
            }}>Add to My Stay</button>
          </>
        )}
      </BottomSheet>

      {/* Restaurant */}
      <BottomSheet open={sheet === "restaurant"} onClose={() => setSheet(null)} title="Restaurant Carlsbad">
        <div style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}>
          <strong>Breakfast</strong> · 8:00–10:30<br/>
          <strong>Lunch</strong> · 12:00–15:00<br/>
          <strong>Dinner</strong> · 18:00–22:00
        </div>
        <div style={{ background: C.forestLight, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: C.forest }}>
          💡 Prefer breakfast in bed? Order our Breakfast Basket (250 Kč/person) — delivered to your door by 9:00.
        </div>
      </BottomSheet>

      {/* Hiking */}
      <BottomSheet open={sheet === "hiking"} onClose={() => setSheet(null)} title="Hiking trails">
        {[
          { name: "River Walk", time: "30 min", diff: "Easy", desc: "Flat trail along the Ohře river" },
          { name: "Forest Loop", time: "1.5 hrs", diff: "Moderate", desc: "Through pine forest with scenic viewpoints" },
          { name: "Lookout Point", time: "2 hrs", diff: "Moderate", desc: "Climb to panoramic views of the valley" },
        ].map(t => (
          <div key={t.name} style={{ padding: "14px 0", borderBottom: `0.5px solid ${C.sep}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>🥾 {t.name}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <span style={{ padding: "2px 8px", borderRadius: 8, background: C.bg, fontSize: 11, color: C.sub }}>{t.time}</span>
                <span style={{ padding: "2px 8px", borderRadius: 8, background: C.bg, fontSize: 11, color: C.sub }}>{t.diff}</span>
              </div>
            </div>
            <div style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>{t.desc}</div>
          </div>
        ))}
      </BottomSheet>

      {/* Chat */}
      <BottomSheet open={sheet === "chat"} onClose={() => setSheet(null)} title="Chat with us">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 200, marginBottom: 12 }}>
          {chatMsgs.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.from === "guest" ? "flex-end" : "flex-start",
              maxWidth: "80%"
            }}>
              <div style={{
                padding: "10px 14px", borderRadius: 18,
                borderBottomRightRadius: m.from === "guest" ? 4 : 18,
                borderBottomLeftRadius: m.from === "host" ? 4 : 18,
                background: m.from === "guest" ? C.tint : C.bg,
                color: m.from === "guest" ? "#FFF" : C.text,
                fontSize: 14, lineHeight: 1.5
              }}>
                {m.text}
              </div>
              <div style={{ fontSize: 10, color: C.sub, marginTop: 3, textAlign: m.from === "guest" ? "right" : "left", padding: "0 4px" }}>{m.time}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat()}
            placeholder="Type a message..." style={{
              flex: 1, padding: "12px 16px", borderRadius: 22, border: `1px solid ${C.sep}`,
              fontSize: 14, fontFamily: "inherit", outline: "none", background: C.bg
            }} />
          <button onClick={sendChat} style={{
            width: 44, height: 44, borderRadius: "50%", border: "none",
            background: C.tint, color: "#FFF", fontSize: 18, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>↑</button>
        </div>
      </BottomSheet>

      {/* ════ BOTTOM TAB BAR ════ */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(255,255,255,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderTop: `0.5px solid ${C.sep}`,
        display: "flex", justifyContent: "space-around", padding: "6px 0 22px",
        maxWidth: 430, margin: "0 auto"
      }}>
        {[
          { id: "home", icon: "🏠", label: "Home" },
          { id: "services", icon: "✨", label: "Services" },
          { id: "explore", icon: "🗺", label: "Explore" },
          { id: "chat", icon: "💬", label: "Chat" },
        ].map(t => (
          <button key={t.id} onClick={() => t.id === "chat" ? setSheet("chat") : setTab(t.id)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            background: "none", border: "none", cursor: "pointer", padding: "4px 12px",
            fontFamily: "inherit"
          }}>
            <span style={{ fontSize: 22 }}>{t.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: tab === t.id && t.id !== "chat" ? C.tint : C.sub }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

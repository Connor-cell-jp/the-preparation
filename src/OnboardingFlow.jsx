import { useState } from 'react';
import { supabase, upsertUserDataRaw } from './supabase';

// ── Design tokens (matching App.jsx) ─────────────────────────────────────────
const T = {
  bg: "#0d1b2a",
  text: "#ffffff",
  textMid: "rgba(255,255,255,0.6)",
  textDim: "rgba(255,255,255,0.35)",
  textFaint: "rgba(255,255,255,0.2)",
  blue: "#3b82f6",
  red: "#ef4444",
  green: "#22c55e",
  border: "rgba(255,255,255,0.08)",
  borderLight: "rgba(255,255,255,0.12)",
  fontUI: "'DM Sans', -apple-system, sans-serif",
};

const gc = g => {
  const m = {
    Biology:"#16a34a", Physics:"#2563eb", Marketing:"#be185d", Sales:"#c2410c",
    Investing:"#b45309", Law:"#7c3aed", Literature:"#0369a1", "World History":"#c2410c",
    "American History":"#b91c1c", Art:"#9333ea", Geology:"#15803d", Chemistry:"#ca8a04",
    Pilot:"#0369a1", Welder:"#dc2626", Maker:"#059669", Philosophy:"#92400e",
    Nature:"#16a34a", Entrepreneur:"#c2410c", Accounting:"#64748b",
    Tinker:"#0891b2", Psychology:"#7c3aed", Chef:"#c2410c", Music:"#9333ea",
    Science:"#4f46e5", Meteorology:"#0369a1", Economics:"#d97706", Astronomy:"#6366f1",
  };
  if (!g) return "#64748b";
  for (const [k, v] of Object.entries(m)) if (g.toLowerCase() === k.toLowerCase()) return v;
  return "#64748b";
};

const SK_PROFILE   = "tp_profile2";
const SK_SETTINGS  = "tp_settings1";
const SK_ONBOARDING = "tp_onboarding_done";
const ALL_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const SUBJECTS = [
  "Biology","Physics","Chemistry","Astronomy","Geology","Meteorology","Science",
  "World History","American History",
  "Law","Economics","Investing","Accounting","Entrepreneur","Sales","Marketing",
  "Literature","Philosophy","Psychology","Art","Music",
  "Nature","Chef","Tinker","Maker","Pilot","Welder",
];

function saveData(key, value) {
  const raw = JSON.stringify(value);
  try { localStorage.setItem(key, raw); } catch {}
  upsertUserDataRaw(key, raw);
}

// ── CSS injected once ─────────────────────────────────────────────────────────
const ONBOARDING_CSS = `
  @keyframes obFadeUp {
    from { opacity:0; transform:translateY(18px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .ob-screen { animation: obFadeUp 0.32s cubic-bezier(0.4,0,0.2,1) both; }
  .ob-btn { transition: transform 0.08s cubic-bezier(0.4,0,0.2,1), opacity 0.15s; cursor:pointer; }
  .ob-btn:active { transform: scale(0.97); }
  .ob-tile { transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.08s; }
  .ob-tile:active { transform: scale(0.95); }
  .ob-input:focus {
    border-color: rgba(59,130,246,0.55) !important;
    box-shadow: 0 0 0 3px rgba(59,130,246,0.15) !important;
    outline: none;
  }
  .ob-input::placeholder { color: rgba(255,255,255,0.22); }
  input[type=range] { -webkit-appearance:none; appearance:none; height:4px; border-radius:2px;
    background: rgba(255,255,255,0.12); }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance:none; appearance:none; width:20px; height:20px;
    border-radius:50%; background:#3b82f6; cursor:pointer; border:none;
    box-shadow: 0 2px 8px rgba(59,130,246,0.5);
  }
  input[type=range]::-moz-range-thumb {
    width:20px; height:20px; border-radius:50%; background:#3b82f6;
    cursor:pointer; border:none;
  }
`;

// ── Background (matches MountainRange in App.jsx) ─────────────────────────────
function OnboardingBg() {
  return (
    <div style={{
      position:'fixed', top:0, left:0,
      width:'100%', height:'100dvh',
      zIndex:0, overflow:'hidden', pointerEvents:'none',
      background:'linear-gradient(180deg,#1a2e52 0%,#0f1e38 55%,#0d1b2a 100%)',
    }}>
      <svg
        style={{ position:'absolute', top:0, left:0, width:'100%', height:'38%', zIndex:1, display:'block' }}
        viewBox="0 0 1400 320" preserveAspectRatio="xMidYMid slice"
      >
        {[
          [55,18,2.1,0.88],[140,42,1.6,0.72],[270,14,1.9,0.84],[390,58,1.3,0.62],
          [510,22,2.0,0.80],[660,76,1.7,0.74],[780,28,1.5,0.90],[890,52,2.4,0.94],
          [1020,19,1.8,0.70],[1140,66,1.3,0.65],[1280,30,2.0,0.82],[220,88,1.5,0.68],
          [600,96,2.1,0.88],[860,88,1.6,0.78],[95,138,1.3,0.60],[380,118,1.7,0.74],
          [700,128,1.4,0.83],[980,108,2.0,0.68],[515,155,1.5,0.63],[185,175,1.8,0.78],
          [750,168,1.2,0.68],[330,198,2.1,0.88],[940,188,1.6,0.73],[135,228,1.4,0.68],
          [645,218,1.7,0.83],[470,248,1.2,0.60],[895,238,1.9,0.78],[1070,255,1.5,0.68],
          [70,275,2.1,0.88],[1350,282,1.3,0.63],[250,262,1.5,0.72],[1200,242,1.8,0.78],
        ].map(([cx,cy,r,o],i)=>(
          <circle key={i} cx={cx} cy={cy} r={r} fill="white" opacity={o}/>
        ))}
      </svg>
      <img
        src="/mountain.png" alt=""
        style={{
          position:'absolute', top:0, left:0,
          width:'100%', height:'65%',
          objectFit:'cover', objectPosition:'center 80%',
          mixBlendMode:'screen',
          filter:'brightness(0.8) sepia(0.4) saturate(1.5) hue-rotate(190deg)',
          zIndex:2, display:'block',
          maskImage:'linear-gradient(to bottom,black 0%,black 60%,transparent 100%)',
          WebkitMaskImage:'linear-gradient(to bottom,black 0%,black 60%,transparent 100%)',
        }}
      />
      {/* Dark overlay — gives backdrop-filter a flat surface to blur instead of the complex image */}
      <div style={{
        position:'absolute', top:0, left:0,
        width:'100%', height:'100%',
        background:'rgba(10,20,36,0.55)',
        zIndex:3,
        transform:'translateZ(0)',
        willChange:'transform',
      }} />
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────
const inputSt = {
  width:'100%',
  background:'rgba(255,255,255,0.06)',
  border:'1px solid rgba(255,255,255,0.12)',
  borderRadius:12,
  padding:'13px 14px',
  color:T.text, fontSize:16,
  boxSizing:'border-box',
  fontFamily:'inherit',
  outline:'none',
  WebkitAppearance:'none',
  transition:'border-color 0.2s, box-shadow 0.2s',
};

const cardSt = {
  background:'rgba(255,255,255,0.05)',
  border:'1px solid rgba(255,255,255,0.12)',
  borderRadius:20,
  padding:'26px 22px',
  backdropFilter:'blur(20px) saturate(180%)',
  WebkitBackdropFilter:'blur(20px) saturate(180%)',
  boxShadow:'0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)',
  transform:'translateZ(0)',
  willChange:'backdrop-filter',
};

function PrimaryBtn({ children, onClick, disabled, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="ob-btn"
      style={{
        width:'100%',
        background: disabled
          ? 'rgba(59,130,246,0.35)'
          : 'linear-gradient(135deg,#3b82f6 0%,#2563eb 100%)',
        border:'none', borderRadius:14,
        padding:'14px 0', color:'#fff',
        fontSize:15, fontWeight:800,
        cursor:(disabled||loading) ? 'default' : 'pointer',
        fontFamily:'inherit', minHeight:50,
        letterSpacing:0.2, userSelect:'none',
        boxShadow: disabled ? 'none' : '0 4px 16px rgba(59,130,246,0.35)',
      }}
    >
      {loading ? '…' : children}
    </button>
  );
}

function SecondaryBtn({ children, onClick }) {
  return (
    <button onClick={onClick} className="ob-btn" style={{
      width:'100%',
      background:'rgba(255,255,255,0.06)',
      border:'1px solid rgba(255,255,255,0.12)',
      borderRadius:14, padding:'14px 0',
      color:T.textMid, fontSize:15, fontWeight:700,
      cursor:'pointer', fontFamily:'inherit', minHeight:50,
      userSelect:'none',
    }}>
      {children}
    </button>
  );
}

function FieldLabel({ children }) {
  return (
    <div style={{ fontSize:10, color:T.textDim, fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, marginBottom:7 }}>
      {children}
    </div>
  );
}

function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)',
      borderRadius:10, padding:'10px 12px',
      fontSize:13, color:'#f87171', marginBottom:14, lineHeight:1.45,
    }}>
      {msg}
    </div>
  );
}

function InfoBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.25)',
      borderRadius:10, padding:'10px 12px',
      fontSize:13, color:T.blue, marginBottom:14, lineHeight:1.45,
    }}>
      {msg}
    </div>
  );
}

function BackLink({ onClick }) {
  return (
    <button onClick={onClick} style={{
      background:'none', border:'none', color:T.textDim,
      fontSize:13, cursor:'pointer', marginTop:16,
      width:'100%', fontFamily:'inherit', padding:'4px 0',
    }}>
      ← Back
    </button>
  );
}

// Progress dots shown on post-auth screens (steps 0–4 = screens 3–7)
function StepDots({ current }) {
  return (
    <div style={{ display:'flex', gap:6, justifyContent:'center', marginBottom:26 }}>
      {[0,1,2,3,4].map(i => (
        <div key={i} style={{
          width: i === current ? 22 : 6, height:6, borderRadius:3,
          background: i === current ? T.blue : 'rgba(255,255,255,0.18)',
          transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)',
        }} />
      ))}
    </div>
  );
}

function ScreenHeader({ eyebrow, title, subtitle }) {
  return (
    <div style={{ textAlign:'center', marginBottom:26 }}>
      {eyebrow && (
        <div style={{ fontSize:9, color:T.blue, letterSpacing:4, textTransform:'uppercase', fontWeight:700, marginBottom:10 }}>
          {eyebrow}
        </div>
      )}
      <div style={{ fontSize:24, fontWeight:800, color:T.text, letterSpacing:-0.4, lineHeight:1.25 }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize:14, color:T.textDim, marginTop:8, lineHeight:1.55 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ── Screen 1 — Welcome ────────────────────────────────────────────────────────
function WelcomeScreen({ onSignUp, onSignIn }) {
  return (
    <div className="ob-screen" style={{ width:'100%', maxWidth:380, margin:'0 auto' }}>
      <div style={{ textAlign:'center', marginBottom:52 }}>
        <div style={{ fontSize:9, color:T.blue, letterSpacing:4, textTransform:'uppercase', fontWeight:700, marginBottom:14 }}>
          The Preparation
        </div>
        <div style={{ fontSize:36, fontWeight:900, color:T.text, letterSpacing:-1, lineHeight:1.1, marginBottom:16 }}>
          A 4‑Year&nbsp;Self&#8209;Directed Education
        </div>
        <div style={{ fontSize:15, color:T.textMid, lineHeight:1.65 }}>
          Build a rigorous foundation across science, history, finance, philosophy, and the crafts — on your own terms.
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <PrimaryBtn onClick={onSignUp}>Create Account</PrimaryBtn>
        <SecondaryBtn onClick={onSignIn}>Sign In</SecondaryBtn>
      </div>
    </div>
  );
}

// ── Screen 'signin' — Sign In ─────────────────────────────────────────────────
function SignInScreen({ email, setEmail, password, setPassword, loading, error, onSignIn, onBack }) {
  return (
    <div className="ob-screen" style={{ width:'100%', maxWidth:380, margin:'0 auto' }}>
      <ScreenHeader
        eyebrow="Welcome back"
        title="Sign In"
        subtitle="Resume your preparation where you left off."
      />
      <div style={cardSt}>
        <div style={{ marginBottom:14 }}>
          <FieldLabel>Email</FieldLabel>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSignIn()}
            placeholder="you@example.com" autoComplete="email"
            className="ob-input" style={inputSt}
          />
        </div>
        <div style={{ marginBottom:20 }}>
          <FieldLabel>Password</FieldLabel>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSignIn()}
            placeholder="••••••••" autoComplete="current-password"
            className="ob-input" style={inputSt}
          />
        </div>
        <ErrorBox msg={error} />
        <PrimaryBtn onClick={onSignIn} loading={loading}>Sign In</PrimaryBtn>
        <BackLink onClick={onBack} />
      </div>
    </div>
  );
}

// ── Screen 2 — Create Account ─────────────────────────────────────────────────
function CreateAccountScreen({ email, setEmail, password, setPassword, loading, error, message, onSignUp, onBack }) {
  return (
    <div className="ob-screen" style={{ width:'100%', maxWidth:380, margin:'0 auto' }}>
      <ScreenHeader
        eyebrow="Step 1 of 6"
        title="Create Your Account"
        subtitle="Your progress syncs securely across all your devices."
      />
      <div style={cardSt}>
        <div style={{ marginBottom:14 }}>
          <FieldLabel>Email</FieldLabel>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" autoComplete="email"
            className="ob-input" style={inputSt}
          />
        </div>
        <div style={{ marginBottom:20 }}>
          <FieldLabel>Password</FieldLabel>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Min 6 characters" autoComplete="new-password"
            className="ob-input" style={inputSt}
          />
        </div>
        <ErrorBox msg={error} />
        <InfoBox msg={message} />
        <PrimaryBtn onClick={onSignUp} loading={loading}>Create Account</PrimaryBtn>
        <BackLink onClick={onBack} />
      </div>
    </div>
  );
}

// ── Screen 3 — Goals ──────────────────────────────────────────────────────────
function GoalsScreen({ goals, setGoals, onNext }) {
  return (
    <div className="ob-screen" style={{ width:'100%', maxWidth:480, margin:'0 auto' }}>
      <StepDots current={0} />
      <ScreenHeader
        eyebrow="Step 2 of 6 — About You"
        title="Why are you doing The Preparation?"
        subtitle="This shapes how your AI guide plans and advises you. Be honest — only you will see this."
      />
      <div style={cardSt}>
        <textarea
          value={goals}
          onChange={e => setGoals(e.target.value)}
          placeholder="e.g. I want to build a real intellectual foundation before starting a business. I feel like I missed out on a proper education and want to fix that on my own terms..."
          rows={5}
          className="ob-input"
          style={{
            ...inputSt,
            resize:'vertical', minHeight:130, lineHeight:1.6, display:'block',
          }}
        />
        <div style={{ fontSize:11, color:goals.length > 0 ? T.textDim : T.textFaint, marginTop:8, marginBottom:20 }}>
          {goals.trim().length > 0 ? `${goals.length} characters` : 'Required — the more specific, the better'}
        </div>
        <PrimaryBtn onClick={onNext} disabled={goals.trim().length === 0}>
          Continue
        </PrimaryBtn>
      </div>
    </div>
  );
}

// ── Screen 4 — Weekly Availability ───────────────────────────────────────────
function ScheduleScreen({ weeklyTarget, setWeeklyTarget, activeDays, setActiveDays, onNext, onBack }) {
  const toggleDay = day =>
    setActiveDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);

  const dailyHrs = activeDays.length > 0
    ? (weeklyTarget / activeDays.length).toFixed(1)
    : '—';

  return (
    <div className="ob-screen" style={{ width:'100%', maxWidth:460, margin:'0 auto' }}>
      <StepDots current={1} />
      <ScreenHeader
        eyebrow="Step 3 of 6 — Your Schedule"
        title="Weekly Availability"
        subtitle="Set your weekly hour target and which days you study. You can always adjust this."
      />
      <div style={cardSt}>
        {/* Hour slider */}
        <div style={{ marginBottom:28 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:10 }}>
            <FieldLabel>Weekly Hours</FieldLabel>
            <div style={{ fontSize:24, fontWeight:900, color:T.blue, lineHeight:1 }}>
              {weeklyTarget}h
            </div>
          </div>
          <input
            type="range" min={5} max={45} step={1}
            value={weeklyTarget}
            onChange={e => setWeeklyTarget(Number(e.target.value))}
            style={{ width:'100%', cursor:'pointer', accentColor:T.blue }}
          />
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
            <span style={{ fontSize:11, color:T.textFaint }}>5h</span>
            <span style={{ fontSize:11, color:T.textDim }}>
              ≈ {dailyHrs}h/day on {activeDays.length} active day{activeDays.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize:11, color:T.textFaint }}>45h</span>
          </div>
        </div>

        {/* Day toggles */}
        <div style={{ marginBottom:26 }}>
          <FieldLabel>Study Days</FieldLabel>
          <div style={{ display:'flex', gap:6, marginTop:8 }}>
            {ALL_DAYS.map(day => {
              const on = activeDays.includes(day);
              return (
                <button key={day} onClick={() => toggleDay(day)} className="ob-btn ob-tile" style={{
                  flex:'1 1 0',
                  padding:'10px 4px',
                  borderRadius:10,
                  border: on ? `1px solid ${T.blue}` : '1px solid rgba(255,255,255,0.09)',
                  background: on ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)',
                  color: on ? T.blue : T.textDim,
                  fontSize:12, fontWeight: on ? 700 : 500,
                  cursor:'pointer', fontFamily:'inherit', userSelect:'none',
                }}>
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <PrimaryBtn onClick={onNext}>Continue</PrimaryBtn>
        <BackLink onClick={onBack} />
      </div>
    </div>
  );
}

// ── Screen 5 — Subject Interests ──────────────────────────────────────────────
function SubjectsScreen({ selectedSubjects, setSelectedSubjects, onNext, onBack }) {
  const toggle = genre =>
    setSelectedSubjects(prev =>
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    );

  return (
    <div className="ob-screen" style={{ width:'100%', maxWidth:520, margin:'0 auto' }}>
      <StepDots current={2} />
      <ScreenHeader
        eyebrow="Step 4 of 6 — Your Interests"
        title="What subjects excite you most?"
        subtitle="Select anything that genuinely interests you. This informs AI prioritization and suggestions."
      />
      <div style={{ ...cardSt, padding:'20px 18px' }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:22 }}>
          {SUBJECTS.map(genre => {
            const on = selectedSubjects.includes(genre);
            const color = gc(genre);
            return (
              <button
                key={genre}
                onClick={() => toggle(genre)}
                className="ob-btn ob-tile"
                style={{
                  padding:'8px 14px',
                  borderRadius:22,
                  border: on ? `1px solid ${color}88` : '1px solid rgba(255,255,255,0.09)',
                  background: on ? `${color}22` : 'rgba(255,255,255,0.04)',
                  color: on ? color : T.textDim,
                  fontSize:13, fontWeight: on ? 700 : 500,
                  cursor:'pointer', fontFamily:'inherit', userSelect:'none',
                  whiteSpace:'nowrap',
                }}
              >
                {genre}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize:12, color:T.textFaint, marginBottom:18, minHeight:16 }}>
          {selectedSubjects.length > 0
            ? `${selectedSubjects.length} selected`
            : 'Select at least one, or skip — you can update this later'}
        </div>
        <PrimaryBtn onClick={onNext}>Continue</PrimaryBtn>
        <BackLink onClick={onBack} />
      </div>
    </div>
  );
}

// ── Screen 6 — Study Style ────────────────────────────────────────────────────
function StudyStyleScreen({ timeOfDay, setTimeOfDay, sessionLength, setSessionLength, onNext, onBack }) {
  const timeOpts = [
    { value:'morning',  label:'Morning',  sub:'Focus before noon' },
    { value:'evening',  label:'Evening',  sub:'Night owl sessions' },
    { value:'flexible', label:'Flexible', sub:'Whenever fits the day' },
  ];
  const lenOpts = [
    { value:'short', label:'Short', sub:'20–45 min focused bursts' },
    { value:'mixed', label:'Mixed', sub:'Varies by mood & material' },
    { value:'long',  label:'Long',  sub:'90 min+ deep sessions' },
  ];

  const OptionRow = ({ opts, selected, onSelect }) => (
    <div style={{ display:'flex', gap:8, marginBottom:22 }}>
      {opts.map(o => (
        <button key={o.value} onClick={() => onSelect(o.value)} className="ob-btn ob-tile" style={{
          flex:1, padding:'12px 8px', borderRadius:12, textAlign:'center',
          border: selected === o.value ? `1px solid ${T.blue}` : '1px solid rgba(255,255,255,0.09)',
          background: selected === o.value ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
          color: selected === o.value ? T.text : T.textMid,
          cursor:'pointer', fontFamily:'inherit', userSelect:'none',
        }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:5 }}>{o.label}</div>
          <div style={{ fontSize:10, color: selected === o.value ? T.textMid : T.textDim, lineHeight:1.3 }}>
            {o.sub}
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div className="ob-screen" style={{ width:'100%', maxWidth:460, margin:'0 auto' }}>
      <StepDots current={3} />
      <ScreenHeader
        eyebrow="Step 5 of 6 — Study Style"
        title="How do you study best?"
        subtitle="Helps the planner schedule sessions you'll actually stick to."
      />
      <div style={cardSt}>
        <FieldLabel>Best time of day</FieldLabel>
        <OptionRow opts={timeOpts} selected={timeOfDay} onSelect={setTimeOfDay} />
        <FieldLabel>Preferred session length</FieldLabel>
        <OptionRow opts={lenOpts} selected={sessionLength} onSelect={setSessionLength} />
        <PrimaryBtn onClick={onNext}>Continue</PrimaryBtn>
        <BackLink onClick={onBack} />
      </div>
    </div>
  );
}

// ── Screen 7 — Ready ──────────────────────────────────────────────────────────
function ReadyScreen({ goals, weeklyTarget, activeDays, selectedSubjects, timeOfDay, sessionLength, onEnter }) {
  const styleMap = { morning:'morning focus', evening:'evening study', flexible:'flexible schedule' };
  const lenMap   = { short:'short sessions', mixed:'mixed session lengths', long:'long deep work' };

  const summaryRows = [
    goals.trim() && { label:'Goal', text: goals.length > 90 ? goals.slice(0,90)+'…' : goals },
    { label:'Schedule', text:`${weeklyTarget}h/week · ${activeDays.length} day${activeDays.length !== 1 ? 's' : ''} active` },
    selectedSubjects.length > 0 && {
      label:'Interests',
      text: selectedSubjects.slice(0,5).join(', ') + (selectedSubjects.length > 5 ? ` +${selectedSubjects.length-5} more` : ''),
    },
    { label:'Style', text:`${styleMap[timeOfDay] ?? timeOfDay}, ${lenMap[sessionLength] ?? sessionLength}` },
  ].filter(Boolean);

  return (
    <div className="ob-screen" style={{ width:'100%', maxWidth:420, margin:'0 auto' }}>
      <StepDots current={4} />
      <div style={{ textAlign:'center', marginBottom:30 }}>
        <div style={{ fontSize:44, marginBottom:14 }}>🧭</div>
        <div style={{ fontSize:9, color:T.blue, letterSpacing:4, textTransform:'uppercase', fontWeight:700, marginBottom:10 }}>
          You're ready
        </div>
        <div style={{ fontSize:24, fontWeight:800, color:T.text, letterSpacing:-0.4, lineHeight:1.2 }}>
          Your preparation begins.
        </div>
        <div style={{ fontSize:14, color:T.textDim, marginTop:8 }}>
          Here's what's been set up for you.
        </div>
      </div>
      <div style={{ ...cardSt, marginBottom:20 }}>
        {summaryRows.map((row, i) => (
          <div key={i} style={{
            paddingBottom: i < summaryRows.length-1 ? 14 : 0,
            marginBottom:  i < summaryRows.length-1 ? 14 : 0,
            borderBottom:  i < summaryRows.length-1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
          }}>
            <div style={{ fontSize:9, color:T.textDim, fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, marginBottom:4 }}>
              {row.label}
            </div>
            <div style={{ fontSize:14, color:T.textMid, lineHeight:1.45 }}>
              {row.text}
            </div>
          </div>
        ))}
      </div>
      <PrimaryBtn onClick={onEnter}>Enter The Preparation →</PrimaryBtn>
    </div>
  );
}

// ── Main OnboardingFlow ───────────────────────────────────────────────────────
export default function OnboardingFlow({ preAuth, onComplete }) {
  // If preAuth=true, user is not yet authenticated — show all 7 screens.
  // If preAuth=false, user is already authenticated — start at goals (screen 3).
  const [screen, setScreen] = useState(preAuth ? 'welcome' : 'goals');

  // Auth fields (screens 1-2, signin)
  const [authEmail,    setAuthEmail]    = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading,  setAuthLoading]  = useState(false);
  const [authError,    setAuthError]    = useState('');
  const [authMessage,  setAuthMessage]  = useState('');

  // Profile / settings
  const [goals,            setGoals]            = useState(() => {
    try { return JSON.parse(localStorage.getItem(SK_PROFILE))?.goals || ''; } catch { return ''; }
  });
  const [weeklyTarget,     setWeeklyTarget]     = useState(() => {
    try { return JSON.parse(localStorage.getItem(SK_SETTINGS))?.weeklyTarget ?? 20; } catch { return 20; }
  });
  const [activeDays,       setActiveDays]       = useState(() => {
    try { return JSON.parse(localStorage.getItem(SK_SETTINGS))?.activeDays || [...ALL_DAYS]; } catch { return [...ALL_DAYS]; }
  });
  const [selectedSubjects, setSelectedSubjects] = useState(() => {
    try {
      const sl = JSON.parse(localStorage.getItem(SK_PROFILE))?.subjectsLove || '';
      return sl ? sl.split(', ').filter(s => SUBJECTS.includes(s)) : [];
    } catch { return []; }
  });
  const [timeOfDay,        setTimeOfDay]        = useState(() => {
    try { return JSON.parse(localStorage.getItem(SK_PROFILE))?.studyStyle?.timeOfDay || 'flexible'; } catch { return 'flexible'; }
  });
  const [sessionLength,    setSessionLength]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(SK_PROFILE))?.studyStyle?.sessionLength || 'mixed'; } catch { return 'mixed'; }
  });

  const go = s => { window.scrollTo(0,0); setScreen(s); };

  // ── Auth handlers ────────────────────────────────────────────────────────────
  const handleSignUp = async () => {
    if (!authEmail || !authPassword) { setAuthError('Enter email and password'); return; }
    if (authPassword.length < 6) { setAuthError('Password must be at least 6 characters'); return; }
    setAuthLoading(true); setAuthError(''); setAuthMessage('');
    const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
    if (error) {
      setAuthError(error.message);
      setAuthLoading(false);
    } else if (!data?.session) {
      // Email confirmation required
      setAuthMessage('Check your email to confirm your account, then come back and sign in to finish setup.');
      setAuthLoading(false);
    }
    // If data.session exists: onAuthStateChange fires in main.jsx → status → 'onboarding'
    // This component remounts as preAuth=false, starting at 'goals'. Spinner stays until then.
  };

  const handleSignIn = async () => {
    if (!authEmail || !authPassword) { setAuthError('Enter email and password'); return; }
    setAuthLoading(true); setAuthError(''); setAuthMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) {
      setAuthError(error.message);
      setAuthLoading(false);
    }
    // On success: main.jsx's onAuthStateChange fires → routes to app or onboarding screen 3
  };

  // ── Complete handler — saves all data, marks done ────────────────────────────
  const handleComplete = () => {
    saveData(SK_PROFILE, {
      goals,
      subjectsLove: selectedSubjects.join(', '),
      subjectsHard: '',
      studyStyle: { timeOfDay, sessionLength },
      lifeContext: '',
      aiInsights: [],
    });
    saveData(SK_SETTINGS, { weeklyTarget, activeDays });
    try { localStorage.setItem(SK_ONBOARDING, '1'); } catch {}
    upsertUserDataRaw(SK_ONBOARDING, '1');
    onComplete();
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const renderScreen = () => {
    switch (screen) {
      case 'welcome':
        return (
          <WelcomeScreen
            onSignUp={() => { setAuthError(''); setAuthMessage(''); go('createaccount'); }}
            onSignIn={() => { setAuthError(''); setAuthMessage(''); go('signin'); }}
          />
        );
      case 'signin':
        return (
          <SignInScreen
            email={authEmail} setEmail={setAuthEmail}
            password={authPassword} setPassword={setAuthPassword}
            loading={authLoading} error={authError}
            onSignIn={handleSignIn}
            onBack={() => { setAuthError(''); go('welcome'); }}
          />
        );
      case 'createaccount':
        return (
          <CreateAccountScreen
            email={authEmail} setEmail={setAuthEmail}
            password={authPassword} setPassword={setAuthPassword}
            loading={authLoading} error={authError} message={authMessage}
            onSignUp={handleSignUp}
            onBack={() => { setAuthError(''); go('welcome'); }}
          />
        );
      case 'goals':
        return (
          <GoalsScreen
            goals={goals} setGoals={setGoals}
            onNext={() => go('schedule')}
          />
        );
      case 'schedule':
        return (
          <ScheduleScreen
            weeklyTarget={weeklyTarget} setWeeklyTarget={setWeeklyTarget}
            activeDays={activeDays} setActiveDays={setActiveDays}
            onNext={() => go('subjects')}
            onBack={() => go('goals')}
          />
        );
      case 'subjects':
        return (
          <SubjectsScreen
            selectedSubjects={selectedSubjects} setSelectedSubjects={setSelectedSubjects}
            onNext={() => go('studystyle')}
            onBack={() => go('schedule')}
          />
        );
      case 'studystyle':
        return (
          <StudyStyleScreen
            timeOfDay={timeOfDay} setTimeOfDay={setTimeOfDay}
            sessionLength={sessionLength} setSessionLength={setSessionLength}
            onNext={() => go('ready')}
            onBack={() => go('subjects')}
          />
        );
      case 'ready':
        return (
          <ReadyScreen
            goals={goals} weeklyTarget={weeklyTarget} activeDays={activeDays}
            selectedSubjects={selectedSubjects} timeOfDay={timeOfDay} sessionLength={sessionLength}
            onEnter={handleComplete}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ minHeight:'100dvh', position:'relative', fontFamily:T.fontUI }}>
      <style>{ONBOARDING_CSS}</style>
      <OnboardingBg />
      <div style={{
        position:'relative', zIndex:1,
        minHeight:'100dvh',
        display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        padding:'48px 20px',
        paddingTop:'max(48px, calc(env(safe-area-inset-top) + 24px))',
        paddingBottom:'max(48px, calc(env(safe-area-inset-bottom) + 24px))',
      }}>
        {renderScreen()}
      </div>
    </div>
  );
}

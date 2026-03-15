import { useState, useEffect, useRef, useCallback } from "react";

// ── Settings-aware pure helpers ───────────────────────────────────────────────
const snap25 = h => Math.round(h * 4) / 4;
const contentToReal = (item, contentH, s) =>
  item.type === "course" ? contentH * (s?.courseRatio ?? 2) : contentH * (s?.bookRatio ?? 1);
const realToContent = (item, realH, s) =>
  item.type === "course" ? realH / (s?.courseRatio ?? 2) : realH / (s?.bookRatio ?? 1);
// Course max session derived automatically from weekly target tier — never user-configurable
const getCourseMaxSession = (weeklyTarget) => {
  if (weeklyTarget <= 10) return 1.5;
  if (weeklyTarget <= 20) return 2.0;
  if (weeklyTarget <= 30) return 2.5;
  return 3.0; // 31–45h
};
// Daily max hours derived from weekly target tier — replaces flat 8h cap
const getDailyMax = (weeklyTarget) => {
  if (weeklyTarget <= 10) return 2.5;
  if (weeklyTarget <= 15) return 3;
  if (weeklyTarget <= 20) return 4;
  if (weeklyTarget <= 25) return 5;
  if (weeklyTarget <= 30) return 6;
  if (weeklyTarget <= 35) return 7;
  return 8; // 36–45h
};
const maxRealPerSession = (item, s) => {
  if (item.type === "book" && item.mode) {
    if (item.mode === "passage") return 0.5;
    if (item.mode === "slow")    return 1.0;
    if (item.mode === "normal")  return 1.5;
    if (item.mode === "fast")    return 2.0;
  }
  if (item.type === "course") return getCourseMaxSession(s?.weeklyTarget ?? 20);
  return 2.0;
};
const realHoursRemaining = (item, p, s) => {
  const contentLeft = Math.max(0, (item.hours || 0) - (p.courseHoursComplete || 0));
  return contentToReal(item, contentLeft, s);
};
const targetPctAfterSession = (item, p, sessionRealH, s) => {
  const contentDone = p.courseHoursComplete || 0;
  const contentGain = realToContent(item, sessionRealH, s);
  const newContent = Math.min(contentDone + contentGain, item.hours || 1);
  return Math.floor((newContent / (item.hours || 1)) * 100);
};
// Front-load: Day 1 up to 1.5x avg, Day 2 up to 1.25x avg, rest share equally. All days capped at getDailyMax.
const distributeDays = (totalH, dayNames, weeklyTarget) => {
  const n = dayNames.length;
  if (n === 0) return [];
  const dailyMax = getDailyMax(weeklyTarget);
  const avg = totalH / n;
  const budgets = [];
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    let h;
    if (i === 0) h = Math.min(avg * 1.5, dailyMax);
    else if (i === 1) h = Math.min(avg * 1.25, dailyMax);
    else {
      const remaining = totalH - allocated;
      const daysLeft = n - i;
      h = Math.min(remaining / daysLeft, dailyMax);
    }
    h = snap25(Math.max(0, Math.min(h, dailyMax, totalH - allocated)));
    budgets.push(h);
    allocated += h;
    if (allocated >= totalH) {
      while (budgets.length < n) budgets.push(0);
      break;
    }
  }
  return budgets;
};
const scaleDayItems = (items, dayBudget, getCurrItem, getP, s) => {
  if (!items.length) return items;
  const rawSum = parseFloat(items.reduce((sum, it) => sum + (it.realHours || 0), 0).toFixed(2));
  const scale = rawSum > 0 ? dayBudget / rawSum : 1;
  let scaled = items.map(it => {
    const r = snap25(it.realHours * scale);
    const ci = getCurrItem(it.id);
    const ch = ci ? parseFloat(realToContent(ci, r, s).toFixed(3)) : r;
    const tgt = ci ? targetPctAfterSession(ci, getP(it.id), r, s) : it.targetPct;
    return { ...it, realHours: r, contentHours: ch, targetPct: tgt };
  });
  const snappedSum = parseFloat(scaled.reduce((sum, it) => sum + (it.realHours || 0), 0).toFixed(2));
  const gap = parseFloat((dayBudget - snappedSum).toFixed(2));
  if (Math.abs(gap) >= 0.05) {
    const last = scaled[scaled.length - 1];
    const adj = Math.max(0.25, snap25(last.realHours + gap));
    const ci = getCurrItem(last.id);
    const ch = ci ? parseFloat(realToContent(ci, adj, s).toFixed(3)) : adj;
    const tgt = ci ? targetPctAfterSession(ci, getP(last.id), adj, s) : last.targetPct;
    scaled[scaled.length - 1] = { ...last, realHours: adj, contentHours: ch, targetPct: tgt };
  }
  return scaled;
};

// ── Cognitive demand ranking (lower = schedule earlier / front-load more) ─────
const COURSE_DEMAND_MAP = {
  Physics:0, Biology:1, Chemistry:2, Mathematics:3,
  Meteorology:2, Science:2, Geology:3, Astronomy:4,
  Pilot:3, Welder:3, Maker:3, Tinker:3,
  History:5, "World History":5, "American History":5,
  Philosophy:6, Literature:7, Psychology:7,
  Business:8, Sales:8, Marketing:8, Investing:8, Law:8,
  Economics:8, Accounting:8, Entrepreneur:8,
  Art:9, Music:9, "Music Theory":9, Chef:9, Nature:9,
};
const getCourseDemandOrder = genre => COURSE_DEMAND_MAP[genre] ?? 6;

// Re-sort day sessions after AI response: passage → courses by demand → books
const sortDaySessions = (items, curriculum) => [...items].sort((a, b) => {
  const rank = id => {
    const item = curriculum.find(c => c.id === id);
    if (!item) return 99;
    if (item.mode === "passage") return 0;
    if (item.type === "course") return 10 + getCourseDemandOrder(item.genre);
    return 50; // books (paired then free — further sorting not needed here)
  };
  return rank(a.id) - rank(b.id);
});

// Validate plan against hard rules — returns array of error strings
const validatePlanRules = (days, curriculum, progressMap, focusIds, maxCourses, maxBooks, weeklyTarget) => {
  const errs = [];
  const dailyMax = getDailyMax(weeklyTarget ?? 20);
  let prevDayCourseIds = new Set();
  const dayNamesSeen = new Set();
  for (const day of days) {
    if (dayNamesSeen.has(day.day)) { errs.push(`Duplicate day: ${day.day}`); continue; }
    dayNamesSeen.add(day.day);
    const items = day.items || [];
    const dayTotal = parseFloat(items.reduce((s, it) => s + (it.realHours || 0), 0).toFixed(2));
    if (dayTotal > dailyMax + 0.01) errs.push(`Day ${day.day}: ${dayTotal}h exceeds ${dailyMax}h cap`);
    const dayCourseIds = new Set();
    for (const it of items) {
      const item = curriculum.find(c => c.id === it.id);
      if (!item) { errs.push(`Unknown ID: ${it.id}`); continue; }
      if ((progressMap[it.id]?.percentComplete || 0) >= 100) errs.push(`${it.id} already complete`);
      if (item.mode === "passage" && (it.realHours || 0) > 0.51) errs.push(`${it.id} passage session ${it.realHours}h > 0.5h hard cap`);
      if (item.type === "course") {
        if (prevDayCourseIds.has(it.id)) errs.push(`${it.id} scheduled on consecutive days`);
        dayCourseIds.add(it.id);
      }
    }
    prevDayCourseIds = dayCourseIds;
  }
  return errs;
};

// Normalize AI response (new or old schema) to internal { day, items, totalDayRealH } format
const normalizeParsedDays = (parsedDays, remainingDayNames) =>
  (parsedDays || []).map((day, i) => {
    const dayShort = day.day || (day.dayName ? day.dayName.slice(0, 3) : remainingDayNames[i] || "");
    const rawItems = day.items || day.sessions || [];
    const items = rawItems.map(s => ({
      id: s.id || s.itemId || "",
      realHours: s.realHours || s.sessionHours || 0,
      contentHours: s.contentHours || 0,
      targetPct: s.targetPct || 0,
    })).filter(s => s.id);
    return { day: dayShort, items, totalDayRealH: day.totalDayRealH || day.totalHours || 0 };
  });

// Build pre-computed scheduling context passed to AI as structured data
const buildSchedulingContext = (curriculum, progressMap, focusIds, settings, weeklyTarget, remainingDayNames, dayBudgets, dailyMaxHours, remainingCapacity) => ({
  weeklyHours: weeklyTarget,
  dailyMaxHours,
  remainingCapacity,
  activeDaysRemaining: remainingDayNames.length,
  totalAvailableHours: parseFloat(dayBudgets.reduce((s, h) => s + h, 0).toFixed(2)),
  courseMaxSession: getCourseMaxSession(weeklyTarget),
  dayBudgets: remainingDayNames.map((d, i) => ({ day: d, budget: dayBudgets[i] })),
  items: focusIds.map(id => {
    const item = curriculum.find(c => c.id === id);
    if (!item) return null;
    const p = progressMap[id] || { hoursSpent:0, courseHoursComplete:0, percentComplete:0, sessions:[] };
    const contentLeft = Math.max(0, (item.hours || 0) - (p.courseHoursComplete || 0));
    const realLeft = contentToReal(item, contentLeft, settings);
    const sessionMax = maxRealPerSession(item, settings);
    const isPassage = item.mode === "passage";
    return {
      id: item.id, name: item.name, type: item.type,
      mode: item.mode || null, genre: item.genre, section: item.section,
      percentComplete: p.percentComplete,
      hoursRemaining: parseFloat(contentLeft.toFixed(2)),
      realHoursRemaining: parseFloat(realLeft.toFixed(2)),
      sessionsToFinish: isPassage ? 999 : Math.ceil(realLeft / Math.max(sessionMax, 0.5)),
      maxSessionLength: sessionMax, minSessionLength: 0.5,
      demandOrder: getCourseDemandOrder(item.genre),
      isPassage,
      isPairedCandidate: item.type === "book" && !isPassage,
      isFreeCandidate: item.type === "book" && !isPassage,
    };
  }).filter(Boolean),
});

// ── Book genres remapped to match course categories ───────────────────────────
const BASE_CURRICULUM = [
{id:"A1",name:"Biology and Human Behavior",hours:12,type:"course",section:"Core",genre:"Biology"},
{id:"A2",name:"Medical School: Emergency Medicine",hours:12,type:"course",section:"Core",genre:"Biology"},
{id:"A3",name:"Medical School: Grand Rounds Cases",hours:12,type:"course",section:"Core",genre:"Biology"},
{id:"A4",name:"The Science of Flight",hours:15,type:"course",section:"Core",genre:"Physics"},
{id:"A5",name:"The Science of Extreme Weather",hours:12,type:"course",section:"Core",genre:"Meteorology"},
{id:"A6",name:"A History of the United States 2nd Ed",hours:42,type:"course",section:"Core",genre:"American History"},
{id:"A7",name:"The America West",hours:12,type:"course",section:"Core",genre:"American History"},
{id:"A8",name:"Trials West: How Freedom Settled The West",hours:15,type:"course",section:"Core",genre:"American History"},
{id:"A9",name:"Skeptics Guide to American History",hours:12,type:"course",section:"Core",genre:"American History"},
{id:"A10",name:"The Big History of Civilizations",hours:13,type:"course",section:"Core",genre:"World History"},
{id:"A11",name:"Understanding The Worlds Greatest Structures",hours:13,type:"course",section:"Core",genre:"World History"},
{id:"A12",name:"Understanding Greek and Roman Technology",hours:12,type:"course",section:"Core",genre:"World History"},
{id:"A13",name:"The Rise of the Novel",hours:12,type:"course",section:"Core",genre:"Literature"},
{id:"A14",name:"The Rise and Fall of the Roman Republic",hours:7,type:"course",section:"Core",genre:"World History"},
{id:"A15",name:"The Italian Renaissance",hours:18,type:"course",section:"Core",genre:"World History"},
{id:"A16",name:"How To Look At And Understand Great Art",hours:13,type:"course",section:"Core",genre:"Art"},
{id:"A17",name:"European Paintings: Leonardo to Rembrandt",hours:14,type:"course",section:"Core",genre:"Art"},
{id:"A18",name:"A History of European Art",hours:25,type:"course",section:"Core",genre:"Art"},
{id:"A19",name:"Geology Series by Nick Zentner",hours:30,type:"course",section:"Core",genre:"Geology"},
{id:"A20",name:"Planet Earth and You",hours:41,type:"course",section:"Core",genre:"Geology"},
{id:"A21",name:"Practical Geology",hours:12,type:"course",section:"Core",genre:"Geology"},
{id:"A22",name:"Law School: Contracts",hours:7,type:"course",section:"Core",genre:"Law"},
{id:"A23",name:"Argumentation: Effective Reasoning",hours:12,type:"course",section:"Core",genre:"Law"},
{id:"A24",name:"Successful Negotiation",hours:17,type:"course",section:"Core",genre:"Law"},
{id:"A25",name:"Malcolm Gladwell Teaches Writing",hours:4,type:"course",section:"Core",genre:"Literature"},
{id:"A26",name:"History of the English Language",hours:13,type:"course",section:"Core",genre:"Literature"},
{id:"A27",name:"Foundations of Western Civilization",hours:24,type:"course",section:"Core",genre:"World History"},
{id:"A28",name:"The Science of Energy",hours:14,type:"course",section:"Core",genre:"Physics"},
{id:"A29",name:"Pre-U Calc, Physics, Chemistry",hours:100,type:"course",section:"Core",genre:"Physics"},
{id:"A30",name:"Understanding the Human Body",hours:24,type:"course",section:"Core",genre:"Biology"},
{id:"A31",name:"Masters of War",hours:12,type:"course",section:"Core",genre:"World History"},
{id:"A32",name:"Foundations of Eastern Civilization",hours:24,type:"course",section:"Core",genre:"World History"},
{id:"A33",name:"History of the Ancient World",hours:24,type:"course",section:"Core",genre:"World History"},
{id:"A34",name:"Life Lessons From the Great Books",hours:13,type:"course",section:"Core",genre:"Literature"},
{id:"A35",name:"Our Night Sky",hours:6,type:"course",section:"Core",genre:"Astronomy"},
{id:"A36",name:"The Natural Navigator",hours:6,type:"course",section:"Core",genre:"Astronomy"},
{id:"A37",name:"Introduction to Celestial Navigation for Mariners",hours:2,type:"course",section:"Core",genre:"Astronomy"},
{id:"A38",name:"Everyday Engineering: Understanding the Marvels of Daily Life",hours:18,type:"course",section:"Core",genre:"Physics"},
{id:"A39",name:"The Evidence of Modern Physics",hours:12,type:"course",section:"Core",genre:"Physics"},
{id:"A40",name:"Heroes and Legends: The Most Influencial Characters of Literature",hours:12,type:"course",section:"Core",genre:"Literature"},
{id:"A41",name:"Foraging Wild Mushrooms",hours:20,type:"course",section:"Core",genre:"Biology"},
{id:"A42",name:"Music Theory Comprehensive Complete Part 1, 2, & 3",hours:12,type:"course",section:"Core",genre:"Music Theory"},
{id:"A43",name:"How to Listen to Great Music",hours:36,type:"course",section:"Core",genre:"Music"},
{id:"A44",name:"Music as a Mirror of History",hours:12,type:"course",section:"Core",genre:"Music"},
{id:"A45",name:"Classical Music Guide",hours:36,type:"course",section:"Core",genre:"Music"},
{id:"A46",name:"Modern Marketing with Seth Godin",hours:6,type:"course",section:"Core",genre:"Marketing"},
{id:"A47",name:"Sales Training: Practical Techniques",hours:3,type:"course",section:"Core",genre:"Sales"},
{id:"A48",name:"Social Media Marketing Masterclass",hours:11,type:"course",section:"Core",genre:"Marketing"},
{id:"A49",name:"Stock Market Investing for Beginners",hours:10,type:"course",section:"Core",genre:"Investing"},
{id:"A50",name:"Investing In Stocks: The Complete Course",hours:18,type:"course",section:"Core",genre:"Investing"},
{id:"A51",name:"The Art of Investing",hours:12,type:"course",section:"Core",genre:"Investing"},
{id:"A52",name:"Complete Financial Analyst Course",hours:22,type:"course",section:"Core",genre:"Accounting"},
{id:"A53",name:"Prototyping with AI Bootcamp",hours:22,type:"course",section:"Core",genre:"Tinker"},
{id:"A54",name:"Python for Beginners",hours:15,type:"course",section:"Core",genre:"Tinker"},
{id:"A55",name:"AI Builders Bootcamp",hours:20,type:"course",section:"Core",genre:"Tinker"},
{id:"A56",name:"Autodesk Fusion 360",hours:11,type:"course",section:"Core",genre:"Tinker"},
{id:"A57",name:"Intro to CAD, CAM, CNC Machining",hours:15,type:"course",section:"Core",genre:"Tinker"},
{id:"A58",name:"CAD and CAM for Milling and Turning",hours:11,type:"course",section:"Core",genre:"Tinker"},
{id:"A59",name:"3D Modeling on Fusion 360",hours:4,type:"course",section:"Core",genre:"Tinker"},
{id:"A60",name:"Chemistry 2nd",hours:18,type:"course",section:"Optional",genre:"Chemistry"},
{id:"A61",name:"The Nature of Matter",hours:12,type:"course",section:"Optional",genre:"Chemistry"},
{id:"A62",name:"Chemistry and Our Universe",hours:28,type:"course",section:"Optional",genre:"Chemistry"},
{id:"A63",name:"Foundations of Organic Chemistry",hours:18,type:"course",section:"Optional",genre:"Chemistry"},
{id:"A64",name:"Science and Cooking",hours:104,type:"course",section:"Optional",genre:"Chemistry"},
{id:"A65",name:"How Things Work: Intro to Physics",hours:14,type:"course",section:"Optional",genre:"Physics"},
{id:"A66",name:"Physics and Our Universe",hours:30,type:"course",section:"Optional",genre:"Physics"},
{id:"A67",name:"Introduction to Engineering Mechanics",hours:14,type:"course",section:"Optional",genre:"Physics"},
{id:"A68",name:"Fundamentals In Flight Mechanics",hours:10,type:"course",section:"Optional",genre:"Pilot"},
{id:"A69",name:"Introduction to Aeronautical Engineering",hours:50,type:"course",section:"Optional",genre:"Pilot"},
{id:"A70",name:"Introduction to Aerodynamics",hours:150,type:"course",section:"Optional",genre:"Pilot"},
{id:"A71",name:"The Joy of Science",hours:30,type:"course",section:"Optional",genre:"Science"},
{id:"A72",name:"Great Ideas of Classical Physics",hours:12,type:"course",section:"Optional",genre:"Physics"},
{id:"A73",name:"Impossible: Physics Beyond the Edge",hours:12,type:"course",section:"Optional",genre:"Physics"},
{id:"A74",name:"Principles of Welding",hours:5,type:"course",section:"Optional",genre:"Welder"},
{id:"A75",name:"Practical Welding Technology",hours:10,type:"course",section:"Optional",genre:"Welder"},
{id:"A76",name:"Elements of Metallurgy",hours:16,type:"course",section:"Optional",genre:"Welder"},
{id:"A77",name:"Beginner MIG Welding",hours:1,type:"course",section:"Optional",genre:"Welder"},
{id:"A78",name:"CWI Pre Seminar",hours:80,type:"course",section:"Optional",genre:"Welder"},
{id:"A79",name:"Welding Math",hours:5,type:"course",section:"Optional",genre:"Welder"},
{id:"A80",name:"MIT Calculus 1A",hours:13,type:"course",section:"Optional",genre:"Physics"},
{id:"A81",name:"Classic Mechanics MIT",hours:5,type:"course",section:"Optional",genre:"Physics"},
{id:"A82",name:"Do It Yourself Engineering",hours:12,type:"course",section:"Optional",genre:"Maker"},
{id:"A83",name:"Circuits and Electronics",hours:100,type:"course",section:"Optional",genre:"Maker"},
{id:"A84",name:"DIY Geiger Counters",hours:10,type:"course",section:"Optional",genre:"Maker"},
{id:"A85",name:"FAB LAB",hours:40,type:"course",section:"Optional",genre:"Maker"},
{id:"A86",name:"3D Printing Course",hours:4,type:"course",section:"Optional",genre:"Maker"},
{id:"A87",name:"Crash Course Electronics and PCB Design",hours:112,type:"course",section:"Optional",genre:"Maker"},
{id:"A88",name:"Learn to Repair & Troubleshooting",hours:6,type:"course",section:"Optional",genre:"Maker"},
{id:"A89",name:"Physics In Your Life",hours:18,type:"course",section:"Optional",genre:"Physics"},
{id:"A90",name:"Classical Mechanics by Walter Lewin",hours:100,type:"course",section:"Optional",genre:"Physics"},
{id:"A91",name:"How the Earth Works",hours:24,type:"course",section:"Optional",genre:"Geology"},
{id:"A92",name:"New History Of Life",hours:15,type:"course",section:"Optional",genre:"Biology"},
{id:"A93",name:"Big History",hours:24,type:"course",section:"Optional",genre:"World History"},
{id:"A94",name:"Understanding the Universe: Astronomy",hours:48,type:"course",section:"Optional",genre:"Astronomy"},
{id:"A95",name:"The Inexplicable Universe",hours:3,type:"course",section:"Optional",genre:"Astronomy"},
{id:"A96",name:"Introduction to Paleontology",hours:12,type:"course",section:"Optional",genre:"Science"},
{id:"A97",name:"Cosmology",hours:0,type:"course",section:"Optional",genre:"Astronomy"},
{id:"A98",name:"The Science of Life",hours:36,type:"course",section:"Optional",genre:"Biology"},
{id:"A99",name:"Biochemistry and Molecular Biology",hours:18,type:"course",section:"Optional",genre:"Biology"},
{id:"A100",name:"Infectious Diseases",hours:12,type:"course",section:"Optional",genre:"Biology"},
{id:"A101",name:"Physiology and Fitness",hours:13,type:"course",section:"Optional",genre:"Biology"},
{id:"A102",name:"Eat for Your Health",hours:6,type:"course",section:"Optional",genre:"Biology"},
{id:"A103",name:"Human Behavior by Robert Sapolsky",hours:30,type:"course",section:"Optional",genre:"Biology"},
{id:"A104",name:"Trees in All Seasons",hours:25,type:"course",section:"Optional",genre:"Nature"},
{id:"A105",name:"The Science of Gardening",hours:12,type:"course",section:"Optional",genre:"Nature"},
{id:"A106",name:"Pioneering Skills for Everyone",hours:12,type:"course",section:"Optional",genre:"Nature"},
{id:"A107",name:"Food: A Cultural History",hours:12,type:"course",section:"Optional",genre:"World History"},
{id:"A108",name:"The Everyday Gourmet",hours:12,type:"course",section:"Optional",genre:"Chef"},
{id:"A109",name:"Introduction to Jungian Psychology",hours:7,type:"course",section:"Optional",genre:"Psychology"},
{id:"A110",name:"Personality and its Transformations",hours:72,type:"course",section:"Optional",genre:"Psychology"},
{id:"A111",name:"Greece and Rome: Integrated History",hours:1,type:"course",section:"Optional",genre:"World History"},
{id:"A112",name:"How the Medici Shaped the Renaissance",hours:6,type:"course",section:"Optional",genre:"World History"},
{id:"A113",name:"Western Civilization II",hours:24,type:"course",section:"Optional",genre:"World History"},
{id:"A114",name:"Hannibal: Military Genius",hours:7,type:"course",section:"Optional",genre:"World History"},
{id:"A115",name:"The Decisive Battles of World History",hours:13,type:"course",section:"Optional",genre:"World History"},
{id:"A116",name:"Alexander the Great",hours:13,type:"course",section:"Optional",genre:"World History"},
{id:"A117",name:"Turning Points in Modern History",hours:12,type:"course",section:"Optional",genre:"World History"},
{id:"A118",name:"The Real History of Pirates",hours:12,type:"course",section:"Optional",genre:"World History"},
{id:"A119",name:"History's Greatest Voyages",hours:12,type:"course",section:"Optional",genre:"World History"},
{id:"A120",name:"What American Founders Learned",hours:13,type:"course",section:"Optional",genre:"American History"},
{id:"A121",name:"The Civil War and Reconstruction",hours:22,type:"course",section:"Optional",genre:"American History"},
{id:"A122",name:"The Western Literary Canon",hours:19,type:"course",section:"Optional",genre:"Literature"},
{id:"A123",name:"36 Books that Changed the World",hours:18,type:"course",section:"Optional",genre:"Literature"},
{id:"A124",name:"Dante's Divine Comedy",hours:12,type:"course",section:"Optional",genre:"Literature"},
{id:"A125",name:"Speeches by Milton Friedman",hours:15,type:"course",section:"Optional",genre:"Economics"},
{id:"A126",name:"1980 TV Series by Milton Friedman",hours:10,type:"course",section:"Optional",genre:"Economics"},
{id:"A127",name:"Economics 101 by Rothbard",hours:11,type:"course",section:"Optional",genre:"Economics"},
{id:"A128",name:"Austrian Economics Step by Step",hours:15,type:"course",section:"Optional",genre:"Economics"},
{id:"A129",name:"The 30 Greatest Orchestral Works",hours:26,type:"course",section:"Optional",genre:"Music"},
{id:"A130",name:"Great Masters Tchaikovsky",hours:6,type:"course",section:"Optional",genre:"Music"},
{id:"A131",name:"Real World Music Production",hours:14,type:"course",section:"Optional",genre:"Music"},
{id:"A132",name:"The World's Greatest Paintings",hours:12,type:"course",section:"Optional",genre:"Art"},
{id:"A133",name:"Contract Law: Harvard",hours:20,type:"course",section:"Optional",genre:"Law"},
{id:"A134",name:"Art of Conflict Management",hours:12,type:"course",section:"Optional",genre:"Law"},
{id:"A135",name:"Art of Critical Decision Making",hours:12,type:"course",section:"Optional",genre:"Law"},
{id:"A136",name:"Law School: Criminal + Civil",hours:24,type:"course",section:"Optional",genre:"Law"},
{id:"A137",name:"Law School: Corporate Law",hours:6,type:"course",section:"Optional",genre:"Law"},
{id:"A138",name:"Law School for Everyone",hours:24,type:"course",section:"Optional",genre:"Law"},
{id:"A139",name:"Financial Markets (Yale)",hours:33,type:"course",section:"Optional",genre:"Investing"},
{id:"A140",name:"Stock Market for Beginners",hours:9,type:"course",section:"Optional",genre:"Investing"},
{id:"A141",name:"Blockchain and Money",hours:25,type:"course",section:"Optional",genre:"Investing"},
{id:"A142",name:"How Does the Stock Market Work",hours:9,type:"course",section:"Optional",genre:"Investing"},
{id:"A143",name:"Financial Markets (Great Courses)",hours:12,type:"course",section:"Optional",genre:"Investing"},
{id:"A144",name:"How to Invest: Investment Markets",hours:12,type:"course",section:"Optional",genre:"Investing"},
{id:"A145",name:"Wall Street Survivor",hours:0,type:"course",section:"Optional",genre:"Investing"},
{id:"A146",name:"How the Market Works",hours:0,type:"course",section:"Optional",genre:"Investing"},
{id:"A147",name:"Investopedia",hours:0,type:"course",section:"Optional",genre:"Investing"},
{id:"A148",name:"Intuit Academy Bookkeeping Certificate",hours:65,type:"course",section:"Optional",genre:"Accounting"},
{id:"A149",name:"Bookkeeping Certification",hours:30,type:"course",section:"Optional",genre:"Accounting"},
{id:"A150",name:"Accounting & Financial Statement Analysis",hours:4,type:"course",section:"Optional",genre:"Accounting"},
{id:"A151",name:"Mastering Quickbooks Online 2025",hours:180,type:"course",section:"Optional",genre:"Accounting"},
{id:"A152",name:"Mastering Sales by Craig Wortmann",hours:40,type:"course",section:"Optional",genre:"Sales"},
{id:"A153",name:"Seven Figure Copywriting",hours:0,type:"course",section:"Optional",genre:"Sales"},
{id:"A154",name:"Intro to Marketing",hours:10,type:"course",section:"Optional",genre:"Marketing"},
{id:"A155",name:"Presenting to Persuade by Seth Godin",hours:1,type:"course",section:"Optional",genre:"Marketing"},
{id:"A156",name:"Google Digital Marketing",hours:10,type:"course",section:"Optional",genre:"Marketing"},
{id:"A157",name:"Making a Career on Upwork",hours:8,type:"course",section:"Optional",genre:"Entrepreneur"},
{id:"A158",name:"Freelancers Course",hours:5,type:"course",section:"Optional",genre:"Entrepreneur"},
{id:"A159",name:"How to Turn Your Passion into Profit",hours:11,type:"course",section:"Optional",genre:"Entrepreneur"},
{id:"A160",name:"Critical Business Skills for Success",hours:30,type:"course",section:"Optional",genre:"Entrepreneur"},
{id:"B1",name:"Discovering the German New Medicine",hours:10,type:"book",section:"Core",genre:"Biology",mode:"slow"},
{id:"B2",name:"Caveman Chemistry",hours:50,type:"book",section:"Core",genre:"Chemistry",mode:"normal"},
{id:"B3",name:"Stick and Rudder",hours:15,type:"book",section:"Core",genre:"Pilot",mode:"slow"},
{id:"B4",name:"Mental Math for Pilots",hours:5,type:"book",section:"Core",genre:"Pilot",mode:"slow"},
{id:"B5",name:"Blood and Thunder",hours:15,type:"book",section:"Core",genre:"American History",mode:"fast"},
{id:"B6",name:"Education of a Wandering Man",hours:5,type:"book",section:"Core",genre:"Literature",mode:"normal"},
{id:"B7",name:"Empire of the Summer Moon",hours:14,type:"book",section:"Core",genre:"American History",mode:"fast"},
{id:"B8",name:"The Sackett Series",hours:44,type:"book",section:"Core",genre:"American History",mode:"fast"},
{id:"B9",name:"Virtue of Selfishness",hours:4,type:"book",section:"Core",genre:"Philosophy",mode:"slow"},
{id:"B10",name:"Modern Man in Search of a Soul",hours:9,type:"book",section:"Core",genre:"Psychology",mode:"slow"},
{id:"B11",name:"The Iliad",hours:9,type:"book",section:"Core",genre:"Literature",mode:"slow"},
{id:"B12",name:"Only Yesterday",hours:10,type:"book",section:"Core",genre:"American History",mode:"normal"},
{id:"B13",name:"The Law",hours:2,type:"book",section:"Core",genre:"Economics",mode:"slow"},
{id:"B14",name:"Greek Art",hours:7,type:"book",section:"Core",genre:"Art",mode:"normal"},
{id:"B15",name:"Roman Art",hours:6,type:"book",section:"Core",genre:"Art",mode:"normal"},
{id:"B16",name:"The Republic",hours:3,type:"book",section:"Core",genre:"Philosophy",mode:"slow"},
{id:"B17",name:"Gorgias",hours:2,type:"book",section:"Core",genre:"Philosophy",mode:"slow"},
{id:"B18",name:"Trial and Death of Socrates",hours:3,type:"book",section:"Core",genre:"Philosophy",mode:"slow"},
{id:"B19",name:"Way of the Superior Man",hours:5,type:"book",section:"Core",genre:"Philosophy",mode:"passage"},
{id:"B20",name:"The Count of Monte Cristo",hours:30,type:"book",section:"Core",genre:"Literature",mode:"fast"},
{id:"B21",name:"Adventures of Huckleberry Finn",hours:9,type:"book",section:"Core",genre:"Literature",mode:"fast"},
{id:"B22",name:"Underland: A Deep Time Journey",hours:14,type:"book",section:"Core",genre:"Geology",mode:"normal"},
{id:"B23",name:"Poke The Box",hours:2,type:"book",section:"Core",genre:"Entrepreneur",mode:"fast"},
{id:"B24",name:"Atlas Shrugged",hours:29,type:"book",section:"Core",genre:"Philosophy",mode:"fast"},
{id:"B25",name:"On Writing",hours:6,type:"book",section:"Core",genre:"Literature",mode:"normal"},
{id:"B26",name:"The Creature from Jekyll Island",hours:10,type:"book",section:"Core",genre:"Investing",mode:"normal"},
{id:"B27",name:"Consider This",hours:8,type:"book",section:"Core",genre:"Literature",mode:"normal"},
{id:"B28",name:"The Elements of Style",hours:2,type:"book",section:"Core",genre:"Literature",mode:"slow"},
{id:"B29",name:"Thank You for Arguing",hours:6,type:"book",section:"Core",genre:"Law",mode:"normal"},
{id:"B30",name:"Zen and the Art of Motorcycle Maintenance",hours:12,type:"book",section:"Core",genre:"Philosophy",mode:"slow"},
{id:"B31",name:"The True Believer",hours:4,type:"book",section:"Core",genre:"Psychology",mode:"slow"},
{id:"B32",name:"Gulliver's Travels",hours:6,type:"book",section:"Core",genre:"Literature",mode:"fast"},
{id:"B33",name:"The Prize",hours:23,type:"book",section:"Core",genre:"World History",mode:"normal"},
{id:"B34",name:"Meditations",hours:6,type:"book",section:"Core",genre:"Philosophy",mode:"passage"},
{id:"B35",name:"The Art of War",hours:1,type:"book",section:"Core",genre:"Philosophy",mode:"passage"},
{id:"B36",name:"Bobby Fischer Teaches Chess",hours:3,type:"book",section:"Core",genre:"Science",mode:"slow"},
{id:"B37",name:"A War Like No Other",hours:9,type:"book",section:"Core",genre:"World History",mode:"normal"},
{id:"B38",name:"Beowulf",hours:4,type:"book",section:"Core",genre:"Literature",mode:"slow"},
{id:"B39",name:"Book of Five Rings",hours:2,type:"book",section:"Core",genre:"Philosophy",mode:"passage"},
{id:"B40",name:"The Guns of August",hours:13,type:"book",section:"Core",genre:"World History",mode:"normal"},
{id:"B41",name:"The Moon is a Harsh Mistress",hours:10,type:"book",section:"Core",genre:"Literature",mode:"fast"},
{id:"B42",name:"Endurance",hours:7,type:"book",section:"Core",genre:"Nature",mode:"fast"},
{id:"B43",name:"Brave New World",hours:7,type:"book",section:"Core",genre:"Literature",mode:"fast"},
{id:"B44",name:"The Odyssey",hours:6,type:"book",section:"Core",genre:"Literature",mode:"slow"},
{id:"B45",name:"The Travels of Marco Polo",hours:7,type:"book",section:"Core",genre:"World History",mode:"normal"},
{id:"B46",name:"1493",hours:11,type:"book",section:"Core",genre:"World History",mode:"normal"},
{id:"B47",name:"The Last Place on Earth",hours:12.5,type:"book",section:"Core",genre:"Nature",mode:"fast"},
{id:"B48",name:"Cosmos",hours:6.5,type:"book",section:"Core",genre:"Astronomy",mode:"normal"},
{id:"B49",name:"The Revenant",hours:8,type:"book",section:"Core",genre:"American History",mode:"fast"},
{id:"B50",name:"Undaunted Courage",hours:11.5,type:"book",section:"Core",genre:"American History",mode:"fast"},
{id:"B51",name:"One Man's Wilderness",hours:8,type:"book",section:"Core",genre:"Nature",mode:"normal"},
{id:"B52",name:"Man's Search for Meaning",hours:4,type:"book",section:"Core",genre:"Psychology",mode:"slow"},
{id:"B53",name:"Touching the Void",hours:6,type:"book",section:"Core",genre:"Nature",mode:"fast"},
{id:"B54",name:"1984",hours:8,type:"book",section:"Core",genre:"Literature",mode:"fast"},
{id:"B55",name:"Animal Farm",hours:3,type:"book",section:"Core",genre:"Literature",mode:"fast"},
{id:"B56",name:"1177 B.C.",hours:7,type:"book",section:"Core",genre:"World History",mode:"normal"},
{id:"B57",name:"Man, Cattle and Veld",hours:10,type:"book",section:"Core",genre:"Nature",mode:"slow"},
{id:"B58",name:"The Ascent of Money",hours:11,type:"book",section:"Core",genre:"Investing",mode:"normal"},
{id:"B59",name:"How to Draw and Think like a Real Artist",hours:30,type:"book",section:"Core",genre:"Art",mode:"slow"},
{id:"B60",name:"Logic: A Very Short Introduction",hours:2.5,type:"book",section:"Core",genre:"Philosophy",mode:"slow"},
{id:"B61",name:"The Art of Thinking Clearly",hours:7,type:"book",section:"Core",genre:"Psychology",mode:"normal"},
{id:"B62",name:"The Reluctant Entrepreneur",hours:5,type:"book",section:"Core",genre:"Entrepreneur",mode:"normal"},
{id:"B63",name:"The Lean Startup",hours:6,type:"book",section:"Core",genre:"Entrepreneur",mode:"normal"},
{id:"B64",name:"The Million-Dollar One-Person Business",hours:5,type:"book",section:"Core",genre:"Entrepreneur",mode:"normal"},
{id:"B65",name:"Ready, Fire, Aim",hours:7,type:"book",section:"Core",genre:"Entrepreneur",mode:"normal"},
{id:"B66",name:"The 1-Page Marketing Plan",hours:4,type:"book",section:"Core",genre:"Marketing",mode:"normal"},
{id:"B67",name:"The Boron Letters",hours:4,type:"book",section:"Core",genre:"Sales",mode:"passage"},
{id:"B68",name:"Influence",hours:8,type:"book",section:"Core",genre:"Psychology",mode:"normal"},
{id:"B69",name:"Think and Grow Rich",hours:6,type:"book",section:"Core",genre:"Entrepreneur",mode:"normal"},
{id:"B70",name:"Great Leads",hours:4,type:"book",section:"Core",genre:"Sales",mode:"slow"},
{id:"B71",name:"How to Win Friends and Influence People",hours:7,type:"book",section:"Core",genre:"Psychology",mode:"normal"},
{id:"B72",name:"PreSuasion",hours:10,type:"book",section:"Core",genre:"Psychology",mode:"slow"},
{id:"B73",name:"Never Split the Difference",hours:9,type:"book",section:"Core",genre:"Law",mode:"normal"},
{id:"B74",name:"Good Strategy/Bad Strategy",hours:6,type:"book",section:"Core",genre:"Entrepreneur",mode:"slow"},
{id:"B75",name:"Economics in One Lesson",hours:6,type:"book",section:"Core",genre:"Economics",mode:"slow"},
{id:"B76",name:"The Intelligent Investor",hours:13,type:"book",section:"Core",genre:"Investing",mode:"slow"},
{id:"B77",name:"The Most Important Thing",hours:6,type:"book",section:"Core",genre:"Investing",mode:"slow"},
{id:"B78",name:"Market Wizards",hours:9,type:"book",section:"Core",genre:"Investing",mode:"normal"},
{id:"B79",name:"When Money Dies",hours:8,type:"book",section:"Core",genre:"Investing",mode:"normal"},
{id:"B80",name:"Lords of Finance",hours:14,type:"book",section:"Core",genre:"Investing",mode:"normal"},
{id:"B81",name:"When Genius Failed",hours:8,type:"book",section:"Core",genre:"Investing",mode:"fast"},
{id:"B82",name:"Manias, Panics & Crashes",hours:12,type:"book",section:"Core",genre:"Investing",mode:"slow"},
{id:"B83",name:"Common Stocks & Uncommon Profits",hours:8,type:"book",section:"Core",genre:"Investing",mode:"slow"},
{id:"B84",name:"The World for Sale",hours:9,type:"book",section:"Core",genre:"Investing",mode:"fast"},
{id:"B85",name:"A Random Walk Down Wall Street",hours:13,type:"book",section:"Core",genre:"Investing",mode:"normal"},
{id:"B86",name:"Against the Gods",hours:9,type:"book",section:"Core",genre:"Investing",mode:"normal"},
{id:"B87",name:"You Can Be a Stock Market Genius",hours:7,type:"book",section:"Core",genre:"Investing",mode:"slow"},
{id:"B88",name:"Reminiscences of a Stock Operator",hours:9,type:"book",section:"Core",genre:"Investing",mode:"fast"},
{id:"B89",name:"Berkshire Letters to Shareholders",hours:16,type:"book",section:"Core",genre:"Investing",mode:"slow"},
{id:"B90",name:"The Great Crash 1929",hours:6,type:"book",section:"Core",genre:"Investing",mode:"normal"},
{id:"B91",name:"The Lords of Easy Money",hours:10,type:"book",section:"Core",genre:"Investing",mode:"normal"},
{id:"B92",name:"This Time Is Different",hours:13,type:"book",section:"Core",genre:"Investing",mode:"slow"},
{id:"B93",name:"Devil Take the Hindmost",hours:12,type:"book",section:"Core",genre:"Investing",mode:"normal"},
{id:"B94",name:"The Dao of Capital",hours:7,type:"book",section:"Core",genre:"Investing",mode:"slow"},
{id:"B95",name:"Antifragile",hours:12,type:"book",section:"Core",genre:"Philosophy",mode:"slow"},
{id:"B96",name:"Don't Make Me Think",hours:3.5,type:"book",section:"Core",genre:"Tinker",mode:"normal"},
{id:"B97",name:"The Three Body Problem",hours:10,type:"book",section:"Core",genre:"Literature",mode:"fast"},
{id:"B98",name:"Foundation Trilogy",hours:17,type:"book",section:"Core",genre:"Literature",mode:"fast"},
{id:"B99",name:"The War of Art",hours:4,type:"book",section:"Core",genre:"Philosophy",mode:"passage"},
{id:"B100",name:"Nicomachean Ethics",hours:6,type:"book",section:"Core",genre:"Philosophy",mode:"slow"},
{id:"B101",name:"Scientific Revolution",hours:4,type:"book",section:"Core",genre:"Science",mode:"normal"},
{id:"B102",name:"The Diamond Age",hours:13,type:"book",section:"Core",genre:"Literature",mode:"fast"},
{id:"B103",name:"The Martian",hours:10,type:"book",section:"Core",genre:"Literature",mode:"fast"},
{id:"B104",name:"The Divine Comedy",hours:9,type:"book",section:"Optional",genre:"Literature",mode:"slow"},
{id:"B105",name:"Blood Meridian",hours:13,type:"book",section:"Optional",genre:"Literature",mode:"slow"},
{id:"B106",name:"The Lord of the Rings",hours:40,type:"book",section:"Optional",genre:"Literature",mode:"fast"},
{id:"B107",name:"Stranger in a Strange Land",hours:13,type:"book",section:"Optional",genre:"Literature",mode:"fast"},
{id:"B108",name:"The Jungle",hours:13,type:"book",section:"Optional",genre:"Literature",mode:"fast"},
{id:"B109",name:"The Old Man and the Sea",hours:2,type:"book",section:"Optional",genre:"Literature",mode:"fast"},
{id:"B110",name:"The Fountainhead",hours:28,type:"book",section:"Optional",genre:"Philosophy",mode:"fast"},
{id:"B111",name:"Decline & Fall of the Roman Empire Vol 1",hours:17,type:"book",section:"Optional",genre:"World History",mode:"slow"},
{id:"B112",name:"The Canterbury Tales",hours:9,type:"book",section:"Optional",genre:"Literature",mode:"slow"},
{id:"B113",name:"War and Peace",hours:48,type:"book",section:"Optional",genre:"Literature",mode:"normal"},
{id:"B114",name:"Don Quixote",hours:33,type:"book",section:"Optional",genre:"Literature",mode:"normal"},
{id:"B115",name:"Glory Road",hours:8,type:"book",section:"Optional",genre:"Literature",mode:"fast"},
{id:"B116",name:"Novum Organum",hours:3,type:"book",section:"Optional",genre:"Philosophy",mode:"slow"},
{id:"B117",name:"The Time Machine",hours:3,type:"book",section:"Optional",genre:"Literature",mode:"fast"},
{id:"B118",name:"Hitchhiker's Guide to the Galaxy",hours:4,type:"book",section:"Optional",genre:"Literature",mode:"fast"},
{id:"B119",name:"Dragon's Egg",hours:8,type:"book",section:"Optional",genre:"Literature",mode:"fast"},
{id:"B120",name:"Moby Dick",hours:18,type:"book",section:"Optional",genre:"Literature",mode:"slow"},
{id:"B121",name:"Slaughterhouse Five",hours:5,type:"book",section:"Optional",genre:"Literature",mode:"fast"},
{id:"B122",name:"One Second After",hours:9,type:"book",section:"Optional",genre:"Literature",mode:"fast"},
{id:"B123",name:"Lonesome Dove",hours:24,type:"book",section:"Optional",genre:"American History",mode:"fast"},
{id:"B124",name:"In the Heart of the Sea",hours:8,type:"book",section:"Optional",genre:"Nature",mode:"fast"},
{id:"B125",name:"For Whom The Bell Tolls",hours:11,type:"book",section:"Optional",genre:"Literature",mode:"normal"},
{id:"B126",name:"The Portable Greek Historians",hours:9,type:"book",section:"Optional",genre:"World History",mode:"slow"},
{id:"B127",name:"The Enlightenment",hours:4,type:"book",section:"Optional",genre:"World History",mode:"normal"},
{id:"B128",name:"Confessions",hours:8,type:"book",section:"Optional",genre:"Philosophy",mode:"slow"},
{id:"B129",name:"Before France & Germany",hours:8,type:"book",section:"Optional",genre:"World History",mode:"slow"},
{id:"B130",name:"The Carolingians",hours:8,type:"book",section:"Optional",genre:"World History",mode:"slow"},
{id:"B131",name:"Magna Carta",hours:7,type:"book",section:"Optional",genre:"Law",mode:"slow"},
{id:"B132",name:"Heart of Europe",hours:17,type:"book",section:"Optional",genre:"World History",mode:"slow"},
{id:"B133",name:"The Fall of Rome",hours:6,type:"book",section:"Optional",genre:"World History",mode:"normal"},
{id:"B134",name:"The Holy Roman Empire",hours:15,type:"book",section:"Optional",genre:"World History",mode:"slow"},
{id:"B135",name:"Collapse",hours:18,type:"book",section:"Optional",genre:"World History",mode:"normal"},
{id:"B136",name:"What Has Government Done to Our Money",hours:12.7,type:"book",section:"Optional",genre:"Economics",mode:"slow"},
{id:"B137",name:"The Silk Roads",hours:20,type:"book",section:"Optional",genre:"World History",mode:"normal"},
{id:"B138",name:"The Russian Revolution",hours:7,type:"book",section:"Optional",genre:"World History",mode:"normal"},
{id:"B139",name:"The Gulag Archipelago",hours:46,type:"book",section:"Optional",genre:"World History",mode:"slow"},
{id:"B140",name:"Hagakure",hours:4,type:"book",section:"Optional",genre:"Philosophy",mode:"passage"},
{id:"B141",name:"Bhagavad Gita",hours:4,type:"book",section:"Optional",genre:"Philosophy",mode:"passage"},
{id:"B142",name:"A History of the US in Five Crashes",hours:8,type:"book",section:"Optional",genre:"American History",mode:"normal"},
{id:"B143",name:"A Demon of Our Own Design",hours:7,type:"book",section:"Optional",genre:"Investing",mode:"normal"},
{id:"B144",name:"Once in Golconda",hours:7,type:"book",section:"Optional",genre:"Investing",mode:"normal"},
{id:"B145",name:"Skeletons on the Zahara",hours:7.5,type:"book",section:"Optional",genre:"Nature",mode:"fast"},
{id:"B146",name:"The Prince",hours:3,type:"book",section:"Optional",genre:"Philosophy",mode:"slow"},
{id:"B147",name:"Outwitting the Devil",hours:7,type:"book",section:"Optional",genre:"Entrepreneur",mode:"normal"},
{id:"B148",name:"Put Your Ass Where Your Heart Wants to Be",hours:3,type:"book",section:"Optional",genre:"Philosophy",mode:"passage"},
{id:"B149",name:"Memories, Dreams, Reflections",hours:10,type:"book",section:"Optional",genre:"Psychology",mode:"slow"},
{id:"B150",name:"12 Rules for Life",hours:10,type:"book",section:"Optional",genre:"Psychology",mode:"slow"},
{id:"B151",name:"About Face",hours:19,type:"book",section:"Optional",genre:"World History",mode:"fast"},
{id:"B152",name:"With the Old Breed",hours:8,type:"book",section:"Optional",genre:"World History",mode:"fast"},
{id:"B153",name:"Napoleon: A Life",hours:25,type:"book",section:"Optional",genre:"World History",mode:"normal"},
{id:"B154",name:"Stilwell and the American Experience in China",hours:16,type:"book",section:"Optional",genre:"World History",mode:"normal"},
{id:"B155",name:"The Fourth Turning",hours:8,type:"book",section:"Optional",genre:"World History",mode:"slow"},
{id:"B156",name:"Dumbing Us Down",hours:2,type:"book",section:"Optional",genre:"Psychology",mode:"normal"},
{id:"B157",name:"The Singularity is Near",hours:10,type:"book",section:"Optional",genre:"Tinker",mode:"slow"},
{id:"B158",name:"The Machinery of Freedom",hours:8,type:"book",section:"Optional",genre:"Economics",mode:"slow"},
{id:"B159",name:"The Bitcoin Standard",hours:7,type:"book",section:"Optional",genre:"Investing",mode:"slow"},
{id:"B160",name:"The Wealth of Nations",hours:31,type:"book",section:"Optional",genre:"Economics",mode:"slow"},
{id:"B161",name:"Wealth, War & Wisdom",hours:10,type:"book",section:"Optional",genre:"Investing",mode:"normal"},
{id:"B162",name:"Beating the Street",hours:9,type:"book",section:"Optional",genre:"Investing",mode:"normal"},
{id:"B163",name:"The Little Book That Still Beats the Market",hours:5,type:"book",section:"Optional",genre:"Investing",mode:"normal"},
{id:"B164",name:"What Works on Wall Street",hours:12,type:"book",section:"Optional",genre:"Investing",mode:"slow"},
{id:"B165",name:"Adaptive Markets",hours:13,type:"book",section:"Optional",genre:"Investing",mode:"slow"},
{id:"B166",name:"The Alchemy of Finance",hours:14,type:"book",section:"Optional",genre:"Investing",mode:"slow"},
{id:"B167",name:"House of Morgan",hours:22,type:"book",section:"Optional",genre:"Investing",mode:"normal"},
{id:"B168",name:"The Panic of 1907",hours:7,type:"book",section:"Optional",genre:"Investing",mode:"normal"},
{id:"B169",name:"Misbehavior of Markets",hours:7,type:"book",section:"Optional",genre:"Investing",mode:"slow"},
{id:"B170",name:"Financial Statement Analysis & Security Valuation",hours:20,type:"book",section:"Optional",genre:"Accounting",mode:"slow"},
{id:"B171",name:"The Psychology of Money",hours:5,type:"book",section:"Optional",genre:"Investing",mode:"normal"},
{id:"B172",name:"The Price of Time",hours:9,type:"book",section:"Optional",genre:"Economics",mode:"slow"},
{id:"B173",name:"The Fruits of Graft",hours:14,type:"book",section:"Optional",genre:"World History",mode:"normal"},
{id:"B174",name:"Only Yesterday (OPT)",hours:10,type:"book",section:"Optional",genre:"American History",mode:"normal"},
{id:"B175",name:"The Hard Thing About Hard Things",hours:9,type:"book",section:"Optional",genre:"Entrepreneur",mode:"normal"},
{id:"B176",name:"Confessions of the Pricing Man",hours:6,type:"book",section:"Optional",genre:"Sales",mode:"slow"},
{id:"B177",name:"Zig Ziglar's Secrets of Closing the Sale",hours:6,type:"book",section:"Optional",genre:"Sales",mode:"normal"},
{id:"B178",name:"The Resilient Farm and Homestead",hours:12,type:"book",section:"Optional",genre:"Nature",mode:"slow"},
{id:"B179",name:"Holistic Management Handbook",hours:12,type:"book",section:"Optional",genre:"Nature",mode:"slow"},
{id:"B180",name:"Breakthrough Copywriting",hours:5,type:"book",section:"Optional",genre:"Sales",mode:"slow"},
{id:"B181",name:"Scientific Advertising",hours:3,type:"book",section:"Optional",genre:"Sales",mode:"slow"},
{id:"B182",name:"Making Them Believe",hours:7,type:"book",section:"Optional",genre:"Sales",mode:"slow"},
{id:"B183",name:"The 10 Commandments of A-List Copywriters",hours:3,type:"book",section:"Optional",genre:"Sales",mode:"slow"},
{id:"B184",name:"The No-Code Revolution",hours:6,type:"book",section:"Optional",genre:"Tinker",mode:"normal"},
];

const ALL_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const gc = g => {
  const m = {
    Biology:"#16a34a",Physics:"#2563eb",Marketing:"#be185d",Sales:"#c2410c",
    Investing:"#b45309",Law:"#7c3aed",Literature:"#0369a1","World History":"#c2410c",
    "American History":"#b91c1c",Art:"#9333ea",Geology:"#15803d",Chemistry:"#ca8a04",
    Pilot:"#0369a1",Welder:"#dc2626",Maker:"#059669",Philosophy:"#92400e",
    Nature:"#16a34a",Entrepreneur:"#c2410c",Accounting:"#64748b",
    Tinker:"#0891b2",Psychology:"#7c3aed",Chef:"#c2410c",Music:"#9333ea",
    Science:"#4f46e5","Music Theory":"#be185d",Meteorology:"#0369a1",
    Economics:"#d97706",Astronomy:"#6366f1",
  };
  if (!g) return "#64748b";
  for (const [k,v] of Object.entries(m)) if (g.toLowerCase()===k.toLowerCase()) return v;
  return "#64748b";
};

const load = (k,d) => { try { return JSON.parse(localStorage.getItem(k))??d; } catch { return d; } };
const save = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

function toLocalISO(d){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${dd}`; }
function getMonday() {
  const d=new Date(),day=d.getDay(),diff=day===0?-6:1-day;
  d.setDate(d.getDate()+diff);d.setHours(0,0,0,0);
  return toLocalISO(d);
}
// Parse getMonday() ISO string as local midnight — avoids UTC-shift bug with new Date("YYYY-MM-DD")
function getMondayDate() {
  const [y,m,d]=getMonday().split("-").map(Number);
  return new Date(y,m-1,d);
}
function getDayIdx(){ const d=new Date().getDay(); return d===0?6:d-1; }
function getDayName(){ return ALL_DAYS[getDayIdx()]; }
function getTodayISO(){ return toLocalISO(new Date()); }
function getWeekISO(){ const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function isSunday(){ return new Date().getDay()===0; }
function isMonday(){ return new Date().getDay()===1; }

const SK_P="tp_p4",SK_W="tp_w4",SK_F="tp_f4",SK_REVIEWS="tp_reviews2",SK_PROFILE="tp_profile2";
const SK_PLAN="tp_plan2",SK_QUEUE="tp_queue1",SK_WEEKLY_HOURS="tp_wkhours1",SK_CUSTOM="tp_custom1";
const SK_SUNDAY_DONE="tp_sundaydone1",SK_SETTINGS="tp_settings1";
const SK_NOTIFS="tp_notifs1";
const SK_HIDDEN="tp_hidden1";
const SK_SNAPSHOT="tp_snapshot1";
const MAX_REVIEWS=20;
const NOTIF_TTL_MS = 3*24*60*60*1000;

const DEFAULT_SETTINGS={
  weeklyTarget: 20,
  activeDays: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
  courseRatio: 2,
  bookRatio: 1,
};

const DEFAULT_PROFILE=`LEARNER: Connor, 18, Kamloops BC. Self-directed 4-year curriculum called The Preparation.

TIME RATIOS (configurable in Settings):
- Courses: 1h content = 2h real study time. Session length capped automatically by weekly hour tier.
- Books: 1h content = 1h real. Session length fixed by mode (passage=30min, slow=1h, normal=1.5h, fast=2h).
- Weekly budget: configurable in Settings (default 20 real hours).

SEQUENCING RULES:
- Complete Core before Optional in any genre.
- Vary genre every session — never same genre twice in one day.
- Number of active courses and books determined by weekly hour tier.
- Always keep 1 Philosophy book active.
- When user asks for specific topics (e.g. "roman history"), map to real curriculum item IDs.

4-YEAR ARC: Year 1 Foundations → Year 2 Applied → Year 3 Specialization → Year 4 Integration`;

const T={
  bg:"#0d1b2a",bgAlt:"#0f2240",
  surface0:"rgba(255,255,255,0.04)",surface1:"rgba(255,255,255,0.07)",
  surface2:"rgba(255,255,255,0.03)",surface3:"rgba(255,255,255,0.06)",
  border:"rgba(255,255,255,0.08)",borderLight:"rgba(255,255,255,0.12)",borderSub:"rgba(255,255,255,0.05)",
  text:"#ffffff",textMid:"rgba(255,255,255,0.6)",textDim:"rgba(255,255,255,0.35)",textFaint:"rgba(255,255,255,0.2)",
  blue:"#3b82f6",green:"#22c55e",pink:"#ec4899",yellow:"#f59e0b",red:"#ef4444",orange:"#f97316",
  fontUI:"'DM Sans', -apple-system, sans-serif",
};
const shadow={
  card:"0 8px 32px rgba(0,0,0,0.4)",
  raised:"0 16px 48px rgba(0,0,0,0.5)",
  glow:c=>`0 0 12px ${c}40, 0 0 32px ${c}20`,
  inset:"inset 0 1px 4px rgba(0,0,0,0.2)",
};

const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin:0; padding:0; background:linear-gradient(135deg, #0d1b2a 0%, #0f2240 50%, #0d1b2a 100%) fixed; background-attachment:fixed; overscroll-behavior-y:auto; min-height:100dvh; }
  body { -webkit-overflow-scrolling: touch; }
  @keyframes splashBloom {
    0%   { opacity:0; transform:scale(0.6); }
    60%  { opacity:1; transform:scale(1.05); }
    100% { opacity:1; transform:scale(1); }
  }
  @keyframes splashPulse { 0% { opacity:0.6; } 100% { opacity:1; } }
  @keyframes splashOut { to { opacity:0; } }
  @keyframes compassSpin {
    0%   { transform: rotate(0deg);   animation-timing-function: cubic-bezier(0.4,0,0.8,0.4); }
    25%  { transform: rotate(90deg);  animation-timing-function: linear; }
    75%  { transform: rotate(270deg); animation-timing-function: cubic-bezier(0.2,0.6,0.6,1); }
    100% { transform: rotate(360deg); }
  }
  @keyframes compassShrink {
    from { transform: scale(1.786); }
    to   { transform: scale(1); }
  }
  @keyframes fadeUp {
    from { opacity:0; transform:translateY(8px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  @keyframes slideInLeft {
    from { transform:translateX(-100%); opacity:0; }
    to   { transform:translateX(0);     opacity:1; }
  }
  @keyframes slideInUp {
    from { transform:translateY(100%) scale(0.98); opacity:0; }
    to   { transform:translateY(0) scale(1);       opacity:1; }
  }
  @keyframes modalIn {
    from { opacity:0; transform:scale(0.96); }
    to   { opacity:1; transform:scale(1); }
  }
  @keyframes bannerIn {
    from { transform:translateY(-80px); opacity:0; }
    to   { transform:translateY(0);     opacity:1; }
  }
  @keyframes bannerOut {
    from { transform:translateY(0);     opacity:1; }
    to   { transform:translateY(-80px); opacity:0; }
  }
  @keyframes toastIn {
    from { opacity:0; transform:translateX(-50%) translateY(8px) scale(0.95); }
    to   { opacity:1; transform:translateX(-50%) translateY(0)   scale(1); }
  }
  .btn-press { transition: transform 0.08s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease; }
  .btn-press:active { transform: scale(0.97); transition: transform 0.08s cubic-bezier(0.4,0,0.2,1); }
  .tab-content { animation: fadeUp 0.28s cubic-bezier(0.4,0,0.2,1) both; }
  input, textarea, select { transition: border-color 0.2s cubic-bezier(0.4,0,0.2,1), box-shadow 0.2s cubic-bezier(0.4,0,0.2,1); font-size: 16px; color: #ffffff; }
  input:focus, textarea:focus { border-color: rgba(59,130,246,0.5) !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); outline:none; }
  body.menu-open { overflow: hidden; position: fixed; width: 100%; }
  input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.25); }
  input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1) opacity(0.4); }
  * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
`;

// ── Splash ────────────────────────────────────────────────────────────────────
function SplashScreen({ onDone }) {
  const [textVisible,    setTextVisible]    = useState(false);
  const [compassVisible, setCompassVisible] = useState(false);
  const [compassSpin,    setCompassSpin]    = useState(false);
  const [exiting,        setExiting]        = useState(false);
  const canvasRef    = useRef(null);
  const rafRef       = useRef(null);
  const rotStartRef  = useRef(null);

  useEffect(() => {
    const t1 = setTimeout(() => setTextVisible(true),    50);
    const t2 = setTimeout(() => setCompassVisible(true), 300);
    const t3 = setTimeout(() => setCompassSpin(true),    650);
    const t4 = setTimeout(() => setExiting(true),        3150); // 650 + 2500
    const t5 = setTimeout(() => onDone(),                3620);
    return () => [t1,t2,t3,t4,t5].forEach(clearTimeout);
  }, []);

  // Canvas spark + arc trail + fairy lights — starts with the compass spin
  useEffect(() => {
    if (!compassSpin) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx   = canvas.getContext("2d");
    const dpr   = window.devicePixelRatio || 1;
    const SIZE  = 280;
    canvas.width  = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width  = SIZE + "px";
    canvas.style.height = SIZE + "px";
    ctx.scale(dpr, dpr);

    const cx = SIZE / 2, cy = SIZE / 2;
    const RING_R   = 130;
    const DURATION = 2500;

    // Speed ramp: ease-in first 25%, linear middle 50%, ease-out last 25%
    // Derived so total progress goes 0→1 and is C1-continuous at joins.
    const speedRamp = (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      if (t < 0.25) return (8/3) * t * t;
      if (t < 0.75) return 1/6 + (4/3) * (t - 0.25);
      return 1 - (8/3) * (1 - t) * (1 - t);
    };
    // Instantaneous speed (derivative of speedRamp), peak = 4/3 in linear zone
    const speedNow = (t) => {
      if (t < 0.25) return (16/3) * t;
      if (t < 0.75) return 4/3;
      return (16/3) * (1 - t);
    };

    // Fairy light particle configs — generated once, vary per-particle
    const count = 8 + Math.floor(Math.random() * 5); // 8–12
    const particles = Array.from({ length: count }, (_, i) => ({
      phase:        (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.7,
      radiusOffset: (Math.random() - 0.5) * 22,        // ±11px from ring
      orbitSpeed:   0.72 + Math.random() * 0.56,        // 0.72–1.28× ramp
      size:         3 + Math.random() * 1.2,            // 3–4.2px core
      baseOpacity:  0.55 + Math.random() * 0.45,        // 0.55–1.0
      driftPhase:   Math.random() * Math.PI * 2,
      driftSpeed:   700 + Math.random() * 500,          // ms per drift cycle
    }));

    const draw = (ts) => {
      if (!rotStartRef.current) rotStartRef.current = ts;
      const elapsed  = Math.min(ts - rotStartRef.current, DURATION);
      ctx.clearRect(0, 0, SIZE, SIZE);

      const progress = elapsed / DURATION;
      const eased    = speedRamp(progress);
      // North = -PI/2, spark travels clockwise
      const angle    = eased * 2 * Math.PI - Math.PI / 2;
      // Normalised speed: 0 at start/end, 1 through the linear middle
      const normSpd  = Math.min(speedNow(progress) / (4/3), 1);

      // Particle alpha envelope: fade in over first 450ms, fade out over last 18%
      const pFadeIn  = Math.min(elapsed / 450, 1);
      const pFadeOut = progress > 0.82 ? Math.max(0, 1 - (progress - 0.82) / 0.18) : 1;
      const pEnv     = pFadeIn * pFadeOut;

      // ── Fairy lights ──
      for (const p of particles) {
        const pp     = Math.min(progress * p.orbitSpeed, 1);
        const pAngle = p.phase + speedRamp(pp) * 2 * Math.PI;
        const pR     = RING_R + p.radiusOffset
                       + Math.sin(elapsed / p.driftSpeed + p.driftPhase) * 5;
        const px = cx + pR * Math.cos(pAngle);
        const py = cy + pR * Math.sin(pAngle);
        const alpha = p.baseOpacity * pEnv;
        if (alpha < 0.01) continue;

        const glowR = p.size * 3.5;
        const pg = ctx.createRadialGradient(px, py, 0, px, py, glowR);
        pg.addColorStop(0,    `rgba(255,255,255,${alpha.toFixed(3)})`);
        pg.addColorStop(0.38, `rgba(255,255,255,${(alpha * 0.28).toFixed(3)})`);
        pg.addColorStop(1,    "rgba(255,255,255,0)");
        ctx.beginPath();
        ctx.arc(px, py, glowR, 0, Math.PI * 2);
        ctx.fillStyle = pg;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, p.size * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.fill();
      }

      // ── Arc trail: 90° behind spark, intensity scales with speed ──
      const TRAIL   = Math.PI / 2;
      const SEG     = 64;
      const arcPeak = 0.38 + 0.27 * normSpd; // 0.38 slow → 0.65 fast
      for (let i = 0; i < SEG; i++) {
        const t0 = i / SEG;
        const t1 = (i + 1) / SEG;
        ctx.beginPath();
        ctx.arc(cx, cy, RING_R,
          angle - TRAIL + t0 * TRAIL,
          angle - TRAIL + t1 * TRAIL);
        ctx.strokeStyle = `rgba(59,130,246,${(t0 * arcPeak).toFixed(3)})`;
        ctx.lineWidth = 2.5;
        ctx.lineCap   = "butt";
        ctx.stroke();
      }

      // ── Spark ──
      const sx = cx + RING_R * Math.cos(angle);
      const sy = cy + RING_R * Math.sin(angle);

      const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, 22);
      grd.addColorStop(0,    "rgba(255,255,255,0.90)");
      grd.addColorStop(0.22, "rgba(255,255,255,0.55)");
      grd.addColorStop(0.50, "rgba(200,225,255,0.20)");
      grd.addColorStop(1,    "rgba(255,255,255,0)");
      ctx.beginPath();
      ctx.arc(sx, sy, 22, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(210,235,255,1)";
      ctx.fill();

      if (elapsed < DURATION) rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [compassSpin]);

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9999,
      background:"linear-gradient(160deg, #0d1b2a 0%, #0f2240 55%, #0d1b2a 100%)",
      pointerEvents:"none",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      paddingTop:"calc(env(safe-area-inset-top) + 16px)",
      paddingBottom:"calc(env(safe-area-inset-bottom) + 16px)",
      opacity:  exiting ? 0 : 1,
      transition: exiting ? "opacity 0.47s cubic-bezier(0.4,0,0.2,1)" : "none",
    }}>

      {/* ── Title block — appears first ── */}
      <div style={{
        textAlign:"center",
        opacity:    textVisible ? 1 : 0,
        transform:  `translateY(${textVisible ? 0 : 14}px)`,
        transition: "opacity 0.65s cubic-bezier(0.4,0,0.2,1), transform 0.65s cubic-bezier(0.4,0,0.2,1)",
        marginBottom: 34,
        flexShrink: 0,
        zIndex: 2,
      }}>
        <div style={{
          fontSize: 26, fontWeight: 900, color: "#ffffff",
          fontFamily: T.fontUI, letterSpacing: 5, lineHeight: 1,
          textTransform: "uppercase",
        }}>
          The Preparation
        </div>
        <div style={{
          fontSize: 11.5, color: "rgba(255,255,255,0.60)",
          fontFamily: T.fontUI, marginTop: 11, fontWeight: 400, letterSpacing: 0.4,
          lineHeight: 1.6,
        }}>
          How to Become Competent,<br/>Confident and Dangerous
        </div>
      </div>

      {/* ── Compass rose + canvas ── */}
      <div style={{width:280, height:280, position:"relative", flexShrink:0}}>
        {/* Scale shrink + opacity wrapper — starts large, shrinks to 280px */}
        <div style={{
          width:280, height:280, position:"relative",
          opacity:         compassVisible ? 1 : 0,
          transition:      "opacity 0.45s cubic-bezier(0.4,0,0.2,1)",
          transformOrigin: "center center",
          transform:       "scale(1.786)",
          animation:       compassSpin ? "compassShrink 2500ms cubic-bezier(0.25,0,0.1,1) forwards" : "none",
        }}>
          {/* Rotating compass rose SVG */}
          <svg viewBox="-140 -140 280 280" width="280" height="280"
            style={{
              position:"absolute", top:0, left:0,
              transformOrigin:"center center",
              animation: compassSpin ? "compassSpin 2500ms forwards" : "none",
              overflow:"visible",
            }}
          >
            {/* Outer spark orbit ring */}
            <circle r="130" fill="none" stroke="rgba(245,240,232,0.28)" strokeWidth="1"/>

            {/* Concentric decorative rings */}
            <circle r="114" fill="none" stroke="rgba(245,240,232,0.13)" strokeWidth="0.5"/>
            <circle r="92"  fill="none" stroke="rgba(245,240,232,0.20)" strokeWidth="0.75"/>
            <circle r="70"  fill="none" stroke="rgba(245,240,232,0.12)" strokeWidth="0.5"/>
            <circle r="50"  fill="none" stroke="rgba(245,240,232,0.18)" strokeWidth="0.75"/>
            <circle r="30"  fill="none" stroke="rgba(245,240,232,0.10)" strokeWidth="0.5"/>

            {/* Intercardinal points (NE/SE/SW/NW) — steel blue, drawn first so cardinals sit on top */}
            {[45,135,225,315].map(deg=>(
              <g key={deg} transform={`rotate(${deg})`}>
                <polygon points="0,-64  11,-32  0,-8  -11,-32" fill="#4a7fa5"/>
                {/* subtle right-half lightening */}
                <polygon points="0,-64  11,-32  0,-8" fill="rgba(255,255,255,0.07)"/>
              </g>
            ))}

            {/* Cardinal points (N/S/E/W) — cream/ivory elongated diamonds */}
            {[0,90,180,270].map(deg=>(
              <g key={deg} transform={`rotate(${deg})`}>
                <polygon points="0,-108  16,-50  0,-8  -16,-50" fill="#f5f0e8"/>
                {/* left-half shadow for depth */}
                <polygon points="0,-108  0,-8  -16,-50" fill="rgba(0,0,0,0.09)"/>
              </g>
            ))}

            {/* Tick marks at 5° increments on the outer ring, skipping the 8 point directions */}
            {Array.from({length:72}, (_,i)=>{
              const deg=i*5;
              if(deg%45===0) return null; // points cover these
              const rad=(deg*Math.PI)/180;
              const isM15=deg%15===0;
              const r1=isM15?119:125;
              const op=isM15?0.38:0.16;
              const sw=isM15?0.8:0.45;
              const s=Math.sin(rad),c=Math.cos(rad);
              return(
                <line key={i}
                  x1={r1*s} y1={-r1*c} x2={130*s} y2={-130*c}
                  stroke={`rgba(245,240,232,${op})`}
                  strokeWidth={sw} strokeLinecap="round"/>
              );
            })}

            {/* N/S/E/W labels outside the rings */}
            {[["N",0,"#f5f0e8",800],["E",90,"rgba(245,240,232,0.82)",700],
              ["S",180,"rgba(245,240,232,0.82)",700],["W",270,"rgba(245,240,232,0.82)",700]
            ].map(([lbl,deg,col,fw])=>{
              const rad=(deg*Math.PI)/180, r=143;
              return(
                <text key={lbl}
                  x={r*Math.sin(rad)} y={-r*Math.cos(rad)+4}
                  fill={col} fontSize="11" fontFamily="'DM Sans',sans-serif"
                  fontWeight={fw} textAnchor="middle" letterSpacing="2">{lbl}</text>
              );
            })}

            {/* Inner miniature 8-point star — decorative repeat at small scale */}
            {[0,90,180,270].map(deg=>(
              <g key={deg} transform={`rotate(${deg})`}>
                <polygon points="0,-23  3,-10  0,-4  -3,-10" fill="#f5f0e8" opacity="0.62"/>
              </g>
            ))}
            {[45,135,225,315].map(deg=>(
              <g key={deg} transform={`rotate(${deg})`}>
                <polygon points="0,-14  2,-7  0,-4  -2,-7" fill="#4a7fa5" opacity="0.62"/>
              </g>
            ))}

            {/* Center hub */}
            <circle r="9"   fill="#0d1b2a" stroke="rgba(245,240,232,0.55)" strokeWidth="1.5"/>
            <circle r="4.5" fill="#f5f0e8"/>
            <circle r="1.8" fill="#0d1b2a"/>
          </svg>

          {/* Canvas — spark + arc trail + fairy lights (does not rotate, scales with wrapper) */}
          <canvas ref={canvasRef}
            style={{position:"absolute",top:0,left:0,width:280,height:280,pointerEvents:"none"}}/>
        </div>
      </div>

    </div>
  );
}

// ── Notification system ────────────────────────────────────────────────────────
function useNotifications() {
  const [notifs, setNotifs] = useState(() => {
    const saved = load(SK_NOTIFS, []);
    const cutoff = Date.now() - NOTIF_TTL_MS;
    return saved.filter(n => n.ts > cutoff);
  });
  const [bannerQueue, setBannerQueue] = useState([]);
  const [currentBanner, setCurrentBanner] = useState(null);

  useEffect(() => { save(SK_NOTIFS, notifs); }, [notifs]);

  // Drain banner queue one at a time
  useEffect(() => {
    if (!currentBanner && bannerQueue.length > 0) {
      setCurrentBanner(bannerQueue[0]);
      setBannerQueue(prev => prev.slice(1));
    }
  }, [currentBanner, bannerQueue]);

  const push = useCallback((title, body, action = null) => {
    const n = { id: Date.now(), ts: Date.now(), title, body, action, read: false };
    setNotifs(prev => [n, ...prev].slice(0, 40));
    setBannerQueue(prev => [...prev, n]);
  }, []);

  const markRead = useCallback(id => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const clearAll = useCallback(() => setNotifs([]), []);
  const dismiss = useCallback(id => setNotifs(prev => prev.filter(n => n.id !== id)), []);
  const dismissBanner = useCallback(() => setCurrentBanner(null), []);
  const unreadCount = notifs.filter(n => !n.read).length;
  return { notifs, push, markRead, clearAll, dismiss, unreadCount, currentBanner, dismissBanner };
}

// ── Apple-style drop-down notification banner ──────────────────────────────────
function NotifBanner({ notif, onDismiss }) {
  const [hiding, setHiding] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setHiding(true), 3000);
    const t2 = setTimeout(onDismiss, 3480);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const doClose = () => { setHiding(true); setTimeout(onDismiss, 480); };
  return (
    <div style={{
      position:"fixed",
      top:`calc(env(safe-area-inset-top) + 8px)`,
      left:12,right:12,
      zIndex:800,
      background:"linear-gradient(135deg, rgba(13,27,42,0.95) 0%, rgba(15,34,64,0.95) 100%)",
      backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
      borderRadius:16,
      border:"1px solid rgba(255,255,255,0.08)",
      borderLeft:"3px solid #3b82f6",
      boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
      padding:"12px 14px",
      display:"flex",alignItems:"center",gap:12,
      pointerEvents:"all",
      animation:hiding?"bannerOut 0.4s cubic-bezier(0.4,0,1,1) forwards":"bannerIn 0.35s cubic-bezier(0.2,0,0,1) both",
    }}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:"#ffffff",letterSpacing:-0.2,lineHeight:1.3}}>{notif.title}</div>
        {notif.body&&<div style={{fontSize:12,color:"rgba(255,255,255,0.6)",marginTop:2,lineHeight:1.4,
          overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",
          WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{notif.body}</div>}
      </div>
      <button onClick={doClose} className="btn-press"
        style={{background:"none",border:"none",color:"rgba(255,255,255,0.35)",fontSize:16,cursor:"pointer",
          padding:4,flexShrink:0,minWidth:32,minHeight:32,
          display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
    </div>
  );
}


function Pill({color,label}){
  return <span style={{display:"inline-flex",alignItems:"center",fontSize:10,fontWeight:600,
    color,background:`${color}18`,borderRadius:20,padding:"2px 8px",
    border:`1px solid ${color}35`,letterSpacing:0.3}}>{label}</span>;
}
function Bar({pct,color=T.blue,height=4,style={},glow=false}){
  const [w,setW]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setW(pct),40);return()=>clearTimeout(t);},[pct]);
  const isBlue=color===T.blue;
  return <div style={{background:"rgba(255,255,255,0.08)",borderRadius:99,height,overflow:"hidden",...style}}>
    <div style={{
      background:isBlue?"linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)":color,
      width:`${Math.min(100,Math.max(0,w))}%`,height:"100%",
      borderRadius:99,transition:"width 0.6s cubic-bezier(0.4,0,0.2,1)",
      boxShadow:glow?`0 0 8px rgba(59,130,246,0.6)`:(glow&&color!==T.blue?`0 0 8px ${color}60`:"none")
    }}/>
  </div>;
}
function Card({children,style={},accent,glow=false}){
  return <div style={{
    background:"linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
    borderRadius:20,border:"1px solid rgba(255,255,255,0.08)",
    borderTop:"1px solid rgba(255,255,255,0.12)",
    boxShadow:glow&&accent?`${shadow.card}, 0 0 24px ${accent}20`:shadow.card,
    ...(accent?{borderLeft:`3px solid ${accent}`}:{}),
    ...style}}>{children}</div>;
}
function StarRating({value,onChange}){
  return <div style={{display:"flex",gap:6}}>
    {[1,2,3,4,5].map(s=>(
      <button key={s} onClick={()=>onChange(s)} className="btn-press"
        style={{background:"none",border:"none",fontSize:28,cursor:"pointer",
          color:s<=value?T.yellow:"rgba(255,255,255,0.15)",
          transition:"color 0.15s",padding:"2px 4px",minWidth:44,minHeight:44}}>★</button>
    ))}
  </div>;
}
function SessionHistory({item,sessions,onEdit}){
  const [open,setOpen]=useState(false);
  return <div style={{marginTop:10}}>
    <button onClick={()=>setOpen(o=>!o)} className="btn-press"
      style={{background:"none",border:"none",color:open?T.blue:T.textDim,fontSize:10,
        cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:"4px 0",
        letterSpacing:0.5,fontWeight:600,textTransform:"uppercase",transition:"color 0.2s",minHeight:36}}>
      <span style={{fontSize:8,transition:"transform 0.2s",display:"inline-block",
        transform:open?"rotate(0deg)":"rotate(-90deg)"}}>▼</span>
      Log History
      <span style={{color:T.textFaint,fontWeight:400,textTransform:"none",letterSpacing:0}}>({sessions.length})</span>
    </button>
    <div style={{overflow:"hidden",maxHeight:open?"600px":"0",transition:"max-height 0.3s cubic-bezier(0.4,0,0.2,1)"}}>
      <div style={{marginTop:8,borderLeft:`2px solid rgba(255,255,255,0.1)`,paddingLeft:12}}>
        {sessions.map((s,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"7px 0",borderBottom:`1px solid rgba(255,255,255,0.06)`,
            animation:`fadeUp 0.15s ease ${i*0.04}s both`}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,color:T.textMid,fontWeight:500}}>{s.date}</div>
              <div style={{fontSize:10,color:T.textDim,marginTop:2}}>
                {s.studyHours}h real · {s.courseHours}h content{s.note?` · ${s.note}`:""}
              </div>
            </div>
            <button onClick={()=>onEdit(i)} className="btn-press"
              style={{background:"rgba(59,130,246,0.12)",border:`1px solid rgba(59,130,246,0.25)`,color:T.blue,
                borderRadius:8,padding:"5px 12px",fontSize:10,cursor:"pointer",fontWeight:600,marginLeft:10,minHeight:36,minWidth:44}}>
              Edit</button>
          </div>
        ))}
      </div>
    </div>
  </div>;
}

function SectionBlock({sec,focusIds,getP,setLogging,onReset,onDelete,settings}){
  const [open,setOpen]=useState(false);
  const done=sec.items.filter(i=>getP(i.id).percentComplete>=100).length;
  const active=sec.items.filter(i=>getP(i.id).percentComplete>0&&getP(i.id).percentComplete<100).length;
  const totalContentH=sec.items.reduce((s,i)=>s+(i.hours||0),0);
  const doneContentH=sec.items.reduce((s,i)=>s+(getP(i.id).courseHoursComplete||0),0);
  const pct=totalContentH>0?Math.round((doneContentH/totalContentH)*100):0;
  return <div style={{
    background:"linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
    border:"1px solid rgba(255,255,255,0.08)",borderTop:"1px solid rgba(255,255,255,0.12)",
    borderRadius:20,marginBottom:8,overflow:"hidden",boxShadow:shadow.card}}>
    <div onClick={()=>setOpen(o=>!o)} className="btn-press"
      style={{padding:"14px 16px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",minHeight:56}}>
      <div>
        <div style={{fontSize:13,fontWeight:700,color:T.text,letterSpacing:0.1}}>{sec.label}</div>
        <div style={{fontSize:10,color:T.textDim,marginTop:3}}>{sec.items.length} items · {totalContentH}h content</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:16,fontWeight:900,color:pct>0?T.blue:T.textFaint}}>{pct}%</div>
          <div style={{fontSize:9,color:T.textDim,marginTop:1}}>{done} done · {active} active</div>
        </div>
        <div style={{color:T.textDim,fontSize:11,transition:"transform 0.2s cubic-bezier(0.4,0,0.2,1)",transform:open?"rotate(180deg)":"rotate(0deg)"}}>▼</div>
      </div>
    </div>
    <Bar pct={pct} color={T.blue} style={{margin:"0 16px 10px",height:3}} glow={pct>0}/>
    <div style={{overflow:"hidden",maxHeight:open?"9999px":"0",transition:"max-height 0.35s cubic-bezier(0.4,0,0.2,1)"}}>
      <div style={{padding:"0 12px 12px"}}>
        {sec.items.map(item=>{
          const p=getP(item.id),inFocus=focusIds.includes(item.id);
          const isDone=p.percentComplete>=100,isTouched=p.percentComplete>0&&!isDone;
          const c=gc(item.genre);
          const contentLeft=Math.max(0,(item.hours||0)-(p.courseHoursComplete||0));
          const realLeft=contentToReal(item,contentLeft,settings);
          return <div key={item.id}
            style={{display:"flex",alignItems:"center",gap:10,padding:"8px 6px",
              borderBottom:`1px solid rgba(255,255,255,0.06)`}}>
            <div style={{width:6,height:6,borderRadius:"50%",flexShrink:0,
              background:isDone?T.green:isTouched?c:inFocus?T.pink:"rgba(255,255,255,0.15)"}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,fontWeight:isDone||isTouched?600:400,
                color:isDone?T.green:isTouched?T.text:T.textDim,
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                <span style={{color:T.textDim,marginRight:5}}>{item.id}</span>{item.name}
              </div>
              <div style={{fontSize:9,color:T.textFaint,marginTop:2}}>
                {item.hours}h content{item.genre?` · ${item.genre}`:""}
                {!isDone&&isTouched?` · ${realLeft.toFixed(1)}h real left`:""}
                {inFocus?" · focus":""}
                {item.custom?" · custom":""}
              </div>
            </div>
            <div style={{flexShrink:0,textAlign:"right",display:"flex",alignItems:"center",gap:6}}>
              {isTouched&&<div style={{fontSize:11,fontWeight:700,color:c}}>{p.percentComplete}%</div>}
              {isDone&&<div style={{fontSize:13,color:T.green}}>✓</div>}
              {isDone&&<button onClick={()=>onReset(item)} className="btn-press"
                style={{background:"rgba(239,68,68,0.1)",border:`1px solid rgba(239,68,68,0.3)`,color:T.red,
                  borderRadius:8,padding:"7px 12px",fontSize:10,cursor:"pointer",fontWeight:600,minHeight:44}}>Reset</button>}
              {!isDone&&<button onClick={()=>setLogging(item)} className="btn-press"
                style={{background:"rgba(59,130,246,0.12)",border:`1px solid rgba(59,130,246,0.25)`,color:T.blue,
                  borderRadius:8,padding:"7px 14px",fontSize:11,cursor:"pointer",fontWeight:700,minHeight:44}}>Log</button>}
              <button onClick={()=>onDelete(item)} className="btn-press"
                style={{background:"none",border:`1px solid rgba(239,68,68,0.2)`,color:T.red,
                  borderRadius:8,padding:"7px 10px",fontSize:11,cursor:"pointer",fontWeight:600,opacity:0.7,minHeight:44}}>✕</button>
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

async function requestNotificationPermission(){
  if(!("Notification" in window)) return false;
  if(Notification.permission==="granted") return true;
  return (await Notification.requestPermission())==="granted";
}
function buildItemContext(item,p,settings){
  const contentDone=p.courseHoursComplete||0;
  const contentLeft=Math.max(0,(item.hours||0)-contentDone);
  const realLeft=contentToReal(item,contentLeft,settings);
  const modeTag=item.type==="book"&&item.mode?`|mode=${item.mode}`:"";
  return `${item.id} "${item.name}" (${item.type},${item.section},${item.genre}${modeTag}): `
    +`totalContent=${item.hours}h|contentDone=${contentDone.toFixed(2)}h|pct=${p.percentComplete}%|`
    +`contentLeft=${contentLeft.toFixed(2)}h|realLeft=${realLeft.toFixed(2)}h|realSpent=${(p.hoursSpent||0).toFixed(2)}h`;
}
const callAI=async(prompt,max_tokens=1500,model="claude-sonnet-4-20250514")=>{
  const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model,max_tokens,messages:[{role:"user",content:prompt}]})});
  if(!r.ok){
    let errBody="";
    try{const t=await r.text();errBody=t.slice(0,200);}catch(_){}
    throw new Error(`HTTP ${r.status}${errBody?`: ${errBody}`:""}`);
  }
  const d=await r.json();
  if(d.error) throw new Error(d.error.message||JSON.stringify(d.error).slice(0,200));
  return d.content.map(c=>c.text||"").join("");
};
const loadQueue=()=>load(SK_QUEUE,[]);
const saveQueue=q=>save(SK_QUEUE,q);
const enqueue=(type,payload)=>{const q=loadQueue();q.push({id:Date.now(),type,payload,ts:new Date().toISOString()});saveQueue(q);};
const dequeue=id=>saveQueue(loadQueue().filter(x=>x.id!==id));

function reconcileWeekHours(progress){
  const mon=getMondayDate();
  const sun=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+6,23,59,59,999);
  let total=0;
  Object.values(progress).forEach(p=>{
    (p.sessions||[]).forEach(s=>{
      if(s.isBonus) return; // bonus sessions don't count toward weekly target
      const d=new Date(s.date);
      if(d>=mon&&d<=sun) total+=s.studyHours||0;
    });
  });
  return parseFloat(total.toFixed(2));
}

// ── Side Panel ────────────────────────────────────────────────────────────────
function SidePanel({ open, onClose, reviews, profile, setProfile, onExport, onImport, onClearAll,
  customItems, newItem, setNewItem, addCustomItem, removeCustomItem, getP,
  settings, onSaveSettings, notifs, unreadCount, onMarkRead, onDismissNotif, onClearNotifs,
  onNotifAction, onNotifClose }) {
  const [section, setSection] = useState("settings");
  const [localSettings, setLocalSettings] = useState(settings);
  const [notifOpen, setNotifOpen] = useState(false);
  useEffect(() => setLocalSettings(settings), [settings]);

  const toggleDay = (day) => {
    setLocalSettings(s => {
      const active = s.activeDays.includes(day)
        ? s.activeDays.filter(d => d !== day)
        : [...s.activeDays, day];
      if (active.length === 0) return s;
      return { ...s, activeDays: ALL_DAYS.filter(d => active.includes(d)) };
    });
  };

  const inputSt = {width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid rgba(255,255,255,0.12)`,
    borderRadius:12,padding:"10px 12px",color:T.text,fontSize:16,
    boxSizing:"border-box",fontFamily:"inherit"};
  const numSt = {...inputSt, width:80, textAlign:"center", fontSize:16, fontWeight:700, padding:"8px 10px"};

  return (
    <>
      <div onClick={onClose} style={{
        position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",
        opacity:open?1:0,pointerEvents:open?"all":"none",
        transition:"opacity 0.28s cubic-bezier(0.4,0,0.2,1)",touchAction:open?"none":"auto",
      }}/>
      <div style={{
        position:"fixed",top:0,left:0,bottom:0,width:"min(88vw,360px)",
        background:"linear-gradient(180deg, rgba(13,27,42,0.97) 0%, rgba(15,34,64,0.97) 100%)",
        backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
        zIndex:201,borderRight:`1px solid rgba(255,255,255,0.08)`,
        boxShadow:"4px 0 40px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column",
        transform:open?"translateX(0)":"translateX(-100%)",
        transition:"transform 0.35s cubic-bezier(0.4,0,0.2,1)",
        overflowY:"auto",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain",
      }}>
        <div style={{padding:`calc(env(safe-area-inset-top) + 18px) 18px 14px`,
          borderBottom:`1px solid rgba(255,255,255,0.08)`,flexShrink:0}}>
          <div style={{fontSize:9,color:T.textDim,letterSpacing:4,textTransform:"uppercase",marginBottom:4}}>The Preparation</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:18,fontWeight:800,letterSpacing:-0.3,color:T.text}}>Learning Tracker</div>
            <button onClick={onClose} className="btn-press"
              style={{background:"rgba(255,255,255,0.08)",border:`1px solid rgba(255,255,255,0.1)`,color:T.textMid,
                borderRadius:10,padding:"5px 12px",fontSize:12,cursor:"pointer",fontWeight:700,minHeight:44,minWidth:44}}>✕</button>
          </div>
          <div style={{display:"flex",gap:0,marginTop:14}}>
            {[["settings","Settings"],["history","Reviews"],["notifs","Inbox"]].map(([k,l])=>(
              <button key={k} onClick={()=>setSection(k)} className="btn-press"
                style={{flex:1,padding:"10px 0",background:"none",border:"none",
                  borderBottom:section===k?`2px solid ${T.blue}`:"2px solid transparent",
                  color:section===k?T.blue:T.textDim,fontSize:11,fontWeight:700,cursor:"pointer",
                  textTransform:"uppercase",letterSpacing:0.8,transition:"color 0.2s, border-color 0.2s",
                  position:"relative",minHeight:44}}>
                {l}
                {k==="notifs"&&unreadCount>0&&<span style={{
                  position:"absolute",top:4,right:4,background:T.blue,color:"#fff",
                  borderRadius:"50%",width:14,height:14,fontSize:8,fontWeight:800,
                  display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
                  {unreadCount>9?"9+":unreadCount}
                </span>}
              </button>
            ))}
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px 18px 60px",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain"}}>
          {section==="settings"&&<div style={{animation:"fadeUp 0.28s ease both"}}>

            <div style={{fontSize:9,color:T.blue,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:700}}>
              Learning Profile
            </div>
            <Card style={{padding:"13px 14px",marginBottom:6,borderLeft:`3px solid ${T.blue}`}}>
              <div style={{fontSize:11,color:T.textMid,lineHeight:1.6,marginBottom:10}}>
                The AI reads this every time it plans, adapts, or makes any decision.
              </div>
              <textarea value={profile} onChange={e=>setProfile(e.target.value)}
                style={{...inputSt,height:200,resize:"none",lineHeight:1.6}}
                placeholder="I'm 18, self-directed learner..."/>
            </Card>
            <div style={{fontSize:10,color:T.textDim,marginBottom:20,lineHeight:1.5,paddingLeft:2}}>
              Changes take effect on the next plan or adapt.
            </div>

            <div style={{fontSize:9,color:T.blue,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:700}}>
              Schedule
            </div>
            <Card style={{padding:"13px 14px",marginBottom:6,borderLeft:`3px solid ${T.blue}`}}>

              <div style={{marginBottom:16}}>
                <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:8,fontWeight:600}}>
                  Weekly Hour Target
                </label>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <input type="number" min="5" max="45" step="1"
                    value={localSettings.weeklyTarget}
                    onChange={e => {
                      const raw = e.target.value;
                      setLocalSettings(s => ({ ...s, weeklyTarget: raw === '' ? '' : parseInt(raw) || 5 }));
                    }}
                    onBlur={() => {
                      setLocalSettings(s => ({
                        ...s,
                        weeklyTarget: Math.max(5, Math.min(45, parseInt(s.weeklyTarget) || 20))
                      }));
                    }}
                    style={{...numSt, width:90}}
                  />
                  <div style={{fontSize:12,color:T.textDim}}>hrs / week<br/><span style={{fontSize:10,color:T.textFaint}}>(5 – 45)</span></div>
                </div>
              </div>
              <div>
                <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:8,fontWeight:600}}>
                  Study Days
                </label>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {ALL_DAYS.map(day=>{
                    const on=localSettings.activeDays.includes(day);
                    return <button key={day} onClick={()=>toggleDay(day)} className="btn-press"
                      style={{background:on?"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)":"rgba(255,255,255,0.08)",
                        border:`1px solid ${on?"transparent":"rgba(255,255,255,0.12)"}`,
                        color:on?"#fff":T.textDim,borderRadius:10,padding:"8px 10px",
                        fontSize:11,cursor:"pointer",fontWeight:on?700:400,transition:"all 0.18s",minHeight:44}}>
                      {day}</button>;
                  })}
                </div>
                <div style={{fontSize:10,color:T.textDim,marginTop:8}}>
                  {localSettings.activeDays.length} days · {((localSettings.weeklyTarget||20)/Math.max(1,localSettings.activeDays.length)).toFixed(1)}h avg/day
                </div>
              </div>
            </Card>
            <button onClick={()=>onSaveSettings(localSettings)} className="btn-press"
              style={{width:"100%",background:"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",border:"none",color:"#fff",
                borderRadius:12,padding:"13px 0",fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:20,minHeight:44}}>
              Save Schedule
            </button>

            <div style={{fontSize:9,color:T.blue,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:700}}>
              Study Ratios
            </div>
            <Card style={{padding:"13px 14px",marginBottom:6,borderLeft:`3px solid ${T.blue}`}}>
              <div style={{fontSize:11,color:T.textMid,lineHeight:1.6,marginBottom:12}}>
                How many real hours does 1h of content take? Courses default 2:1, books default 1:1. Allowed: 1.0, 1.5, 2.0, 2.5, 3.0.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <div>
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6,fontWeight:600}}>Course ratio</label>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {[1,1.5,2,2.5,3].map(v=>{
                      const on=(localSettings.courseRatio??2)===v;
                      return <button key={v} onClick={()=>setLocalSettings(s=>({...s,courseRatio:v}))} className="btn-press"
                        style={{background:on?"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)":"rgba(255,255,255,0.08)",border:`1px solid ${on?"transparent":"rgba(255,255,255,0.12)"}`,
                          color:on?"#fff":T.textDim,borderRadius:8,padding:"7px 8px",fontSize:11,
                          cursor:"pointer",fontWeight:on?700:400,transition:"all 0.18s",minHeight:44}}>{v}</button>;
                    })}
                  </div>
                  <div style={{fontSize:10,color:T.textFaint,marginTop:6}}>1h content = {localSettings.courseRatio??2}h real</div>
                </div>
                <div>
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6,fontWeight:600}}>Book ratio</label>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {[1,1.5,2,2.5,3].map(v=>{
                      const on=(localSettings.bookRatio??1)===v;
                      return <button key={v} onClick={()=>setLocalSettings(s=>({...s,bookRatio:v}))} className="btn-press"
                        style={{background:on?"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)":"rgba(255,255,255,0.08)",border:`1px solid ${on?"transparent":"rgba(255,255,255,0.12)"}`,
                          color:on?"#fff":T.textDim,borderRadius:8,padding:"7px 8px",fontSize:11,
                          cursor:"pointer",fontWeight:on?700:400,transition:"all 0.18s",minHeight:44}}>{v}</button>;
                    })}
                  </div>
                  <div style={{fontSize:10,color:T.textFaint,marginTop:6}}>1h content = {localSettings.bookRatio??1}h real</div>
                </div>
              </div>
              <div style={{borderTop:`1px solid rgba(255,255,255,0.08)`,paddingTop:12,marginTop:4}}>
                <div style={{fontSize:11,color:T.textDim,lineHeight:1.5}}>
                  Session lengths are set automatically by tier:<br/>
                  ≤10h → 1.5h/session · ≤20h → 2h · ≤30h → 2.5h · 31h+ → 3h (max 3h absolute).
                  Books are fixed by mode (passage=30min, slow=1h, normal=1.5h, fast=2h).
                </div>
              </div>
            </Card>
            <button onClick={()=>onSaveSettings(localSettings)} className="btn-press"
              style={{width:"100%",background:"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",border:"none",color:"#fff",
                borderRadius:12,padding:"13px 0",fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:20,minHeight:44}}>
              Save Ratios
            </button>

            <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:700}}>Data Backup</div>
            <Card style={{padding:"13px 14px",marginBottom:20}}>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <button onClick={onExport} className="btn-press"
                  style={{flex:1,background:"rgba(255,255,255,0.08)",border:`1px solid rgba(255,255,255,0.12)`,
                    color:T.textMid,borderRadius:12,padding:"12px 0",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:44}}>Export JSON</button>
                <button onClick={onImport} className="btn-press"
                  style={{flex:1,background:"rgba(255,255,255,0.08)",border:`1px solid rgba(255,255,255,0.12)`,
                    color:T.textMid,borderRadius:12,padding:"12px 0",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:44}}>Import JSON</button>
              </div>
              <button onClick={onClearAll} className="btn-press"
                style={{width:"100%",background:"rgba(220,38,38,0.1)",border:`1px solid rgba(239,68,68,0.3)`,
                  color:T.red,borderRadius:12,padding:"12px 0",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:44}}>Clear All Data</button>
            </Card>

            <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:700}}>Add Custom Item</div>
            <Card style={{padding:"13px 14px",marginBottom:12}}>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:5}}>Title *</label>
                <input value={newItem.name} onChange={e=>setNewItem(n=>({...n,name:e.target.value}))}
                  style={inputSt} placeholder="e.g. Introduction to Philosophy"/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div>
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:5}}>Content Hours *</label>
                  <input type="number" min="0.5" step="0.5" value={newItem.hours}
                    onChange={e=>setNewItem(n=>({...n,hours:e.target.value}))}
                    style={inputSt} placeholder="e.g. 12"/>
                </div>
                <div>
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:5}}>Genre *</label>
                  <input value={newItem.genre} onChange={e=>setNewItem(n=>({...n,genre:e.target.value}))}
                    style={inputSt} placeholder="e.g. Philosophy"/>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                <div>
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:5}}>Type</label>
                  <div style={{display:"flex",gap:6}}>
                    {["course","book"].map(t=>(
                      <button key={t} onClick={()=>setNewItem(n=>({...n,type:t}))} className="btn-press"
                        style={{flex:1,background:newItem.type===t?"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)":"rgba(255,255,255,0.08)",
                          border:`1px solid ${newItem.type===t?"transparent":"rgba(255,255,255,0.12)"}`,
                          color:newItem.type===t?"#fff":T.textDim,
                          borderRadius:8,padding:"9px 0",fontSize:11,cursor:"pointer",fontWeight:700,
                          textTransform:"capitalize",transition:"all 0.18s",minHeight:44}}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:5}}>Section</label>
                  <div style={{display:"flex",gap:6}}>
                    {["Core","Optional"].map(sec=>(
                      <button key={sec} onClick={()=>setNewItem(n=>({...n,section:sec}))} className="btn-press"
                        style={{flex:1,background:newItem.section===sec?T.green:"rgba(255,255,255,0.08)",
                          border:`1px solid ${newItem.section===sec?"transparent":"rgba(255,255,255,0.12)"}`,
                          color:newItem.section===sec?"#fff":T.textDim,
                          borderRadius:8,padding:"9px 0",fontSize:11,cursor:"pointer",fontWeight:700,
                          transition:"all 0.18s",minHeight:44}}>{sec}</button>
                    ))}
                  </div>
                </div>
              </div>
              {newItem.type==="course"&&newItem.hours&&<div style={{fontSize:11,color:T.blue,marginBottom:10}}>
                = {(parseFloat(newItem.hours||0)*(localSettings.courseRatio??2)).toFixed(1)}h real study time
              </div>}
              <button onClick={addCustomItem} className="btn-press"
                style={{width:"100%",background:"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",border:"none",color:"#fff",
                  borderRadius:12,padding:"13px 0",fontSize:13,fontWeight:800,cursor:"pointer",minHeight:44}}>
                Add to Curriculum</button>
            </Card>

            {customItems.length>0&&<>
              <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:700}}>
                Custom Items ({customItems.length})
              </div>
              {customItems.map(item=>{
                const p=getP(item.id),c=gc(item.genre);
                return <Card key={item.id} accent={c} style={{padding:"10px 14px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{flex:1,minWidth:0,paddingRight:10}}>
                      <div style={{fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        <span style={{color:T.textDim,marginRight:5}}>{item.id}</span>{item.name}
                      </div>
                      <div style={{fontSize:9,color:T.textDim,marginTop:3}}>
                        {item.type} · {item.section} · {item.genre} · {item.hours}h · {p.percentComplete}%
                      </div>
                    </div>
                    <button onClick={()=>removeCustomItem(item.id)} className="btn-press"
                      style={{background:"none",border:`1px solid ${T.red}20`,color:T.red,
                        borderRadius:7,padding:"4px 10px",fontSize:10,cursor:"pointer",fontWeight:600,flexShrink:0}}>
                      Remove</button>
                  </div>
                  {p.percentComplete>0&&<Bar pct={p.percentComplete} color={c} height={2} style={{marginTop:8}}/>}
                </Card>;
              })}
            </>}
          </div>}

          {section==="notifs"&&<div style={{animation:"fadeUp 0.2s ease both"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:11,color:T.textDim}}>{notifs.length} notification{notifs.length!==1?"s":""} · 3-day history</div>
              {notifs.length>0&&<button onClick={onClearNotifs} className="btn-press"
                style={{background:"none",border:`1px solid rgba(255,255,255,0.12)`,color:T.textDim,
                  borderRadius:8,padding:"6px 12px",fontSize:10,cursor:"pointer",minHeight:36,minWidth:44}}>Clear all</button>}
            </div>
            {typeof Notification!=="undefined"&&Notification.permission!=="granted"&&<button
              onClick={()=>requestNotificationPermission()} className="btn-press"
              style={{width:"100%",background:"rgba(59,130,246,0.12)",border:`1px solid rgba(59,130,246,0.3)`,
                color:T.blue,borderRadius:10,padding:"10px 14px",fontSize:12,cursor:"pointer",
                fontWeight:700,marginBottom:12,minHeight:40}}>
              Enable Notifications
            </button>}
            {notifs.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:T.textDim,fontSize:13}}>
              No notifications yet
            </div>}
            {notifs.map((n,i)=>(
              <div key={n.id} style={{
                background:n.read?"rgba(255,255,255,0.03)":"rgba(59,130,246,0.08)",
                border:`1px solid ${n.read?"rgba(255,255,255,0.06)":"rgba(59,130,246,0.25)"}`,
                borderRadius:14,padding:"12px 14px",marginBottom:8,
                animation:`fadeUp 0.15s ease ${i*0.04}s both`,
              }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    {!n.read&&<div style={{width:6,height:6,borderRadius:"50%",background:T.blue,
                      display:"inline-block",marginRight:6,marginBottom:2,verticalAlign:"middle"}}/>}
                    <span style={{fontSize:12,fontWeight:700,color:n.read?T.textMid:T.text}}>{n.title}</span>
                    <div style={{fontSize:11,color:T.textDim,marginTop:3,lineHeight:1.4}}>{n.body}</div>
                    <div style={{fontSize:10,color:T.textFaint,marginTop:4}}>
                      {new Date(n.ts).toLocaleDateString()} {new Date(n.ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                    </div>
                  </div>
                  <button onClick={()=>onDismissNotif(n.id)} className="btn-press"
                    style={{background:"none",border:"none",color:T.textFaint,fontSize:14,
                      cursor:"pointer",padding:"0 2px",flexShrink:0,minWidth:32,minHeight:32}}>✕</button>
                </div>
                {n.action&&<button onClick={()=>{onNotifAction(n);onMarkRead(n.id);onNotifClose();}} className="btn-press"
                  style={{width:"100%",marginTop:10,background:"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",border:"none",
                    color:"#fff",borderRadius:10,padding:"9px 0",fontSize:11,fontWeight:700,cursor:"pointer",minHeight:44}}>
                  {n.action.label}</button>}
                {!n.read&&<button onClick={()=>onMarkRead(n.id)} className="btn-press"
                  style={{background:"none",border:"none",color:T.textDim,fontSize:10,
                    cursor:"pointer",marginTop:6,padding:0}}>Mark read</button>}
              </div>
            ))}
          </div>}

          {section==="history"&&<div style={{animation:"fadeUp 0.2s ease both"}}>
            {reviews.length===0
              ?<div style={{textAlign:"center",padding:"40px 0",color:T.textDim,fontSize:13}}>
                No reviews yet — write your first Sunday review.
              </div>
              :reviews.map((r,i)=>(
                <Card key={i} style={{padding:"14px 16px",marginBottom:10,animation:`fadeUp 0.18s ease ${i*0.06}s both`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:T.text}}>{r.date}</div>
                      <div style={{fontSize:10,color:T.textDim,marginTop:2}}>
                        {(r.hoursLogged||0).toFixed(1)}h logged
                        {r.completedCount>0?` · ${r.completedCount} completed`:""}
                      </div>
                    </div>
                    <div style={{fontSize:13,color:T.yellow}}>
                      {"★".repeat(r.stars||0)}{"☆".repeat(5-(r.stars||0))}
                    </div>
                  </div>
                  {r.summary&&<div style={{fontSize:12,color:T.textMid,lineHeight:1.6,
                    background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 12px",
                    borderLeft:`2px solid rgba(59,130,246,0.4)`}}>{r.summary}</div>}
                  {r.rawNote&&<div style={{fontSize:10,color:T.textDim,marginTop:8,fontStyle:"italic"}}>"{r.rawNote}"</div>}
                </Card>
              ))}
          </div>}
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main App
// ══════════════════════════════════════════════════════════════════════════════
export default function App(){
  // ── 1. Settings ──
  const [settings, setSettings] = useState(() => {
    const saved = load(SK_SETTINGS, {});
    // Strip removed keys so stale values never bleed into auto-computed logic
    const { courseMaxSession: _cms, bookMaxSession: _bms, _courseMaxRaw: _cmr, _bookMaxRaw: _bmr, ...cleanSaved } = saved;
    return { ...DEFAULT_SETTINGS, ...cleanSaved };
  });
  const WEEKLY_TARGET = Math.max(5, Math.min(45, settings.weeklyTarget ?? 20));
  const ACTIVE_DAYS   = settings.activeDays ?? ALL_DAYS;

  // ── Course/book caps based on weekly hour target ──
  // Book slots = paired books (1 per active course, subject-matched) + free books (genre-contrasting) + passage books (daily, exempt)
  // 5–10h:  1 course, 1 paired book, 0–1 free books → max 2 non-passage, passage books daily
  // 11–15h: 1 course, 1 paired book, 1 free book   → max 2 non-passage, passage books daily
  // 16–20h: 2 courses, 2 paired books, 1 free book  → max 3 non-passage, passage books daily
  // 21–25h: 2 courses, 2 paired books, 1–2 free     → max 4 non-passage, passage books daily
  // 26–30h: 2 courses, 2 paired books, 2 free books → max 4 non-passage, passage books daily
  // 31–35h: 3 courses, 3 paired books, 1–2 free     → max 5 non-passage, passage books daily
  // 36–45h: 3 courses, 3 paired books, 2 free books → max 5 non-passage, passage books daily
  // At every tier: most demanding course first in the day and front-loaded in the week. Below 15h: 1 course only.
  // Passage books: 30 min/day every active day, exempt from all caps, never paired with a course.
  const MAX_COURSES = WEEKLY_TARGET >= 31 ? 3 : WEEKLY_TARGET >= 16 ? 2 : 1;
  const MAX_BOOKS   = WEEKLY_TARGET >= 31 ? 5 : WEEKLY_TARGET >= 21 ? 4 : WEEKLY_TARGET >= 16 ? 3 : 2;

  // ── 2. Core state ──
  const [splash, setSplash]           = useState(true);
  const [customItems, setCustomItems] = useState(()=>load(SK_CUSTOM,[]));
  const [hiddenIds, setHiddenIds]     = useState(()=>load(SK_HIDDEN,[]));

  const CURRICULUM = [...BASE_CURRICULUM,...customItems].filter(i=>!hiddenIds.includes(i.id));
  const SECTIONS=[
    {label:"Core Courses",    items:CURRICULUM.filter(i=>i.type==="course"&&i.section==="Core")},
    {label:"Optional Courses",items:CURRICULUM.filter(i=>i.type==="course"&&i.section==="Optional")},
    {label:"Core Books",      items:CURRICULUM.filter(i=>i.type==="book"&&i.section==="Core")},
    {label:"Optional Books",  items:CURRICULUM.filter(i=>i.type==="book"&&i.section==="Optional")},
  ];

  const [progress, setProgress]       = useState(()=>load(SK_P,{}));
  const [week, setWeek]               = useState(()=>{
    const w=load(SK_W,{weekStart:getMonday(),hoursLogged:0}),mon=getMonday();
    return w.weekStart!==mon?{weekStart:mon,hoursLogged:0}:w;
  });
  const [focus, setFocus]             = useState(()=>{
    const f=load(SK_F,{courses:["A1"],books:["B99","B34"],manual:false});
    if(f.primary!==undefined) return{courses:[f.primary,f.secondary].filter(Boolean),books:f.books||[],manual:false};
    return f;
  });
  const [weekPlan, setWeekPlan]       = useState(()=>{const p=load(SK_PLAN,null);return p?.weekStart===getMonday()?p:null;});
  const [weeklyHours, setWeeklyHours] = useState(()=>load(SK_WEEKLY_HOURS,[]));
  const [reviews, setReviews]         = useState(()=>load(SK_REVIEWS,[]));
  const [profile, setProfile]         = useState(()=>localStorage.getItem(SK_PROFILE)||DEFAULT_PROFILE);

  // ── 3. Derived values (before any functions) ──
  const getP = id => progress[id]||{hoursSpent:0,courseHoursComplete:0,percentComplete:0,sessions:[]};

  const totalSpentRealH = CURRICULUM.reduce((s,i)=>s+(getP(i.id).hoursSpent||0),0);
  const totalRealRemaining = CURRICULUM.filter(i=>getP(i.id).percentComplete<100)
    .reduce((s,i)=>s+realHoursRemaining(i,getP(i.id),settings),0);
  const coreItems = CURRICULUM.filter(i=>i.section==="Core");
  const coreRealRemaining = coreItems.filter(i=>getP(i.id).percentComplete<100)
    .reduce((s,i)=>s+realHoursRemaining(i,getP(i.id),settings),0);
  const weekNum = Math.round(totalSpentRealH / WEEKLY_TARGET) + 1;
  const completedGenres = [...new Set(CURRICULUM.filter(i=>getP(i.id).percentComplete>=100).map(i=>i.genre))];
  const arcPosition = (()=>{
    const y = totalSpentRealH<200?"Year 1 — Foundations":totalSpentRealH<600?"Year 2 — Applied":
              totalSpentRealH<1200?"Year 3 — Specialization":"Year 4 — Integration";
    return `${y}. ${totalSpentRealH.toFixed(0)}h total. Completed genres: ${completedGenres.join(",")||"none"}.`;
  })();
  const weekH    = week.hoursLogged||0;
  const wkRem    = Math.max(0,WEEKLY_TARGET-weekH);
  const focusIds = [...(focus.courses||[]),...(focus.books||[])];
  const focusItems = focusIds.map(id=>CURRICULUM.find(i=>i.id===id)).filter(Boolean);
  const getRemainingActiveDays = (fromIdx=getDayIdx()) =>
    ALL_DAYS.slice(fromIdx).filter(d=>ACTIVE_DAYS.includes(d));
  const dLeft = getRemainingActiveDays().length;

  // ── 4. UI state ──
  const [view, setView]                         = useState("today");
  const [sideOpen, setSideOpen]                 = useState(false);
  const [notifOpen, setNotifOpen]               = useState(false);
  const [logging, setLogging]                   = useState(null);
  const [logForm, setLogForm]                   = useState({contentHours:"",studyHours:"",date:new Date().toLocaleDateString(),showDate:false});
  const [toast, setToast]                       = useState(null);
  const [aiLoading, setAiLoading]               = useState(false);
  const [planGuidance, setPlanGuidance]         = useState("");
  const [aiResult, setAiResult]                 = useState(null);
  const [editFocus, setEditFocus]               = useState(false);
  const [completionBanner, setCompletionBanner] = useState([]);
  const [graduationProposal, setGraduationProposal] = useState(null);
  const [editSession, setEditSession]           = useState(null);
  const [editSessionForm, setEditSessionForm]   = useState({hours:"",courseHours:"",note:""});
  const [missedDayBanner, setMissedDayBanner]   = useState(false);
  const [offlineQueue, setOfflineQueue]         = useState(()=>loadQueue());
  const [isOnline, setIsOnline]                 = useState(navigator.onLine);
  const [bonusItems, setBonusItems]             = useState(()=>load("tp_bonus1",[]));
  const [bonusLoading, setBonusLoading]         = useState(false);
  const [weekCompleteDismissed, setWeekCompleteDismissed] = useState(false);
  const [newItem, setNewItem]                   = useState({name:"",hours:"",type:"course",section:"Core",genre:""});
  const [showSundayReview, setShowSundayReview] = useState(false);
  const [sundayForm, setSundayForm]             = useState({stars:0,note:""});
  const [sundaySubmitting, setSundaySubmitting] = useState(false);
  const prevProgressRef = useRef({});

  const { notifs, push, markRead, clearAll: clearNotifs, dismiss: dismissNotif, unreadCount, currentBanner, dismissBanner } = useNotifications();

  // ── 5. Body scroll lock ──
  useEffect(() => {
    if (sideOpen) document.body.classList.add("menu-open");
    else document.body.classList.remove("menu-open");
    return () => document.body.classList.remove("menu-open");
  }, [sideOpen]);

  // ── 6. Persistence ──
  useEffect(()=>save(SK_P,progress),[progress]);
  useEffect(()=>save(SK_W,week),[week]);
  useEffect(()=>save(SK_F,focus),[focus]);
  useEffect(()=>save(SK_REVIEWS,reviews),[reviews]);
  useEffect(()=>save("tp_bonus1",bonusItems),[bonusItems]);
  useEffect(()=>save(SK_WEEKLY_HOURS,weeklyHours),[weeklyHours]);
  useEffect(()=>localStorage.setItem(SK_PROFILE,profile),[profile]);
  useEffect(()=>save(SK_PLAN,weekPlan),[weekPlan]);
  useEffect(()=>save(SK_CUSTOM,customItems),[customItems]);
  useEffect(()=>save(SK_SETTINGS,settings),[settings]);
  useEffect(()=>save(SK_HIDDEN,hiddenIds),[hiddenIds]);

  // ── 7. Effects ──
  useEffect(()=>{
    const reconciled=reconcileWeekHours(progress);
    setWeek(w=>{
      const mon=getMonday();
      if(w.weekStart!==mon) return{weekStart:mon,hoursLogged:0};
      if(Math.abs((w.hoursLogged||0)-reconciled)>0.01) return{...w,hoursLogged:reconciled};
      return w;
    });
  },[progress]);


  useEffect(()=>{
    const up=()=>{setIsOnline(true);processQueue();};
    const dn=()=>setIsOnline(false);
    window.addEventListener("online",up);window.addEventListener("offline",dn);
    return()=>{window.removeEventListener("online",up);window.removeEventListener("offline",dn);};
  },[]);

  useEffect(()=>{
    const check=()=>{
      const mon=getMonday();
      setWeek(w=>w.weekStart!==mon?{weekStart:mon,hoursLogged:0}:w);
      setWeekPlan(p=>p?.weekStart!==mon?null:p);
      setBonusItems(b=>b?.weekStart&&b.weekStart!==mon?[]:b);
    };
    check();const t=setInterval(check,60000);return()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
    const todayISO=getTodayISO();
    if(isSunday()){
      const doneSunday=load(SK_SUNDAY_DONE,null);
      if(doneSunday!==todayISO&&new Date().getHours()>=18){
        setShowSundayReview(true);
        push("Week Review","Time to review your week and summarize your progress.",{label:"Review Now",type:"sundayReview"});
      }
    }
    if(isMonday()&&new Date().getHours()>=7&&!(weekPlan?.weekStart===getMonday())){
      push("Plan Your Week","Monday — ready to set this week's study plan?",{label:"Plan Now",type:"planWeek"});
      setTimeout(()=>runPlanWeek(true),1500);
    }
  },[]);

  useEffect(()=>{
    if(!weekPlan?.days) return;
    const todayIdx=getDayIdx();
    if(todayIdx===0) return;
    const yesterday=ALL_DAYS[todayIdx-1];
    const yPlan=weekPlan.days.find(d=>d.day===yesterday);
    if(!yPlan?.items?.length) return;
    const plannedH=yPlan.items.reduce((s,i)=>s+(i.realHours||i.hours||0),0);
    if(plannedH===0) return;
    const yDate=new Date();yDate.setDate(yDate.getDate()-1);
    const yStr=yDate.toLocaleDateString();
    const logged=Object.values(progress).some(p=>(p.sessions||[]).some(s=>s.date===yStr));
    if(!logged) setMissedDayBanner(true);
  },[]);

  useEffect(()=>{
    const prev=prevProgressRef.current;
    const newlyDone=Object.entries(progress)
      .filter(([id,p])=>p.percentComplete>=100&&(!prev[id]||prev[id].percentComplete<100))
      .map(([id])=>id);
    if(newlyDone.length>0){
      setCompletionBanner(b=>[...new Set([...b,...newlyDone])]);
      newlyDone.forEach(id=>{
        const item=CURRICULUM.find(i=>i.id===id);
        if(item){
          const todayPlanDay=weekPlan?.days?.find(d=>d.day===getDayName());
          const todayPlanItems=todayPlanDay?.items||[];
          const doneIdx=todayPlanItems.findIndex(it=>it.id===id);
          const nextPlanItem=doneIdx>=0?todayPlanItems.slice(doneIdx+1).find(it=>(progress[it.id]?.percentComplete||0)<100):null;
          const nextFull=nextPlanItem?CURRICULUM.find(c=>c.id===nextPlanItem.id):null;
          const nextStep=nextFull?`Up next: ${nextFull.name}`:`All sessions logged — great work`;
          push(`You finished ${item.name}`,nextStep,{label:"Check-In",type:"viewCheckin"});
        }
        if(!item||item.section!=="Core") return;
        const isInFocus=(focus.courses||[]).includes(id)||(focus.books||[]).includes(id);
        if(!isInFocus) return;
        const nextItem=CURRICULUM.find(i=>
          i.section==="Core"&&(getP(i.id).percentComplete||0)===0&&i.id!==id&&i.type===item.type);
        if(nextItem){
          setGraduationProposal({completed:item,next:nextItem});
          push(
            `Up Next: ${nextItem.id}`,
            `Add "${nextItem.name}" to your focus?`,
            {label:"Add to Focus",type:"graduation",payload:{completed:item,next:nextItem}}
          );
        }
      });
    }
    prevProgressRef.current=progress;
  },[progress]);

  // ── 8. Helpers ──
  const toast_ = m=>{setToast(m);setTimeout(()=>setToast(null),2600);};
  const updateWeeklyHours = h=>{
    const iso=getWeekISO();
    setWeeklyHours(prev=>[{weekISO:iso,realH:h},...prev.filter(w=>w.weekISO!==iso)].slice(0,12));
  };
  const avgWeeklyH = weeklyHours.length>0
    ? weeklyHours.slice(0,4).reduce((s,w)=>s+(w.realH||0),0)/Math.min(4,weeklyHours.length)
    : WEEKLY_TARGET/2;
  const bestWeek = weeklyHours.reduce((b,w)=>w.realH>b?w.realH:b,0);
  const currentStreak = (()=>{let s=0;for(let i=0;i<weeklyHours.length;i++){if(weeklyHours[i].realH>=WEEKLY_TARGET)s++;else break;}return s;})();
  const longestStreak = (()=>{let max=0,cur=0;[...weeklyHours].reverse().forEach(w=>{if(w.realH>=WEEKLY_TARGET){cur++;max=Math.max(max,cur);}else cur=0;});return max;})();
  const genreBalance = (()=>{const map={};CURRICULUM.forEach(i=>{const p=getP(i.id);if(p.hoursSpent>0)map[i.genre]=(map[i.genre]||0)+(p.hoursSpent||0);});return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8);})();

  // ── 9. AI context builder ──
  const buildAIContext = () => {
    // Merge snapshot (Sunday baseline) with live progress — live always wins, snapshot fills gaps
    const snapshot = load(SK_SNAPSHOT, null);
    const snapshotProgress = snapshot?.progress || {};
    const mergedProgress = { ...snapshotProgress, ...progress };
    // Any item the snapshot recorded as complete stays complete even if live data says otherwise
    Object.keys(snapshotProgress).forEach(id => {
      if ((snapshotProgress[id]?.percentComplete || 0) >= 100) {
        if (!mergedProgress[id]) mergedProgress[id] = snapshotProgress[id];
        else if ((mergedProgress[id].percentComplete || 0) < 100)
          mergedProgress[id] = { ...mergedProgress[id], percentComplete: 100 };
      }
    });

    const reviewHistory=reviews.slice(0,6).map((r,i)=>
      `REVIEW ${i+1} (${r.date}, ${r.hoursLogged?.toFixed(1)||0}h, ${r.stars||"?"}★): ${r.summary||r.note||"no summary"}`
    ).join("\n");
    let planVsActual="No plan this week yet.";
    if(weekPlan?.days){
      const pastDays=weekPlan.days.filter(d=>ALL_DAYS.indexOf(d.day)<getDayIdx());
      if(pastDays.length>0){
        planVsActual=pastDays.map(d=>{
          const plannedH=d.items?.reduce((s,it)=>s+(it.realHours||0),0)||0;
          const dayDate=new Date(getMonday()+"T12:00:00");
          dayDate.setDate(dayDate.getDate()+ALL_DAYS.indexOf(d.day));
          const dayStr=dayDate.toLocaleDateString();
          const loggedH=CURRICULUM.reduce((s,i)=>s+(getP(i.id).sessions||[])
            .filter(s=>s.date===dayStr).reduce((ss,x)=>ss+(x.studyHours||0),0),0);
          const status=loggedH===0?"SKIPPED":loggedH>=plannedH*0.85?"HIT":"SHORT";
          return `${d.day}: planned ${plannedH.toFixed(1)}h, logged ${loggedH.toFixed(1)}h [${status}]`;
        }).join("\n");
      }
    }
    const twoWeeksAgo=new Date(Date.now()-14*24*60*60*1000);
    const touchedAndFocus=CURRICULUM
      .filter(i=>getP(i.id).percentComplete>0||focusIds.includes(i.id))
      .map(i=>{
        const p=getP(i.id);
        const recentH=(p.sessions||[]).filter(s=>new Date(s.date)>=twoWeeksAgo).reduce((s,x)=>s+(x.studyHours||0),0);
        const momentum=recentH>3?"HIGH":recentH>0?"LOW":"STALLED";
        return buildItemContext(i,p,settings)+`|momentum=${momentum}(${recentH.toFixed(1)}h/2wk)`;
      }).join("\n");
    const nextCore=CURRICULUM
      .filter(i=>i.section==="Core"&&getP(i.id).percentComplete===0&&!focusIds.includes(i.id))
      .slice(0,8)
      .map(i=>`${i.id} "${i.name}" (${i.type},${i.genre}): ${i.hours}h content=${contentToReal(i,i.hours||0,settings).toFixed(1)}h real`)
      .join("\n");
    const recentWeeks=weeklyHours.slice(0,4);
    const velocityTrend=recentWeeks.length>=2
      ?recentWeeks[0].realH>recentWeeks[1].realH?"↑ accelerating"
      :recentWeeks[0].realH<recentWeeks[1].realH?"↓ decelerating":"→ stable"
      :"insufficient data";
    const avgH=recentWeeks.length>0?(recentWeeks.reduce((s,w)=>s+(w.realH||0),0)/recentWeeks.length).toFixed(1):"—";

    // Separate course and book indexes for better AI guidance matching
    const courseIndex = CURRICULUM
      .filter(i=>i.type==="course")
      .map(i=>`${i.id}:"${i.name}"(course,${i.genre},${i.section})`)
      .join("|");
    const bookIndex = CURRICULUM
      .filter(i=>i.type==="book")
      .map(i=>`${i.id}:"${i.name}"(book,${i.genre},${i.section},mode=${i.mode||"normal"})`)
      .join("|");

    // Use merged (snapshot-aware) progress so completed items are never rescheduled
    const getMP = id => mergedProgress[id]||{hoursSpent:0,courseHoursComplete:0,percentComplete:0,sessions:[]};
    const completedItems=CURRICULUM
      .filter(i=>getMP(i.id).percentComplete>=100)
      .map(i=>`${i.id} "${i.name}" (${i.genre}): COMPLETE`)
      .join("|");
    return{reviewHistory,planVsActual,touchedAndFocus,nextCore,velocityTrend,avgH,courseIndex,bookIndex,completedItems,mergedProgress};
  };

  // ── 10. Today items ──
  const todayItems = () => {
    // Only show today items if there's a plan for this week
    if(!weekPlan||weekPlan.weekStart!==getMonday()) return [];
    if(weekH>=WEEKLY_TARGET) return [];
    const todayName=getDayName();
    if(weekPlan.days){
      const todayPlan=weekPlan.days.find(d=>d.day===todayName);
      if(todayPlan?.items?.length>0){
        return todayPlan.items.map(it=>{
          const item=CURRICULUM.find(i=>i.id===it.id);
          if(!item||getP(it.id).percentComplete>=100) return null;
          const p=getP(it.id);
          const realH=it.realHours||it.hours||1;
          const contentGain=realToContent(item,realH,settings);
          const tgt=targetPctAfterSession(item,p,realH,settings);
          const contentDone=p.courseHoursComplete||0;
          const contentLeft=Math.max(0,(item.hours||0)-contentDone);
          return{...item,allocRealH:realH,contentGain:parseFloat(contentGain.toFixed(2)),
            targetPct:tgt,contentDone:parseFloat(contentDone.toFixed(2)),
            contentTotal:item.hours,contentLeft:parseFloat(contentLeft.toFixed(2))};
        }).filter(Boolean);
      }
    }
    return [];
  };

  // ── 11. AI functions ──
  const processQueue = useCallback(async()=>{
    const q=loadQueue();
    if(!q.length||!navigator.onLine) return;
    for(const item of q){
      try{
        if(item.type==="plan") await runPlanWeek(false);
        dequeue(item.id);setOfflineQueue(loadQueue());toast_("Queued plan synced");
      }catch(e){break;}
    }
  },[]);

  const runPlanWeek = async(auto=false) => {
    if(!navigator.onLine){enqueue("plan",{auto});setOfflineQueue(loadQueue());toast_("Offline — plan queued");return;}
    setAiLoading(true);setAiResult(null);
    const{reviewHistory,planVsActual,touchedAndFocus,nextCore,velocityTrend,avgH,courseIndex,bookIndex,completedItems,mergedProgress}=buildAIContext();
    const todayStr_=new Date().toLocaleDateString();
    const loggedToday_=Object.values(progress).some(p=>(p.sessions||[]).some(s=>s.date===todayStr_));
    const effectiveDayIdx_=loggedToday_?getDayIdx()+1:getDayIdx();
    const remainingDayNames=ALL_DAYS.slice(effectiveDayIdx_).filter(d=>ACTIVE_DAYS.includes(d));
    const effectiveDLeft=remainingDayNames.length;
    const effectiveWkRem=Math.max(0,WEEKLY_TARGET-weekH);
    if(ACTIVE_DAYS.length===0){toast_("Set your active study days to build a plan.");setAiLoading(false);return;}
    if(effectiveDLeft===0||effectiveWkRem===0){toast_("Week complete");setAiLoading(false);return;}
    const dailyMax=getDailyMax(WEEKLY_TARGET);
    const remainingCapacity=parseFloat(Math.min(effectiveWkRem,effectiveDLeft*dailyMax).toFixed(2));
    const isReducedPlan=remainingCapacity<effectiveWkRem;
    const planTarget=remainingCapacity;
    const dayBudgets=distributeDays(planTarget,remainingDayNames,WEEKLY_TARGET);

    const courseMaxThisWeek = getCourseMaxSession(WEEKLY_TARGET);
    // Pre-compute scheduling context — AI arranges a pre-solved puzzle, not raw math
    const schedCtx = buildSchedulingContext(CURRICULUM, mergedProgress||progress, focusIds, settings, WEEKLY_TARGET, remainingDayNames, dayBudgets, dailyMax, remainingCapacity);
    const prompt=`Learning coach. Build this learner's weekly study plan. Respond ONLY with valid JSON — no commentary, no markdown, no code fences.

═══ HOUR MATH (pre-calculated — use exactly) ═══
- Total available: ${planTarget}h real across ${effectiveDLeft} days (${remainingDayNames.join(",")})${isReducedPlan?` [reduced from ${effectiveWkRem}h — only ${effectiveDLeft} day${effectiveDLeft===1?"":"s"} remain]`:""}
- Day budgets: ${remainingDayNames.map((d,i)=>`${d}:${dayBudgets[i]}h`).join("|")}
- Every day's items MUST sum exactly to that day's budget (within 0.25h). Never over or under.
- Courses use ${settings.courseRatio}:1 ratio — 1h content = ${settings.courseRatio}h real. Books use 1:1.
- All math in REAL hours only. Never use content hours for totals.

═══ SESSION LENGTH RULES (non-negotiable) ═══
COURSE SESSIONS:
- Minimum per session: 0.5h (30 min) always
- This week's tier max: ${courseMaxThisWeek}h/session (${WEEKLY_TARGET}h/week tier)
- Absolute maximum: 3h, never exceeded under any circumstances
- Course appears once per day only — extra hours extend the single session up to tier max
- If <0.5h remains for a course after other sessions, complete it using that time
- Replan caveat: if days were missed, AI may extend course sessions up to 0.5h beyond tier max for the remainder of this week only. Never exceed 3h absolute max.

BOOK SESSIONS (fixed by mode field — no exceptions ever):
- passage → exactly 0.5h (30 min) hard cap, NEVER extended for any reason including hitting hour target
- slow → default 1h, minimum 0.5h, maximum 3h
- normal → default 1.5h, minimum 0.5h, maximum 3h
- fast → default 2h, minimum 0.5h, maximum 3h
- Passage books are identified by mode==="passage" — never use a hardcoded list

═══ DAILY HARD CAP ═══
- Maximum ${dailyMax}h planned per day, never exceeded (day budgets already reflect this)
- When daily cap or budget forces cuts, use this order: cut free books first → reduce paired book sessions to minimum → reduce course sessions to 0.5h minimum → NEVER cut passage books

═══ PRIORITY HIERARCHY (non-negotiable, enforce in this exact order) ═══
1. ${dailyMax}h daily hard cap
2. Passage book 30 min hard cap
3. Course interleaving (never same course two consecutive days)
4. Focus caps
5. Hour target — goal not requirement; plan runs short before breaking any rule above

═══ COURSE SCHEDULING ═══
- Daily session order: (1) Passage books — 0.5h each. (2) Most demanding course. (3) Paired book. (4) Free book.
- Cognitive demand ranking (schedule first/front-load in week): Physics/Biology/Chemistry/Mathematics → History/Philosophy/Literature → Business/Sales/Marketing/Investing/Law
- Most demanding course goes FIRST each day (after passage books) and is front-loaded earlier in the week
- Multiple courses MUST be interleaved — never the same course two days in a row
- If only one course is active, it may appear daily
- Below 15h/week: only 1 course, no exceptions
- 2-course tiers (16–30h): both courses MUST be from contrasting subject domains — never same or similar genre
- 3-course tiers (31–45h): all three from different subject domains, rotate so none repeats on consecutive days
- Course finishes mid-week: mark complete, leave slot empty rest of week, auto-select replacement at Sunday session

═══ FOCUS CAPS (strictly enforced) ═══
- Max active: ${MAX_COURSES} course(s) + ${MAX_BOOKS} non-passage book(s) at ${WEEKLY_TARGET}h/week
- Passage books (mode=passage) EXEMPT from all caps — always include every active passage book every day
- 5–10h: 1 course, 1 paired book, 0–1 free books
- 11–15h: 1 course, 1 paired book, 1 free book — only 1 course at this tier, no exceptions
- 16–20h: 2 courses, 2 paired books, 1 free book — must be contrasting domains
- 21–25h: 2 courses, 2 paired books, 1–2 free books
- 26–30h: 2 courses, 2 paired books, 2 free books
- 31–35h: 3 courses, 3 paired books, 1–2 free books — all different domains
- 36–45h: 3 courses, 3 paired books, 2 free books

═══ BOOK PAIRING DOMAIN MAP ═══
Each active course gets exactly 1 PAIRED book. Use ONLY the IDs listed for each domain:
- Biology, Medicine, Science courses → B1, B2, B22, B48, B52, B56, B101
- History, World History, American History courses → B5, B7, B11, B12, B20, B21, B26, B33, B37, B40, B42, B44, B45, B46, B47, B50, B58, B80, B81, B82, B90, B91, B111, B123, B124, B126, B127, B128, B129, B130, B131, B132, B133, B134, B135, B137, B138, B139, B142, B143, B144, B151, B152, B153, B154, B173, B174
- Philosophy, Logic, Ethics courses → B9, B10, B13, B16, B17, B18, B30, B31, B38, B60, B61, B95, B100, B116, B146, B149, B150, B155
- Investing, Economics, Accounting, Finance courses → B58, B62, B63, B64, B65, B66, B68, B69, B70, B71, B72, B73, B74, B75, B76, B77, B78, B79, B80, B81, B82, B83, B84, B85, B86, B87, B88, B89, B90, B91, B92, B93, B94, B136, B158, B159, B160, B161, B162, B163, B164, B165, B166, B167, B168, B169, B170, B171, B172
- Marketing, Sales, Entrepreneur courses → B23, B25, B27, B28, B29, B62, B63, B64, B65, B66, B68, B69, B70, B71, B72, B73, B74, B75, B76, B175, B176, B177, B180, B181, B182, B183
- Physics, Astronomy courses → B3, B4, B48, B101
- Pilot, Welder, Maker, Tinker courses → B3, B4, B59, B96, B184
- Literature, Writing courses → B11, B20, B21, B24, B32, B38, B41, B43, B44, B54, B55, B97, B98, B102, B103, B104, B105, B106, B107, B108, B109, B110, B112, B113, B114, B115, B117, B118, B119, B120, B121, B122, B125
- Law courses → B13, B16, B17, B18, B29
- Nature, Geology courses → B22, B51, B178, B179
- Psychology courses → B10, B149, B150
- Music, Art courses → no direct pairing — use free book slot instead

FREE BOOK SLOTS (${Math.max(0, MAX_BOOKS - MAX_COURSES)} slot(s) at this tier):
- Must contrast with all active course subjects
- Prefer: Cowboy (B5, B6, B7, B8), Sailor (B42, B44, B45, B46, B47, B48), Survivalist (B49, B50, B51, B53), Farmer (B57), Chef (B14, B15), narrative fiction, adventure
- Soften contrast rule — prefer contrast but allow same genre if no alternatives exist within current focus tier
- Passage books NEVER count as free book slots
- Book finishes mid-week: mark complete, leave slot empty rest of week, replace at Sunday session
- Slow book stalled 4+ weeks under 25% progress: flag in insight field and suggest replacement

BOOK AUTO-SELECTION (when slots need filling):
1. Paired slots: use domain map above to match active course subject
2. Free slots: prefer genre contrast, then outlier genres (cowboy, sailor, survivalist, chef, adventure)
3. Prefer earliest unstarted Core book as tiebreaker
4. Weight by learning profile interests
Selections must feel like a real tutor chose them, not mechanical sequence following.

═══ REPLAN RULES ═══
- Completed days are LOCKED — never modify them
- Missed sessions are NOT redistributed — they become context for next Sunday planning
- Overflow: flag in insight field, never stack on current plan
- Missed weeks: treat as gap, plan fresh from actual progress, no catch-up stacking ever

═══ PLANNING PROCESS (execute in this exact order) ═══
1. Read learner profile, arc position, velocity trend
2. Read ALL COMPLETED ITEMS — source of truth, never assume progress
3. Read all active items with current progress and momentum
4. Read last weekly review for energy/difficulty signals
5. Scan full curriculum: balance subjects, prioritize items near completion (>70%), honor genre variety, use best judgment not blind sequence
6. Apply priority hierarchy: passage books → session caps → course interleaving → focus caps → hour target
7. Assign paired books (1 per course, domain map), fill remaining slots with contrasting free books
8. Build day-by-day schedule matching exact day budgets

═══ CONTEXT ═══
LEARNER PROFILE:
${profile}

JOURNEY: Week ~${weekNum}. ARC: ${arcPosition}
VELOCITY: ${velocityTrend}. 4-week avg: ${avgH}h/wk.
${planGuidance?`\nGUIDANCE FROM LEARNER: "${planGuidance}"\nFor courses: search COURSE INDEX by genre/title. For books: search BOOK INDEX by title and genre. Map to real IDs only. Example: "philosophy books" → B9, B16, B30, B34, B95, B99, B100 etc.`:""}

COMPLETED (do NOT reschedule — context only):
${completedItems||"None yet."}

CURRENT FOCUS (${focus.manual?"MANUAL — respect it":"AI-managed"}): ${focusIds.join(",")}

LAST WEEKLY REVIEW:
${reviewHistory?.split("\n")[0]||"None yet."}

ACTIVE ITEMS (progress and momentum):
${touchedAndFocus||"None."}

NEXT UNTOUCHED CORE:
${nextCore.slice(0,400)}

COURSE INDEX (ONLY use these IDs for courses):
${courseIndex.slice(0,2000)}

BOOK INDEX (ONLY use these IDs for books):
${bookIndex.slice(0,2500)}

FOCUS PROPOSAL RULES:
- Keep MAX_COURSES=${MAX_COURSES}, MAX_BOOKS=${MAX_BOOKS} (passage books excluded)
- Always keep ≥1 Philosophy book active
- Never propose Optional when Core genre has unfinished items
- Only rotate if >85% complete OR 0 momentum for 2+ weeks
- At 2+ courses: must be contrasting subject domains
- At 3 courses: all must be different subject domains
- Below 15h: propose only 1 course
- For each proposed course, include 1 paired book (domain map) + contrasting free books

PRE-COMPUTED SCHEDULE DATA (use these exact numbers — do not recalculate):
${JSON.stringify(schedCtx, null, 0)}

RESPOND ONLY WITH VALID JSON — no commentary, no markdown, no code fences. Use this exact schema:
{"days":[{"day":"Mon","totalDayRealH":3,"sessions":[{"itemId":"A1","itemName":"Biology","type":"course","mode":null,"sessionHours":1.5,"order":1}]}],"insight":"1 sentence","assessment":"1 sentence","nextMilestone":"1 sentence","flags":[],"focusProposal":{"courses":["A1"],"books":["B34","B99"],"reasoning":"1 sentence"}}`;

    // Attempt AI call with up to 3 retries if validation fails
    let lastErr = null;
    for(let attempt=0; attempt<3; attempt++){
      try{
        const raw=await callAI(prompt,2200,"claude-sonnet-4-20250514");
        const jsonMatch=raw.replace(/```json[\s\S]*?```/g,m=>m.slice(7,-3)).replace(/```/g,"").trim().match(/\{[\s\S]*\}/);
        if(!jsonMatch) throw new Error("No JSON in response");
        const parsed=JSON.parse(jsonMatch[0]);

        // Normalize new schema → internal format (handles both old .items and new .sessions)
        const normalizedDays = normalizeParsedDays(parsed.days, remainingDayNames);

        // Strip completed items, apply scaleDayItems
        const validatedDays=normalizedDays.map((day,i)=>{
          const budget=dayBudgets[i]??dayBudgets[dayBudgets.length-1]??snap25(planTarget/effectiveDLeft);
          const filteredItems=day.items.filter(it=>{
            const p=getP(it.id);
            return CURRICULUM.find(c=>c.id===it.id)&&(p.percentComplete||0)<100;
          });
          const scaledItems=scaleDayItems(filteredItems,budget,id=>CURRICULUM.find(c=>c.id===id),id=>getP(id),settings);
          // Lock session order: passage → courses by demand → books
          const sortedItems=sortDaySessions(scaledItems,CURRICULUM);
          return{...day,totalDayRealH:budget,items:sortedItems};
        });

        // Budget drift correction on last day
        const grandTotal=parseFloat(validatedDays.reduce((s,d)=>s+(d.totalDayRealH||0),0).toFixed(2));
        const drift=parseFloat((planTarget-grandTotal).toFixed(2));
        if(Math.abs(drift)>=0.05&&validatedDays.length>0){
          const last=validatedDays[validatedDays.length-1];
          const newDayH=parseFloat((last.totalDayRealH+drift).toFixed(2));
          const rescaled=scaleDayItems(last.items,newDayH,id=>CURRICULUM.find(c=>c.id===id),id=>getP(id),settings);
          validatedDays[validatedDays.length-1]={...last,totalDayRealH:newDayH,items:sortDaySessions(rescaled,CURRICULUM)};
        }

        // JS validation layer — reject and retry if hard rules broken
        const errs=validatePlanRules(validatedDays,CURRICULUM,mergedProgress||progress,focusIds,MAX_COURSES,MAX_BOOKS,WEEKLY_TARGET);
        if(errs.length>0){
          console.warn(`Plan validation failed (attempt ${attempt+1}):`,errs);
          lastErr=`Validation: ${errs[0]}`;
          continue; // retry
        }

        const keptDays=(weekPlan?.days||[]).filter(d=>{
          const dIdx=ALL_DAYS.indexOf(d.day);
          return dIdx<effectiveDayIdx_;
        });
        const insight=parsed.insight||parsed.weekSummary||"";
        const plan={weekStart:getMonday(),generatedAt:new Date().toISOString(),
          days:[...keptDays,...validatedDays],totalPlannedHours:planTarget,
          reasoning:insight,assessment:parsed.assessment||"",nextMilestone:parsed.nextMilestone||"",
          focusReasoning:parsed.focusProposal?.reasoning||"",activeFocusIds:focusIds,
          flags:parsed.flags||[]};
        setWeekPlan(plan);
        setAiResult({...parsed,insight}); // ensure insight is always present for UI
        updateWeeklyHours(weekH);
        const planReadyBody=isReducedPlan
          ?`${effectiveDLeft} day${effectiveDLeft===1?"":"s"} remaining — reduced schedule of ${planTarget}h`
          :(insight||"Your week has been planned. Tap to view.");
        push("Week Plan Ready",planReadyBody,{label:"View Week",type:"viewWeek"});
        lastErr=null;
        break; // success
      }catch(e){
        console.error(`Plan attempt ${attempt+1} error:`,e);
        lastErr=e.message||"Unknown error";
      }
    }
    if(lastErr){
      if(isReducedPlan){
        push(`${effectiveDLeft} day${effectiveDLeft===1?"":"s"} remaining`,`Planning a reduced schedule of ${planTarget}h`,{label:"View Week",type:"viewWeek"});
      } else {
        toast_(`Planning failed: ${lastErr}`);
      }
    }
    setAiLoading(false);
  };

  const saveSundayReview = async() => {
    if(!sundayForm.stars){toast_("Pick a star rating first");return;}
    setSundaySubmitting(true);
    const completedThisWeek=CURRICULUM.filter(i=>{
      const sessions=(progress[i.id]?.sessions||[]);
      const mon=getMondayDate();
      const sun=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+6,23,59,59,999);
      return sessions.some(s=>{const d=new Date(s.date);return d>=mon&&d<=sun;})&&(progress[i.id]?.percentComplete||0)>=100;
    }).map(i=>i.id);
    let summary=sundayForm.note||"";
    if(sundayForm.note.trim()&&navigator.onLine){
      try{
        const sumPrompt=`Summarize this learner's weekly review in 2-3 sentences for future AI planning. Learner profile: "${profile.slice(0,300)}". Raw review: "${sundayForm.note}" | Hours: ${weekH.toFixed(1)}h | Stars: ${sundayForm.stars}/5 | Completed: ${completedThisWeek.join(",")||"none"}. Only the summary, no preamble.`;
        summary=await callAI(sumPrompt,200,"claude-sonnet-4-20250514");
      }catch(e){summary=sundayForm.note;}
    }
    const entry={weekStart:getMonday(),date:new Date().toLocaleDateString(),
      stars:sundayForm.stars,rawNote:sundayForm.note,summary,
      hoursLogged:weekH,focusIds:[...(focus.courses||[]),...(focus.books||[])],
      completedCount:completedThisWeek.length};
    setReviews(prev=>[entry,...prev.filter(r=>r.weekStart!==getMonday())].slice(0,MAX_REVIEWS));
    updateWeeklyHours(weekH);
    save(SK_SUNDAY_DONE,getTodayISO());
    // Save full progress snapshot — used as planning source of truth for the new week
    save(SK_SNAPSHOT,{progress,focus,weekStart:getMonday(),savedAt:new Date().toISOString()});
    setShowSundayReview(false);setSundayForm({stars:0,note:""});setSundaySubmitting(false);
    toast_("Week reviewed and summarized");
  };


  const runBonusSuggestions = async() => {
    if(!navigator.onLine){toast_("Offline");return;}
    setBonusLoading(true);
    const{touchedAndFocus,nextCore,courseIndex,bookIndex}=buildAIContext();
    const bonusCourseMax = getCourseMaxSession(WEEKLY_TARGET);
    // Compute genres studied this week
    const weekGenres=new Set(CURRICULUM.filter(i=>{
      const mon=new Date(getMonday());
      return (getP(i.id).sessions||[]).some(s=>new Date(s.date)>=mon);
    }).map(i=>i.genre));
    const untouchedGenres=[...new Set(CURRICULUM.filter(i=>(getP(i.id).percentComplete||0)<100).map(i=>i.genre))].filter(g=>!weekGenres.has(g));
    const mostStudiedGenre=[...weekGenres][0]||"";
    const prompt=`Learner hit their ${WEEKLY_TARGET}h weekly target. Suggest exactly 3 bonus items — one for each category. Bonus sessions are purely exploratory with no hour cap. JSON only — no commentary.
PROFILE: ${profile}
JOURNEY: Week ~${weekNum}. ARC: ${arcPosition}
HOUR RULES: Courses: max ${bonusCourseMax}h/session. Books: passage=0.5h, slow=1h, normal=1.5h, fast=2h.
GENRES STUDIED THIS WEEK: ${[...weekGenres].join(",")||"none"}
UNTOUCHED GENRES (pick from these for category 1): ${untouchedGenres.slice(0,10).join(",")||"any"}
MOST STUDIED GENRE (pair with for category 2): ${mostStudiedGenre}
CURRENT FOCUS: ${focusIds.join(",")}
ACTIVE: ${touchedAndFocus||"None."}
NEXT CORE: ${nextCore.slice(0,300)}
COURSE INDEX: ${courseIndex.slice(0,800)}
BOOK INDEX: ${bookIndex.slice(0,1000)}
CATEGORIES — suggest exactly one item per category:
1. "untouched_domain": Item from a genre NOT studied at all this week
2. "paired": Item that complements or pairs with the most-studied subject this week
3. "wildcard": Item that matches the learner's profile interests or section of the 4-year arc
Respond ONLY with valid JSON:
{"items":[{"id":"A1","realHours":1.5,"contentHours":0.75,"category":"untouched_domain"},{"id":"B10","realHours":1.0,"contentHours":1.0,"category":"paired"},{"id":"A5","realHours":2.0,"contentHours":1.0,"category":"wildcard"}],"note":"one sentence"}`;
    try{
      const raw=await callAI(prompt,700);
      const clean=raw.replace(/```json|```/g,"").trim();
      const jsonMatch=clean.match(/\{[\s\S]*\}/);
      if(!jsonMatch) throw new Error("No JSON found");
      const parsed=JSON.parse(jsonMatch[0]);
      if(!parsed.items||!Array.isArray(parsed.items)) throw new Error("Invalid structure");
      const validItems=parsed.items.filter(it=>CURRICULUM.find(c=>c.id===it.id)&&getP(it.id).percentComplete<100);
      setBonusItems({items:validItems,note:parsed.note||"",generatedAt:new Date().toISOString(),weekStart:getMonday()});
    }catch(e){console.error("Bonus error:",e);toast_(`Couldn't generate bonus: ${e.message?.slice(0,40)||"unknown"}`);}
    setBonusLoading(false);
  };

  const redistributeLeftover = (completedId, leftoverH) => {
    if(!weekPlan?.days || leftoverH < 0.25) return;
    const todayName = getDayName();
    setWeekPlan(prev => {
      if(!prev?.days) return prev;
      const days = prev.days.map(day => {
        if(day.day !== todayName) return day;
        const items = [...(day.items || [])];
        const completedIdx = items.findIndex(it => it.id === completedId);
        if(completedIdx < 0) return day;
        // Find next uncompleted session in the day
        const nextIdx = items.slice(completedIdx + 1).findIndex(it => (progress[it.id]?.percentComplete||0) < 100);
        const absNextIdx = nextIdx >= 0 ? completedIdx + 1 + nextIdx : -1;
        if(absNextIdx >= 0) {
          const nextItem = CURRICULUM.find(c => c.id === items[absNextIdx].id);
          if(nextItem) {
            const modeMax = maxRealPerSession(nextItem, settings);
            const current = items[absNextIdx].realHours || 0;
            const extended = parseFloat(Math.min(current + leftoverH, modeMax).toFixed(2));
            if(extended > current + 0.1) {
              items[absNextIdx] = { ...items[absNextIdx], realHours: extended };
              return { ...day, items };
            }
          }
        } else if(leftoverH >= 0.5) {
          // No extendable next session — add free book from focus
          const inTodayIds = new Set(items.map(it => it.id));
          const freeBook = (focus.books || [])
            .map(bid => CURRICULUM.find(c => c.id === bid))
            .find(b => b && !inTodayIds.has(b.id) && (progress[b.id]?.percentComplete||0) < 100 && b.mode !== 'passage');
          if(freeBook) {
            const sessionH = parseFloat(Math.min(leftoverH, maxRealPerSession(freeBook, settings)).toFixed(2));
            const ch = parseFloat(realToContent(freeBook, sessionH, settings).toFixed(3));
            const tgt = targetPctAfterSession(freeBook, progress[freeBook.id]||{}, sessionH, settings);
            items.push({ id: freeBook.id, realHours: sessionH, contentHours: ch, targetPct: tgt });
            return { ...day, items };
          }
        }
        return day;
      });
      return { ...prev, days };
    });
  };

  const submitLog = () => {
    const isCourse=logging.type==="course";
    const studyH=parseFloat(logForm.studyHours||0);
    if(!studyH||studyH<=0) return;
    if(isCourse&&!parseFloat(logForm.contentHours||0)) return;
    const contentH=isCourse?parseFloat(logForm.contentHours):studyH;
    const id=logging.id,tot=logging.hours||1;
    const prevContent=progress[id]?.courseHoursComplete||0;
    const newContent=Math.min(prevContent+contentH,tot);
    const newPct=Math.round((newContent/tot)*100);
    const dateStr=logForm.date;
    const isBonus=bonusItems?.items?.some(b=>b.id===id)||false;
    const pace=studyH>0?parseFloat((contentH/studyH).toFixed(4)):null;
    setProgress(p=>({...p,[id]:{
      hoursSpent:(p[id]?.hoursSpent||0)+studyH,
      courseHoursComplete:newContent,percentComplete:newPct,
      ...(pace!==null?{lastPace:pace}:{}),
      sessions:[...(p[id]?.sessions||[]),
        {date:dateStr,studyHours:studyH,courseHours:parseFloat(contentH.toFixed(3)),...(isBonus?{isBonus:true}:{})}]
    }}));
    if(newPct>=100){
      setFocus(f=>({...f,
        courses:(f.courses||[]).filter(cid=>cid!==id),
        books:(f.books||[]).filter(bid=>bid!==id),
      }));
    }
    if(newPct>=100&&planIsFromThisWeek){
      const allocRealH=weekPlan?.days?.find(d=>d.day===getDayName())?.items?.find(it=>it.id===id)?.realHours??0;
      const leftover=parseFloat((allocRealH-studyH).toFixed(2));
      if(leftover>=0.25) redistributeLeftover(id,leftover);
    }
    setLogging(null);
    setLogForm({contentHours:"",studyHours:"",date:new Date().toLocaleDateString(),showDate:false});
    const mon=getMondayDate(),sun=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+6,23,59,59,999);
    const sd=new Date(dateStr);
    toast_(`${studyH}h logged · ${logging.name}${sd<mon||sd>sun?" (prev week)":""}`);
  };

  const openEditSession=(itemId,idx)=>{
    const s=(progress[itemId]?.sessions||[])[idx];
    setEditSession({itemId,sessionIdx:idx});
    setEditSessionForm({hours:String(s.studyHours),courseHours:String(s.courseHours||s.studyHours),note:s.note||""});
  };
  const saveEditSession=()=>{
    const{itemId,sessionIdx}=editSession;
    const item=CURRICULUM.find(i=>i.id===itemId);
    const sessions=[...(progress[itemId]?.sessions||[])];
    const old=sessions[sessionIdx];
    const newRealH=parseFloat(editSessionForm.hours)||0;
    const newContentH=parseFloat(editSessionForm.courseHours)||realToContent(item,newRealH,settings);
    sessions[sessionIdx]={...old,studyHours:newRealH,courseHours:newContentH,note:editSessionForm.note};
    const tot=item?.hours||1;
    const newContentTotal=Math.min(sessions.reduce((s,x)=>s+(x.courseHours||0),0),tot);
    const newSpent=sessions.reduce((s,x)=>s+(x.studyHours||0),0);
    setProgress(p=>({...p,[itemId]:{...p[itemId],sessions,
      courseHoursComplete:newContentTotal,hoursSpent:newSpent,
      percentComplete:Math.round((newContentTotal/tot)*100)}}));
    setEditSession(null);toast_("Session updated");
  };
  const deleteSession=()=>{
    const{itemId,sessionIdx}=editSession;
    const item=CURRICULUM.find(i=>i.id===itemId);
    const sessions=[...(progress[itemId]?.sessions||[])];
    const removed=sessions.splice(sessionIdx,1)[0];
    const tot=item?.hours||1;
    const newContent=Math.max(0,(progress[itemId]?.courseHoursComplete||0)-(removed.courseHours||0));
    const newSpent=Math.max(0,(progress[itemId]?.hoursSpent||0)-(removed.studyHours||0));
    setProgress(p=>({...p,[itemId]:{...p[itemId],sessions,
      courseHoursComplete:newContent,hoursSpent:newSpent,
      percentComplete:Math.round((newContent/tot)*100)}}));
    setEditSession(null);toast_("Session deleted");
  };
  const applyFocusProposal=proposal=>{
    setFocus({courses:proposal.courses,books:proposal.books,manual:false});
    setAiResult(r=>({...r,focusProposal:null}));
    toast_("Focus updated");
  };
  const addCustomItem=()=>{
    const{name,hours,type,section,genre}=newItem;
    if(!name.trim()||!hours||!genre.trim()){toast_("Fill in name, hours, and genre");return;}
    const prefix=type==="course"?"C":"D";
    const existing=customItems.filter(i=>i.id.startsWith(prefix));
    const maxNum=existing.reduce((m,i)=>{const n=parseInt(i.id.slice(1));return n>m?n:m;},0);
    const id=`${prefix}${maxNum+1}`;
    setCustomItems(prev=>[...prev,{id,name:name.trim(),hours:parseFloat(hours),type,section,genre:genre.trim(),custom:true}]);
    setNewItem({name:"",hours:"",type:"course",section:"Core",genre:""});
    toast_(`Added ${id}: ${name}`);
  };
  const removeCustomItem=id=>{setCustomItems(prev=>prev.filter(i=>i.id!==id));toast_("Item removed");};

  const deleteItem = (item) => {
    if(!window.confirm(`Remove "${item.name}" from curriculum? Progress data kept.`)) return;
    if(item.custom){
      removeCustomItem(item.id);
    } else {
      setHiddenIds(prev=>[...prev,item.id]);
    }
    setFocus(f=>({
      ...f,
      courses:(f.courses||[]).filter(id=>id!==item.id),
      books:(f.books||[]).filter(id=>id!==item.id),
    }));
    toast_(`${item.id} removed from curriculum`);
  };

  const doExport=()=>{
    const data={progress,week,focus,reviews,profile,weekPlan,weeklyHours,customItems,settings,hiddenIds};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;
    a.download=`the-preparation-${getTodayISO()}.json`;a.click();URL.revokeObjectURL(url);
    localStorage.setItem("tp_last_export",String(Date.now()));toast_("Exported");
  };
  const doImport=()=>{
    const inp=document.createElement("input");inp.type="file";inp.accept=".json";
    inp.onchange=e=>{
      const file=e.target.files[0];if(!file) return;
      const reader=new FileReader();
      reader.onload=ev=>{
        try{
          const d=JSON.parse(ev.target.result);
          if(d.progress) setProgress(d.progress);
          if(d.week) setWeek(d.week);
          if(d.focus) setFocus(d.focus);
          if(d.reviews) setReviews(d.reviews);
          if(d.profile) setProfile(d.profile);
          if(d.weekPlan) setWeekPlan(d.weekPlan);
          if(d.weeklyHours) setWeeklyHours(d.weeklyHours);
          if(d.customItems) setCustomItems(d.customItems);
          if(d.settings) setSettings(d.settings);
          if(d.hiddenIds) setHiddenIds(d.hiddenIds);
          toast_("Imported");
        }catch{toast_("Import failed");}
      };
      reader.readAsText(file);
    };
    inp.click();
  };
  const doClearAll=()=>{
    if(!window.confirm("Clear ALL data? Export first.")) return;
    if(!window.confirm("Are you sure? Cannot be undone.")) return;
    [SK_P,SK_W,SK_F,SK_REVIEWS,SK_PROFILE,SK_PLAN,SK_QUEUE,SK_WEEKLY_HOURS,"tp_bonus1",SK_CUSTOM,SK_SUNDAY_DONE,"tp_last_export",SK_SETTINGS,SK_NOTIFS,SK_HIDDEN]
      .forEach(k=>localStorage.removeItem(k));
    const defaultFocus={courses:["A1"],books:["B99","B34"],manual:false};
    setProgress({});setWeek({weekStart:getMonday(),hoursLogged:0});
    setFocus(defaultFocus);setReviews([]);
    setProfile(DEFAULT_PROFILE);setWeekPlan(null);setWeeklyHours([]);
    setBonusItems([]);setOfflineQueue([]);setCustomItems([]);
    setSettings(DEFAULT_SETTINGS);setHiddenIds([]);
    setCompletionBanner([]);setAiResult(null);
    clearNotifs();
    // Immediately persist default focus so no stale state can be re-hydrated
    save(SK_F,defaultFocus);
    toast_("All data cleared");
  };

  // ── Derived render values ──
  const totalItems  = CURRICULUM.length;
  const doneItems   = CURRICULUM.filter(i=>getP(i.id).percentComplete>=100).length;
  const coreDoneItems = coreItems.filter(i=>getP(i.id).percentComplete>=100).length;
  const wksLeft     = Math.round(totalRealRemaining/WEEKLY_TARGET);
  const coreWksLeft = Math.round(coreRealRemaining/WEEKLY_TARGET);
  const estDate     = new Date(Date.now()+wksLeft*7*24*60*60*1000)
    .toLocaleDateString("en-CA",{year:"numeric",month:"short"});
  const coreEstDate = new Date(Date.now()+coreWksLeft*7*24*60*60*1000)
    .toLocaleDateString("en-CA",{year:"numeric",month:"short"});
  const planIsFromThisWeek = weekPlan&&weekPlan.weekStart===getMonday();
  const allWeekSessionsDone = planIsFromThisWeek && !weekCompleteDismissed &&
    (weekPlan?.days?.length||0)>0 &&
    weekPlan.days.flatMap(d=>d.items||[]).every(it=>getP(it.id).percentComplete>=100);
  const today = todayItems();

  const todayName_ = getDayName();
  const todayDateStr = new Date().toLocaleDateString();
  const todayPlannedH = (() => {
    if(planIsFromThisWeek&&weekPlan.days){
      const d=weekPlan.days.find(day=>day.day===todayName_);
      if(d?.items?.length) return d.items.reduce((s,it)=>s+(it.realHours||0),0);
    }
    return today.reduce((s,it)=>s+(it.allocRealH||0),0);
  })();
  const todayLoggedH = CURRICULUM.reduce((s,i)=>
    s+(getP(i.id).sessions||[]).filter(sess=>sess.date===todayDateStr).reduce((ss,x)=>ss+(x.studyHours||0),0),0);
  const todayRemainingH = Math.max(0,parseFloat((todayPlannedH-todayLoggedH).toFixed(2)));

  const inputSt={width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid rgba(255,255,255,0.12)`,
    borderRadius:12,padding:"12px 13px",color:T.text,fontSize:16,
    boxSizing:"border-box",fontFamily:"inherit",outline:"none"};

  const chartWeeks=(()=>{
    const weeks=[];
    for(let i=11;i>=0;i--){
      const d=new Date();d.setDate(d.getDate()-i*7);
      const iso=d.toISOString().split('T')[0].slice(0,7);
      const entry=weeklyHours.find(w=>w.weekISO===iso);
      weeks.push({label:iso.slice(5),h:entry?.realH||0});
    }
    return weeks;
  })();
  const chartMax=Math.max(WEEKLY_TARGET,Math.max(...chartWeeks.map(w=>w.h),1));

  const handleNotifAction = (notif) => {
    if(!notif.action) return;
    const {type, payload} = notif.action;
    if(type==="viewWeek") { setView("week"); setSideOpen(false); }
    else if(type==="planWeek") { setView("ai"); setSideOpen(false); }
    else if(type==="viewCheckin") { setView("ai"); setSideOpen(false); }
    else if(type==="sundayReview") { setShowSundayReview(true); setSideOpen(false); }
    else if(type==="graduation"&&payload) {
      const {next,completed} = payload;
      const key = next.type==="course"?"courses":"books";
      setFocus(f=>({...f,[key]:[...(f[key]||[]).filter(id=>id!==completed.id),next.id],manual:false}));
      setSideOpen(false);
      toast_(`${next.id} added to focus`);
    }
  };

  // ── Render ──
  return(
    <>
      <style>{GLOBAL_CSS}</style>
      {splash&&<SplashScreen onDone={()=>setSplash(false)}/>}

      {currentBanner&&<NotifBanner notif={currentBanner} onDismiss={dismissBanner}/>}

      <div style={{
        background:"linear-gradient(135deg, #0d1b2a 0%, #0f2240 50%, #0d1b2a 100%)",backgroundAttachment:"fixed",
        minHeight:"100dvh",color:T.text,fontFamily:T.fontUI,
        paddingBottom:`calc(env(safe-area-inset-bottom) + 88px)`,
        opacity:splash?0:1,transition:"opacity 0.4s ease 0.1s",
      }}>
        <div style={{height:"env(safe-area-inset-top)"}}/>

        {toast&&<div style={{
          position:"fixed",bottom:`calc(env(safe-area-inset-bottom) + 96px)`,left:"50%",
          transform:"translateX(-50%)",
          background:"rgba(15,34,64,0.96)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
          border:"1px solid rgba(255,255,255,0.12)",
          color:"#ffffff",padding:"10px 20px",
          borderRadius:99,fontWeight:600,zIndex:500,fontSize:13,letterSpacing:0.2,
          boxShadow:"0 8px 32px rgba(0,0,0,0.5)",whiteSpace:"nowrap",animation:"toastIn 0.25s cubic-bezier(0.4,0,0.2,1) both"}}>
          {toast}
        </div>}

        <SidePanel
          open={sideOpen} onClose={()=>setSideOpen(false)}
          reviews={reviews} profile={profile} setProfile={setProfile}
          onExport={doExport} onImport={doImport} onClearAll={doClearAll}
          customItems={customItems} newItem={newItem} setNewItem={setNewItem}
          addCustomItem={addCustomItem} removeCustomItem={removeCustomItem} getP={getP}
          settings={settings}
          notifs={notifs} unreadCount={unreadCount}
          onMarkRead={markRead} onDismissNotif={dismissNotif}
          onClearNotifs={clearNotifs} onNotifAction={handleNotifAction}
          onNotifClose={()=>setSideOpen(false)}
          onSaveSettings={s=>{
            const { courseMaxSession: _cms, bookMaxSession: _bms, _courseMaxRaw: _cmr, _bookMaxRaw: _bmr, ...rest } = s;
            const clean={
              ...rest,
              weeklyTarget:Math.max(5,Math.min(45,parseInt(s.weeklyTarget)||20)),
              courseRatio:[1,1.5,2,2.5,3].includes(parseFloat(s.courseRatio))?parseFloat(s.courseRatio):2,
              bookRatio:[1,1.5,2,2.5,3].includes(parseFloat(s.bookRatio))?parseFloat(s.bookRatio):1,
            };
            setSettings(clean);
            toast_("Settings saved");
          }}
        />

        {isSunday()&&load(SK_SUNDAY_DONE,null)!==getTodayISO()&&!showSundayReview&&
          <button onClick={()=>setShowSundayReview(true)} className="btn-press"
            style={{position:"fixed",bottom:`calc(env(safe-area-inset-bottom) + 100px)`,right:16,
              width:48,height:48,borderRadius:"50%",
              background:"rgba(15,34,64,0.92)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
              border:`1px solid rgba(245,158,11,0.4)`,color:T.yellow,fontSize:18,cursor:"pointer",
              zIndex:60,boxShadow:`0 4px 20px rgba(0,0,0,0.4), 0 0 16px rgba(245,158,11,0.2)`,
              display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.3s ease both"}}>
            ✍
          </button>}

        {(!isOnline||offlineQueue.length>0)&&<div style={{
          background:"rgba(13,27,42,0.9)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
          borderBottom:`1px solid rgba(255,255,255,0.08)`,borderLeft:`3px solid ${isOnline?T.yellow:T.red}`,
          padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:10,color:isOnline?T.yellow:T.red,fontWeight:700,letterSpacing:0.5}}>
            {isOnline?`Back online — ${offlineQueue.length} queued`:"Offline — AI features queued"}
          </div>
          {isOnline&&offlineQueue.length>0&&<button onClick={processQueue} className="btn-press"
            style={{background:T.yellow,border:"none",color:"#fff",
              borderRadius:8,padding:"6px 12px",fontSize:10,cursor:"pointer",fontWeight:700,minHeight:36}}>
            Sync now</button>}
        </div>}


        {completionBanner.length>0&&<div style={{
          background:"rgba(13,27,42,0.9)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
          borderBottom:`1px solid rgba(255,255,255,0.08)`,borderLeft:`3px solid ${T.green}`,
          padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",
          animation:"fadeUp 0.25s ease both"}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:T.green,letterSpacing:0.5}}>
              {completionBanner.length} item{completionBanner.length>1?"s":""} completed
            </div>
            <div style={{fontSize:10,color:T.textMid,marginTop:2}}>
              {completionBanner.map(id=>CURRICULUM.find(i=>i.id===id)?.name||id).join(", ")}
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setCompletionBanner([])} className="btn-press"
              style={{background:"rgba(255,255,255,0.08)",border:`1px solid rgba(255,255,255,0.12)`,color:T.textDim,
                borderRadius:8,padding:"5px 10px",fontSize:11,cursor:"pointer",minHeight:36}}>✕</button>
            <button onClick={()=>{setView("ai");setCompletionBanner([]);}} className="btn-press"
              style={{background:T.green,border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",
                fontSize:11,fontWeight:800,cursor:"pointer",minHeight:36}}>Check-In →</button>
          </div>
        </div>}

        {graduationProposal&&<div style={{
          background:"rgba(13,27,42,0.9)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
          borderBottom:`1px solid rgba(255,255,255,0.08)`,borderLeft:`3px solid ${T.blue}`,
          padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",
          animation:"fadeUp 0.25s ease both"}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:T.blue,letterSpacing:0.5}}>
              {graduationProposal.completed.id} complete
            </div>
            <div style={{fontSize:10,color:T.textDim,marginTop:2}}>
              Add {graduationProposal.next.id} "{graduationProposal.next.name}"?
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setGraduationProposal(null)} className="btn-press"
              style={{background:"rgba(255,255,255,0.08)",border:`1px solid rgba(255,255,255,0.12)`,color:T.textDim,
                borderRadius:8,padding:"5px 10px",fontSize:10,cursor:"pointer",minHeight:44}}>Skip</button>
            <button onClick={()=>{
              const key=graduationProposal.next.type==="course"?"courses":"books";
              setFocus(f=>({...f,[key]:[...(f[key]||[]).filter(id=>id!==graduationProposal.completed.id),graduationProposal.next.id],manual:false}));
              setGraduationProposal(null);toast_(`${graduationProposal.next.id} added to focus`);
            }} className="btn-press"
              style={{background:"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",border:"none",color:"#fff",borderRadius:8,
                padding:"5px 12px",fontSize:10,fontWeight:800,cursor:"pointer",minHeight:44}}>Add to Focus</button>
          </div>
        </div>}

        {missedDayBanner&&<div style={{
          background:"rgba(13,27,42,0.9)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
          borderBottom:`1px solid rgba(255,255,255,0.08)`,borderLeft:`3px solid ${T.yellow}`,
          padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",
          animation:"fadeUp 0.25s ease both"}}>
          <div style={{fontSize:11,fontWeight:700,color:T.yellow,letterSpacing:0.5}}>Missed session yesterday</div>
          <button onClick={()=>setMissedDayBanner(false)} className="btn-press"
            style={{background:"rgba(255,255,255,0.08)",border:`1px solid rgba(255,255,255,0.12)`,color:T.textDim,
              borderRadius:8,padding:"5px 12px",fontSize:10,cursor:"pointer",minHeight:44}}>Dismiss</button>
        </div>}

        {/* ── Header ── */}
        <div style={{
          background:"rgba(13,27,42,0.88)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
          padding:`8px 16px 12px`,
          borderBottom:"1px solid rgba(255,255,255,0.08)",position:"sticky",top:"env(safe-area-inset-top)",zIndex:50,
          boxShadow:"0 4px 24px rgba(0,0,0,0.3)",
        }}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
              <button onClick={()=>setSideOpen(true)} className="btn-press"
                style={{background:"none",border:"none",cursor:"pointer",padding:"6px 4px",
                  display:"flex",flexDirection:"column",gap:5,marginTop:4,flexShrink:0,
                  minWidth:44,minHeight:44,justifyContent:"center",alignItems:"flex-start",
                  position:"relative"}}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{width:22,height:2,background:"rgba(255,255,255,0.6)",borderRadius:99}}/>
                ))}
                {unreadCount>0&&<div style={{position:"absolute",top:2,right:2,
                  background:T.blue,color:"#fff",borderRadius:"50%",
                  width:14,height:14,fontSize:8,fontWeight:800,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>{unreadCount>9?"9+":unreadCount}</div>}
              </button>
              <div>
                <div style={{fontSize:9,color:T.textDim,letterSpacing:4,textTransform:"uppercase",marginBottom:4}}>The Preparation</div>
                <div style={{fontSize:22,fontWeight:800,letterSpacing:-0.5,color:"#ffffff"}}>Learning Tracker</div>
              </div>
            </div>
            <div style={{textAlign:"right",marginTop:4}}>
              <div style={{fontSize:22,fontWeight:900,letterSpacing:-0.5,
                color:weekH>=WEEKLY_TARGET?T.green:"#ffffff",
                transition:"color 0.4s ease"}}>
                {weekH.toFixed(1)}<span style={{fontSize:11,color:T.textDim,fontWeight:400}}>/{WEEKLY_TARGET}h</span>
              </div>
              <div style={{fontSize:9,color:T.textDim,marginTop:1}}>{getDayName()} · {dLeft}d left</div>
            </div>
          </div>
          <Bar pct={(weekH/WEEKLY_TARGET)*100} color={weekH>=WEEKLY_TARGET?T.green:T.blue} height={3} glow style={{marginBottom:4}}/>
          <div style={{fontSize:9,color:T.textDim,marginBottom:14,textAlign:"right",letterSpacing:0.3}}>
            {weekH>=WEEKLY_TARGET?"Target hit":`${(wkRem/Math.max(dLeft,1)).toFixed(1)}h/day to finish`}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,flex:1,paddingRight:8}}>
              {focusItems.filter(i=>getP(i.id).percentComplete<100).map(i=>(
                <Pill key={i.id} color={gc(i.genre)} label={i.id}/>
              ))}
            </div>
            <button onClick={()=>setEditFocus(e=>!e)} className="btn-press"
              style={{background:editFocus?"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)":"rgba(255,255,255,0.08)",
                border:`1px solid ${editFocus?"transparent":"rgba(255,255,255,0.12)"}`,
                color:editFocus?"#fff":T.textDim,borderRadius:10,padding:"7px 14px",fontSize:11,
                cursor:"pointer",letterSpacing:0.3,flexShrink:0,transition:"all 0.2s",minHeight:44}}>
              {editFocus?"Done":"Edit Focus"}
            </button>
          </div>
        </div>

        {editFocus&&<div style={{
          background:"rgba(13,27,42,0.92)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
          padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,0.08)",
          animation:"fadeUp 0.2s cubic-bezier(0.4,0,0.2,1) both"}}>
          <div style={{fontSize:10,fontWeight:700,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12}}>
            Manual Focus Override
          </div>
          {[["COURSES","courses","course"],["BOOKS","books","book"]].map(([label,key,type])=>(
            <div key={key} style={{marginBottom:12}}>
              <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:7}}>{label}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {CURRICULUM.filter(i=>i.type===type&&getP(i.id).percentComplete<100).map(i=>{
                  const on=(focus[key]||[]).includes(i.id),c=gc(i.genre);
                  return <button key={i.id} className="btn-press"
                    onClick={()=>setFocus(f=>({...f,[key]:on?(f[key]||[]).filter(x=>x!==i.id):[...(f[key]||[]),i.id],manual:true}))}
                    style={{background:on?c:"rgba(255,255,255,0.08)",border:`1px solid ${on?"transparent":"rgba(255,255,255,0.12)"}`,
                      color:on?"#fff":T.textDim,borderRadius:20,padding:"8px 14px",fontSize:11,
                      cursor:"pointer",fontWeight:on?700:400,transition:"all 0.18s",minHeight:44}}>
                    {i.id}{i.custom?" *":""}
                  </button>;
                })}
              </div>
            </div>
          ))}
        </div>}

        <div style={{padding:"12px 14px"}}>

          {/* ══ TODAY ══ */}
          {view==="today"&&<div className="tab-content">

            {/* No plan state */}
            {!planIsFromThisWeek&&<Card style={{padding:"28px 20px",textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:32,marginBottom:14}}>📋</div>
              <div style={{fontSize:16,fontWeight:700,color:T.text,marginBottom:8}}>No plan for this week yet</div>
              <div style={{fontSize:13,color:T.textDim,marginBottom:24,lineHeight:1.6}}>
                Head to Check-In to generate your week plan. The Today tab will show your sessions once a plan exists.
              </div>
              <button onClick={()=>setView("ai")} className="btn-press"
                style={{background:"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",border:"none",color:"#fff",
                  borderRadius:14,padding:"13px 24px",fontSize:13,fontWeight:800,cursor:"pointer",minHeight:44,
                  boxShadow:"0 4px 20px rgba(59,130,246,0.4)"}}>
                Plan My Week →
              </button>
            </Card>}

            {planIsFromThisWeek&&<>
              {/* ── Week Complete Card ── */}
              {allWeekSessionsDone&&<Card style={{padding:"22px 20px",marginBottom:16,borderLeft:`3px solid ${T.green}`,
                animation:"fadeUp 0.28s cubic-bezier(0.4,0,0.2,1) both"}} accent={T.green} glow>
                <div style={{fontSize:9,color:T.green,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:10}}>
                  Week Complete
                </div>
                <div style={{fontSize:17,fontWeight:800,color:T.text,marginBottom:4}}>
                  All sessions done
                </div>
                <div style={{fontSize:12,color:T.textMid,marginBottom:16,lineHeight:1.5}}>
                  {weekH.toFixed(2)}h logged · {weekPlan.days.flatMap(d=>d.items||[]).filter(it=>getP(it.id).percentComplete>=100).length} items completed
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setWeekCompleteDismissed(true)} className="btn-press"
                    style={{flex:1,background:"rgba(255,255,255,0.06)",border:`1px solid rgba(255,255,255,0.12)`,
                      color:T.textMid,borderRadius:14,padding:"12px 0",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:44}}>
                    Rest for the week
                  </button>
                  <button onClick={()=>{setWeekCompleteDismissed(true);setTimeout(()=>{const el=document.getElementById("bonus-card");if(el)el.scrollIntoView({behavior:"smooth"});},100);}} className="btn-press"
                    style={{flex:1,background:"linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",border:"none",
                      color:"#fff",borderRadius:14,padding:"12px 0",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:44,
                      boxShadow:"0 4px 16px rgba(34,197,94,0.35)"}}>
                    Bonus Mode →
                  </button>
                </div>
              </Card>}

              {todayPlannedH>0&&<Card style={{padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:10,fontWeight:700,color:T.textDim,textTransform:"uppercase",letterSpacing:1}}>
                    Today — {todayName_}
                  </div>
                  <div style={{fontSize:12,fontWeight:800,
                    color:todayLoggedH>=todayPlannedH?T.green:todayLoggedH>0?T.yellow:T.textMid}}>
                    {todayLoggedH.toFixed(2)}h / {todayPlannedH.toFixed(2)}h
                  </div>
                </div>
                <Bar pct={todayPlannedH>0?(todayLoggedH/todayPlannedH)*100:0}
                  color={todayLoggedH>=todayPlannedH?T.green:T.blue} height={5} glow/>
                <div style={{fontSize:10,color:T.textDim,marginTop:6,textAlign:"right"}}>
                  {todayLoggedH>=todayPlannedH
                    ? "Today's sessions complete"
                    : todayLoggedH>0
                    ? `${todayRemainingH.toFixed(2)}h remaining today`
                    : `${todayPlannedH.toFixed(2)}h planned today`}
                </div>
              </Card>}

              <div style={{fontSize:11,color:T.textDim,marginBottom:16,letterSpacing:0.3}}>
                {weekH>=WEEKLY_TARGET?"Target hit — bonus mode":`Plan · ${getDayName()}`}
              </div>

              {today.length===0&&weekH<WEEKLY_TARGET&&<Card style={{padding:20,textAlign:"center",marginBottom:10}}>
                <div style={{fontSize:13,color:T.textMid,marginBottom:4}}>
                  {todayLoggedH>0?"All sessions logged for today":"No sessions planned today"}
                </div>
                <div style={{fontSize:11,color:T.textDim}}>
                  {todayLoggedH>0?"Great work — check back tomorrow":"Check the Week tab for your full schedule"}
                </div>
              </Card>}

              {today.map((item,idx)=>{
                const p=getP(item.id),c=gc(item.genre);
                const isDone=p.percentComplete>=100;
                const loggedTodayH=(p.sessions||[]).filter(s=>s.date===todayDateStr).reduce((s,x)=>s+(x.studyHours||0),0);
                const remainingH=Math.max(0,parseFloat((item.allocRealH-loggedTodayH).toFixed(2)));
                const sessionDoneToday=loggedTodayH>0;
                const isComplete=isDone||(sessionDoneToday&&remainingH===0);
                return <Card key={item.id} accent={isComplete?T.green:c} glow
                  style={{marginBottom:10,padding:16,opacity:isComplete?0.55:1,
                    animation:`fadeUp 0.28s cubic-bezier(0.4,0,0.2,1) ${idx*0.07}s both`,transition:"opacity 0.3s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div style={{flex:1,paddingRight:10}}>
                      <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>
                        {item.type==="course"?"Course":"Book"}
                        {sessionDoneToday&&!isComplete&&<span style={{marginLeft:8,color:T.blue}}>· {loggedTodayH.toFixed(2)}h logged</span>}
                        {isComplete&&<span style={{marginLeft:8,color:T.green}}>· Complete</span>}
                      </div>
                      <div style={{fontSize:14,fontWeight:700,letterSpacing:-0.2,lineHeight:1.3}}>{item.name}</div>
                      <div style={{marginTop:7}}><Pill color={isComplete?T.green:c} label={item.genre||item.id}/></div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      {isComplete
                        ?<div style={{fontSize:22,fontWeight:900,color:T.green}}>✓</div>
                        :<div>
                          <div style={{fontSize:22,fontWeight:900,
                            color:remainingH<item.allocRealH?T.yellow:T.blue,transition:"color 0.3s"}}>
                            {remainingH.toFixed(2)}h
                          </div>
                          <div style={{fontSize:10,color:T.textDim,marginTop:2}}>{sessionDoneToday?"remaining":"real study"}</div>
                        </div>}
                    </div>
                  </div>
                  <div style={{background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"10px 12px",marginBottom:12,border:"1px solid rgba(255,255,255,0.08)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:6}}>
                      <span style={{color:T.textDim}}>{(p.courseHoursComplete||0).toFixed(2)}h / {item.contentTotal}h</span>
                      <span style={{color:T.textDim}}>{item.contentLeft.toFixed(2)}h left</span>
                    </div>
                    <Bar pct={p.percentComplete} color={isComplete?T.green:sessionDoneToday?T.yellow:c} height={4} glow/>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginTop:5}}>
                      <span style={{color:T.textMid,fontWeight:600}}>{p.percentComplete}%</span>
                      {!isComplete&&<span style={{color:sessionDoneToday?T.yellow:c,fontWeight:700}}>→ {item.targetPct}%</span>}
                    </div>
                  </div>
                  {!isComplete&&<div style={{marginBottom:8}}>
                    <button onClick={()=>setLogging(item)} className="btn-press"
                      style={{width:"100%",background:"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",border:"none",
                        color:"#fff",borderRadius:14,padding:"12px 0",fontSize:12,fontWeight:700,cursor:"pointer",minHeight:44,
                        boxShadow:"0 4px 16px rgba(59,130,246,0.35)"}}>
                      {sessionDoneToday?"+ Log Another Session":"+ Log Session"}
                    </button>
                  </div>}
                </Card>;
              })}

              {weekH>=WEEKLY_TARGET&&<div id="bonus-card"><Card style={{padding:"13px 14px",marginBottom:10,borderLeft:`3px solid ${T.green}`,
                animation:"fadeUp 0.28s cubic-bezier(0.4,0,0.2,1) both"}}>
                <div style={{fontSize:9,color:T.green,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:6}}>Bonus Mode</div>
                <div style={{fontSize:11,color:T.textDim,marginBottom:12,lineHeight:1.5}}>
                  {weekH.toFixed(2)}h logged — target hit.
                </div>
                {bonusItems?.items?.length>0&&<div>
                  {bonusItems.note&&<div style={{fontSize:11,color:T.textMid,marginBottom:10,fontStyle:"italic"}}>{bonusItems.note}</div>}
                  {bonusItems.items.map(it=>{
                    const item=CURRICULUM.find(i=>i.id===it.id);if(!item) return null;
                    const c=gc(item.genre);
                    const catLabel=it.category==="untouched_domain"?"New Domain":it.category==="paired"?"Paired":it.category==="wildcard"?"Wildcard":null;
                    return <div key={it.id} style={{background:"rgba(255,255,255,0.04)",borderRadius:12,
                      padding:"10px 12px",marginBottom:8,borderLeft:`2px solid ${c}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                        <div style={{flex:1,paddingRight:8}}>
                          {catLabel&&<div style={{fontSize:9,color:T.green,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>{catLabel}</div>}
                          <div style={{fontSize:12,fontWeight:600,color:T.text}}>{item.name}</div>
                        </div>
                        <div style={{fontSize:13,fontWeight:800,color:T.blue,flexShrink:0}}>{it.realHours}h</div>
                      </div>
                      <button onClick={()=>setLogging(item)} className="btn-press"
                        style={{width:"100%",background:"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",border:"none",
                          color:"#fff",borderRadius:10,padding:"9px 0",fontSize:11,fontWeight:700,cursor:"pointer",minHeight:44}}>
                        + Log Bonus Session</button>
                    </div>;
                  })}
                  <button onClick={()=>setBonusItems(null)} className="btn-press"
                    style={{background:"none",border:"none",color:T.textDim,fontSize:10,cursor:"pointer",marginTop:4}}>
                    Clear suggestions</button>
                </div>}
                {(!bonusItems?.items?.length)&&<button onClick={runBonusSuggestions} disabled={bonusLoading} className="btn-press"
                  style={{width:"100%",background:"rgba(34,197,94,0.08)",border:`1px solid rgba(34,197,94,0.25)`,
                    color:bonusLoading?T.textDim:T.green,borderRadius:14,padding:"12px 0",
                    fontSize:12,fontWeight:700,cursor:"pointer",transition:"color 0.2s",minHeight:44}}>
                  {bonusLoading?"Thinking…":"Suggest Bonus Sessions"}
                </button>}
              </Card></div>}
            </>}
          </div>}

          {/* ══ WEEK ══ */}
          {view==="week"&&<div className="tab-content">
            <div style={{fontSize:11,color:T.textDim,marginBottom:16,letterSpacing:0.3}}>
              {planIsFromThisWeek?"This week's plan":"Active focus"} · {weekH.toFixed(2)}h logged
              {weekH>=WEEKLY_TARGET&&<span style={{color:T.green,fontWeight:700}}> · Target hit</span>}
            </div>

            {focusItems.filter(i=>getP(i.id).percentComplete<100&&getP(i.id).percentComplete>0).length>0&&
            <Card style={{padding:"13px 14px",marginBottom:12}}>
              <div style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:10}}>
                Projected Finish
              </div>
              {focusItems.filter(i=>getP(i.id).percentComplete<100&&getP(i.id).percentComplete>0).map(item=>{
                const realLeft=realHoursRemaining(item,getP(item.id),settings);
                const weeksToFinish=avgWeeklyH>0?realLeft/avgWeeklyH:null;
                const finishDate=weeksToFinish?new Date(Date.now()+weeksToFinish*7*24*60*60*1000)
                  .toLocaleDateString("en-CA",{month:"short",day:"numeric"}):null;
                const c=gc(item.genre);
                return <div key={item.id} style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${T.surface2}`}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:600}}>{item.id} — {item.name.slice(0,32)}{item.name.length>32?"…":""}</div>
                    <div style={{fontSize:9,color:T.textDim,marginTop:2}}>{realLeft.toFixed(2)}h real left · {getP(item.id).percentComplete}%</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    {finishDate&&<div style={{fontSize:12,fontWeight:800,color:c}}>{finishDate}</div>}
                    {weeksToFinish&&<div style={{fontSize:9,color:T.textDim}}>{weeksToFinish.toFixed(1)}w</div>}
                  </div>
                </div>;
              })}
            </Card>}

            {weekH>=WEEKLY_TARGET&&bonusItems?.items?.length>0&&<Card style={{
              padding:"13px 14px",marginBottom:12,borderLeft:`3px solid ${T.green}`}}>
              <div style={{fontSize:9,color:T.green,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:8}}>Bonus Day</div>
              {bonusItems.note&&<div style={{fontSize:11,color:T.textMid,marginBottom:10,fontStyle:"italic"}}>{bonusItems.note}</div>}
              {bonusItems.items.map(it=>{
                const item=CURRICULUM.find(i=>i.id===it.id);if(!item) return null;
                const c=gc(item.genre);
                return <div key={it.id} style={{background:"rgba(255,255,255,0.04)",borderRadius:12,
                  padding:"8px 12px",marginBottom:6,borderLeft:`2px solid ${c}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:12,fontWeight:600,flex:1,paddingRight:8,color:T.text}}>{item.name}</div>
                    <div style={{fontSize:13,fontWeight:800,color:T.blue}}>{it.realHours}h</div>
                  </div>
                  <div style={{fontSize:9,color:T.textDim,marginTop:3}}>{item.genre} · {item.type}</div>
                </div>;
              })}
            </Card>}

            {planIsFromThisWeek&&weekPlan.days&&<Card style={{padding:"13px 14px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700}}>
                  {weekH>=WEEKLY_TARGET?"Week Plan (Complete)":"Week Schedule"}
                </div>
                <div style={{fontSize:13,fontWeight:900,color:weekH>=WEEKLY_TARGET?T.green:T.textMid}}>
                  {weekH.toFixed(2)}h
                </div>
              </div>
              {weekPlan.days.map(day=>{
                const dayIdx=ALL_DAYS.indexOf(day.day);
                const dayDate=new Date(getMonday()+"T12:00:00");
                dayDate.setDate(dayDate.getDate()+dayIdx);
                const today_local=new Date();today_local.setHours(0,0,0,0);
                const dayDate_norm=new Date(dayDate);dayDate_norm.setHours(0,0,0,0);
                const isPast=dayDate_norm<today_local;
                const isToday=dayDate_norm.getTime()===today_local.getTime();
                const isFuture=dayDate_norm>today_local;
                if(weekH>=WEEKLY_TARGET&&isFuture) return null;
                const dayActualH=parseFloat((day.items||[]).reduce((s,it)=>s+(it.realHours||0),0).toFixed(2));
                const dayStr=dayDate.toLocaleDateString();
                const dayLoggedH=parseFloat(CURRICULUM.reduce((s,i)=>
                  s+(getP(i.id).sessions||[]).filter(sess=>sess.date===dayStr)
                    .reduce((ss,x)=>ss+(x.studyHours||0),0),0).toFixed(2));
                const hitRate=dayActualH>0?dayLoggedH/dayActualH:0;
                return <div key={day.day} style={{marginBottom:14,opacity:isPast&&!isToday?0.4:1,transition:"opacity 0.3s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontSize:11,fontWeight:800,color:isToday?T.blue:isPast?T.textDim:T.text}}>
                      {day.day}{isToday?" — Today":""}
                    </div>
                    <div style={{fontSize:10,
                      color:isPast?(dayLoggedH===0?T.red:hitRate>=0.85?T.green:T.yellow):T.textDim}}>
                      {isPast||isToday
                        ? `${dayLoggedH.toFixed(2)}h logged of ${dayActualH.toFixed(2)}h`
                        : `${dayActualH.toFixed(2)}h planned`}
                    </div>
                  </div>
                  {day.items?.map(it=>{
                    const f=CURRICULUM.find(i=>i.id===it.id);
                    const c=gc(f?.genre);
                    const p=getP(it.id);
                    const isDone=p.percentComplete>=100;
                    const loggedOnDay=(p.sessions||[]).filter(s=>s.date===dayStr).reduce((s,x)=>s+(x.studyHours||0),0);
                    const wasLogged=loggedOnDay>0;
                    const remainingH=Math.max(0,parseFloat((it.realHours-loggedOnDay).toFixed(2)));
                    const isComplete=isDone||(isPast&&wasLogged)||(isToday&&wasLogged&&remainingH===0);
                    const liveTargetPct=f?targetPctAfterSession(f,p,it.realHours,settings):it.targetPct;
                    return <div key={it.id} style={{background:isToday&&!isComplete?"rgba(59,130,246,0.08)":"rgba(255,255,255,0.04)",borderRadius:12,
                      padding:"8px 12px",marginBottom:5,
                      borderLeft:`2px solid ${isComplete?T.green:wasLogged&&!isComplete?T.yellow:c}`,
                      opacity:isComplete?0.45:1,transition:"opacity 0.3s, border-color 0.3s"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div style={{fontSize:12,fontWeight:600,flex:1,paddingRight:8,lineHeight:1.3,
                          color:isComplete?T.green:T.text}}>
                          {isComplete&&<span style={{marginRight:5}}>✓</span>}{f?.name||it.id}
                        </div>
                        <div style={{flexShrink:0,textAlign:"right"}}>
                          {!isComplete&&<div style={{fontSize:13,fontWeight:800,color:wasLogged?T.yellow:T.blue}}>
                            {wasLogged?`${remainingH.toFixed(2)}h`:it.realHours.toFixed(2)+"h"}
                          </div>}
                          {isComplete&&<div style={{fontSize:11,color:T.green,fontWeight:700}}>✓</div>}
                        </div>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,marginTop:5}}>
                        <span style={{color:T.textDim}}>{p.percentComplete}%</span>
                        {!isComplete&&<span style={{color:wasLogged?T.yellow:c,fontWeight:700}}>→ {liveTargetPct}%</span>}
                      </div>
                      <Bar pct={p.percentComplete} color={isComplete?T.green:wasLogged?T.yellow:c} height={2} style={{marginTop:4}}/>
                    </div>;
                  })}
                </div>;
              })}
            </Card>}

            <div style={{fontSize:10,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:700}}>Log Sessions</div>
            {focusItems.filter(i=>getP(i.id).percentComplete<100).map((item,idx)=>{
              const p=getP(item.id),sessions=p.sessions||[],c=gc(item.genre);
              const contentLeft=Math.max(0,(item.hours||0)-(p.courseHoursComplete||0));
              const realLeft=contentToReal(item,contentLeft,settings);
              return <Card key={item.id} accent={c} style={{marginBottom:10,padding:"13px 14px",
                animation:`fadeUp 0.18s cubic-bezier(0.4,0,0.2,1) ${idx*0.06}s both`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{flex:1,minWidth:0,paddingRight:10}}>
                    <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:3}}>
                      {item.type==="course"?"Course":"Book"}
                    </div>
                    <div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                    <div style={{fontSize:9,color:T.textDim,marginTop:2}}>
                      {item.id} · {(p.courseHoursComplete||0).toFixed(2)}h/{item.hours}h · {realLeft.toFixed(2)}h real left
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:15,fontWeight:800,color:c}}>{p.percentComplete}%</div>
                    </div>
                    <button onClick={()=>setLogging(item)} className="btn-press"
                      style={{background:"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",border:"none",color:"#fff",
                        borderRadius:10,padding:"10px 16px",fontSize:12,cursor:"pointer",fontWeight:700,minHeight:44}}>Log</button>
                  </div>
                </div>
                <Bar pct={p.percentComplete} color={c} glow/>
                {sessions.length>0&&<SessionHistory item={item} sessions={sessions} onEdit={idx=>openEditSession(item.id,idx)}/>}
              </Card>;
            })}
          </div>}

          {/* ══ CHECK-IN ══ */}
          {view==="ai"&&<div className="tab-content">
            <div style={{fontSize:11,color:T.textDim,marginBottom:16,letterSpacing:0.3}}>
              Plan Monday · Review Sunday
            </div>

            {isSunday()&&load(SK_SUNDAY_DONE,null)!==getTodayISO()&&
            <button onClick={()=>setShowSundayReview(true)} className="btn-press"
              style={{width:"100%",background:"rgba(245,158,11,0.08)",border:`1px solid rgba(245,158,11,0.25)`,
                color:T.yellow,borderRadius:14,padding:13,fontSize:13,fontWeight:800,
                cursor:"pointer",marginBottom:12,letterSpacing:0.3,minHeight:44}}>
              Write This Week's Review
            </button>}

            {planIsFromThisWeek&&<div style={{
              background:"rgba(34,197,94,0.07)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",
              borderRadius:16,padding:"10px 14px",
              marginBottom:12,border:`1px solid rgba(34,197,94,0.2)`,animation:"fadeUp 0.2s ease both",
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:T.green,letterSpacing:0.5}}>Week plan active</div>
                <div style={{fontSize:10,color:T.textDim,marginTop:2}}>
                  {new Date(weekPlan.generatedAt).toLocaleDateString()} · {weekPlan.totalPlannedHours}h
                </div>
              </div>
            </div>}

            <div style={{marginBottom:10}}>
              <label style={{fontSize:10,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",
                fontWeight:700,display:"block",marginBottom:7}}>Guidance for AI (optional)</label>
              <textarea value={planGuidance} onChange={e=>setPlanGuidance(e.target.value)}
                placeholder="e.g. focus more on books this week, I want roman history books, push harder on A1..."
                style={{...inputSt,resize:"none",height:56,lineHeight:1.5,padding:"10px 12px"}}/>
              <div style={{fontSize:10,color:T.textDim,marginTop:5,lineHeight:1.5}}>
                Tip: For books, try "philosophy books", "investing books", "roman history books" etc. The AI searches by genre and title.
              </div>
            </div>

            <button onClick={()=>runPlanWeek(false)} disabled={aiLoading} className="btn-press"
              style={{width:"100%",
                background:aiLoading?"rgba(255,255,255,0.06)":"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                border:aiLoading?`1px solid rgba(255,255,255,0.12)`:"none",
                color:aiLoading?T.textDim:"#fff",borderRadius:14,padding:13,fontSize:14,
                fontWeight:800,cursor:aiLoading?"default":"pointer",marginBottom:12,
                letterSpacing:0.3,transition:"all 0.2s",minHeight:44,
                boxShadow:aiLoading?"none":"0 4px 20px rgba(59,130,246,0.4)"}}>
              {aiLoading?"Thinking…":planIsFromThisWeek?"Replan Week":"Plan Week"}
            </button>

            <div style={{marginBottom:16}}/>

            {aiResult&&<div style={{animation:"fadeUp 0.28s cubic-bezier(0.4,0,0.2,1) both"}}>
              {[["assessment",T.blue,"Assessment"],["insight",T.pink,"Insight"],["nextMilestone",T.green,"Next Milestone"]]
                .map(([k,c,label])=>aiResult[k]&&<Card key={k} accent={c} style={{padding:"13px 14px",marginBottom:10}}>
                  <div style={{fontSize:9,color:c,textTransform:"uppercase",letterSpacing:1.5,marginBottom:7,fontWeight:700}}>{label}</div>
                  <div style={{fontSize:13,color:T.textMid,lineHeight:1.65}}>{aiResult[k]}</div>
                </Card>)}
              {aiResult.focusProposal&&<Card style={{padding:"13px 14px",marginBottom:10,borderLeft:`3px solid ${T.pink}`}}>
                <div style={{fontSize:9,color:T.pink,textTransform:"uppercase",letterSpacing:1.5,marginBottom:12,fontWeight:700}}>
                  Proposed Focus Update
                </div>
                {[["COURSES","courses"],["BOOKS","books"]].map(([label,key])=>(
                  <div key={key} style={{marginBottom:12}}>
                    <div style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>{label}</div>
                    {(aiResult.focusProposal[key]||[]).map(id=>{
                      const item=CURRICULUM.find(i=>i.id===id);
                      const p=getP(id);const current=(focus[key]||[]).includes(id);
                      return item?<div key={id} style={{display:"flex",alignItems:"center",gap:10,
                        padding:"7px 0",borderBottom:`1px solid rgba(255,255,255,0.06)`}}>
                        <div style={{width:5,height:5,borderRadius:"50%",flexShrink:0,background:current?"rgba(255,255,255,0.2)":T.green}}/>
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,fontWeight:600}}>{item.id} — {item.name}</div>
                          <div style={{fontSize:9,color:T.textDim,marginTop:1}}>
                            {item.genre} · {p.percentComplete}% · {realHoursRemaining(item,p,settings).toFixed(2)}h real left
                          </div>
                        </div>
                        {!current&&<span style={{fontSize:9,color:T.green,fontWeight:700}}>NEW</span>}
                      </div>:null;
                    })}
                  </div>
                ))}
                {aiResult.focusProposal.reasoning&&<div style={{fontSize:11,color:T.textMid,marginBottom:14,
                  lineHeight:1.6,fontStyle:"italic"}}>{aiResult.focusProposal.reasoning}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setAiResult(r=>({...r,focusProposal:null}))} className="btn-press"
                    style={{flex:1,background:"rgba(255,255,255,0.08)",border:`1px solid rgba(255,255,255,0.12)`,
                      color:T.textMid,borderRadius:12,padding:12,fontSize:13,cursor:"pointer",minHeight:44}}>Keep Current</button>
                  <button onClick={()=>applyFocusProposal(aiResult.focusProposal)} className="btn-press"
                    style={{flex:2,background:T.green,border:"none",color:"#fff",
                      borderRadius:12,padding:12,fontSize:13,fontWeight:800,cursor:"pointer",minHeight:44}}>
                    Apply New Focus</button>
                </div>
              </Card>}
            </div>}
          </div>}

          {/* ══ YEAR ARC ══ */}
          {view==="arc"&&<div className="tab-content">
            <Card style={{marginBottom:16,padding:16}}>
              <div style={{fontSize:9,fontWeight:700,color:T.textDim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:14}}>
                Curriculum Overview
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
                {[[doneItems,"Completed",T.green],
                  [CURRICULUM.filter(i=>getP(i.id).percentComplete>0&&getP(i.id).percentComplete<100).length,"In Progress",T.blue],
                  [CURRICULUM.filter(i=>getP(i.id).percentComplete===0).length,"Untouched",T.textDim],
                  [totalItems,"Total Items",T.textMid]].map(([v,l,c],i)=>(
                  <div key={l} style={{background:"rgba(255,255,255,0.04)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",
                    borderRadius:12,padding:"12px 14px",
                    border:"1px solid rgba(255,255,255,0.08)",
                    animation:`fadeUp 0.18s ease ${i*0.05}s both`}}>
                    <div style={{fontSize:24,fontWeight:900,color:c,letterSpacing:-1}}>{v}</div>
                    <div style={{fontSize:10,color:T.textDim,marginTop:2,letterSpacing:0.3}}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{background:"rgba(255,255,255,0.04)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",borderRadius:12,padding:"12px 14px",marginBottom:12,border:"1px solid rgba(255,255,255,0.08)"}}>
                <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:700}}>Personal Bests</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  {[[bestWeek.toFixed(1)+"h","Best Week",T.blue],
                    [currentStreak+"wk","Current Streak",currentStreak>0?T.green:T.textDim],
                    [longestStreak+"wk","Longest Streak",T.yellow]].map(([v,l,c])=>(
                    <div key={l} style={{textAlign:"center"}}>
                      <div style={{fontSize:18,fontWeight:900,color:c}}>{v}</div>
                      <div style={{fontSize:9,color:T.textDim,marginTop:2}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{background:"rgba(255,255,255,0.04)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",borderRadius:12,padding:"12px 14px",marginBottom:12,border:"1px solid rgba(255,255,255,0.08)"}}>
                <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:700}}>12-Week Hours</div>
                <div style={{display:"flex",alignItems:"flex-end",gap:3,height:56}}>
                  {chartWeeks.map((w,i)=>{
                    const pct=w.h/chartMax,isTarget=w.h>=WEEKLY_TARGET,isCurrent=i===11;
                    return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                      <div style={{width:"100%",background:isTarget?T.green:isCurrent?T.blue:"rgba(148,163,184,0.35)",
                        height:`${Math.max(pct*44,w.h>0?4:1)}px`,borderRadius:"3px 3px 0 0",
                        transition:"height 0.5s ease, background 0.3s"}}/>
                      <div style={{fontSize:7,color:isCurrent?T.blue:T.textFaint}}>{w.label.slice(3)}</div>
                    </div>;
                  })}
                </div>
              </div>
              {genreBalance.length>0&&<div style={{background:"rgba(255,255,255,0.04)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",borderRadius:12,padding:"12px 14px",marginBottom:12,border:"1px solid rgba(255,255,255,0.08)"}}>
                <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:700}}>Genre Balance</div>
                {genreBalance.map(([genre,h])=>{
                  const c=gc(genre),pct=h/genreBalance[0][1]*100;
                  return <div key={genre} style={{marginBottom:7}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}>
                      <span style={{color:c,fontWeight:600}}>{genre}</span><span style={{color:T.textDim}}>{h.toFixed(1)}h</span>
                    </div>
                    <Bar pct={pct} color={c} height={3}/>
                  </div>;
                })}
              </div>}
              <div style={{background:"rgba(255,255,255,0.04)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",borderRadius:12,padding:"12px 14px",marginBottom:12,border:"1px solid rgba(255,255,255,0.08)"}}>
                <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Real Study Hours</div>
                <div style={{fontSize:28,fontWeight:900,color:T.blue,letterSpacing:-1}}>
                  {totalSpentRealH.toFixed(1)}<span style={{fontSize:12,color:T.textDim,fontWeight:400}}> hrs</span>
                </div>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.textDim,marginBottom:5}}>
                  <span style={{fontWeight:600,color:T.blue}}>Core</span>
                  <span style={{color:T.textMid,fontWeight:600}}>{coreDoneItems} of {coreItems.length}</span>
                </div>
                <Bar pct={(coreDoneItems/Math.max(coreItems.length,1))*100} color={T.blue} height={5} glow/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginTop:5,paddingBottom:10,borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
                  <span style={{color:T.textDim}}>Est. Core at {WEEKLY_TARGET}h/week</span>
                  <span style={{color:T.blue,fontWeight:700}}>{coreEstDate}</span>
                </div>
              </div>
              <div style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.textDim,marginBottom:5}}>
                  <span style={{fontWeight:600}}>Total</span>
                  <span style={{color:T.textMid,fontWeight:600}}>{doneItems} of {totalItems}</span>
                </div>
                <Bar pct={(doneItems/totalItems)*100} color={T.green} height={5} glow/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:6,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
                  <span style={{color:T.textDim}}>Est. completion at {WEEKLY_TARGET}h/week</span>
                  <span style={{color:T.yellow,fontWeight:700}}>{estDate}</span>
                </div>
              </div>
            </Card>
            {SECTIONS.map(sec=>(
              <SectionBlock key={sec.label} sec={sec} focusIds={focusIds} getP={getP}
                setLogging={setLogging} settings={settings}
                onDelete={deleteItem}
                onReset={item=>{
                  if(!window.confirm(`Reset "${item.name}" to 0%?`)) return;
                  setProgress(prev=>{const copy={...prev};delete copy[item.id];return copy;});
                  setCompletionBanner(b=>b.filter(id=>id!==item.id));
                }}
              />
            ))}
          </div>}
        </div>

        {/* ══ SUNDAY REVIEW ══ */}
        {showSundayReview&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",
          display:"flex",alignItems:"flex-end",zIndex:150,backdropFilter:"blur(8px)",
          animation:"fadeIn 0.2s ease both"}}>
          <div style={{
            background:"linear-gradient(145deg, rgba(13,27,42,0.98) 0%, rgba(15,34,64,0.98) 100%)",
            backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
            borderRadius:"18px 18px 0 0",
            padding:`24px 24px calc(env(safe-area-inset-bottom) + 24px)`,
            width:"100%",boxSizing:"border-box",
            borderTop:`3px solid ${T.yellow}`,border:"1px solid rgba(255,255,255,0.1)",
            borderTop:`3px solid ${T.yellow}`,boxShadow:shadow.raised,
            animation:"slideInUp 0.3s cubic-bezier(0.4,0,0.2,1) both",
          }}>
            <div style={{fontSize:17,fontWeight:800,letterSpacing:-0.3,marginBottom:4,color:T.text}}>Week Review</div>
            <div style={{fontSize:11,color:T.textDim,marginBottom:20}}>
              {weekH.toFixed(2)}h logged · AI will summarize and store for future plans
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:T.textMid,marginBottom:10,fontWeight:600}}>How was this week?</div>
              <StarRating value={sundayForm.stars} onChange={s=>setSundayForm(f=>({...f,stars:s}))}/>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:T.textMid,marginBottom:8,fontWeight:600}}>
                What happened? <span style={{color:T.textDim,fontWeight:400}}>(optional)</span>
              </div>
              <textarea value={sundayForm.note} onChange={e=>setSundayForm(f=>({...f,note:e.target.value}))}
                placeholder="Energy, what you finished, what got skipped..."
                style={{...inputSt,fontSize:12,resize:"none",height:90,lineHeight:1.5}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowSundayReview(false)} className="btn-press"
                style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",
                  color:T.textMid,borderRadius:10,padding:12,fontSize:13,cursor:"pointer",minHeight:44}}>Later</button>
              <button onClick={saveSundayReview} disabled={sundaySubmitting} className="btn-press"
                style={{flex:2,
                  background:sundaySubmitting?"rgba(255,255,255,0.06)":`linear-gradient(135deg, ${T.yellow} 0%, #d97706 100%)`,
                  border:sundaySubmitting?"1px solid rgba(255,255,255,0.12)":"none",
                  color:sundaySubmitting?T.textDim:"#fff",
                  borderRadius:10,padding:12,fontSize:13,fontWeight:800,cursor:sundaySubmitting?"default":"pointer",minHeight:44,
                  boxShadow:sundaySubmitting?"none":"0 4px 16px rgba(245,158,11,0.35)"}}>
                {sundaySubmitting?"Summarizing…":"Save & Summarize"}</button>
            </div>
          </div>
        </div>}

        {/* ══ MARK COMPLETE ══ */}

        {/* ══ EDIT SESSION ══ */}
        {editSession&&(()=>{
          const{itemId,sessionIdx}=editSession;
          const item=CURRICULUM.find(i=>i.id===itemId);
          return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",
            display:"flex",alignItems:"flex-end",zIndex:100,backdropFilter:"blur(8px)",
            animation:"fadeIn 0.2s ease both"}}>
            <div style={{
              background:"linear-gradient(145deg, rgba(13,27,42,0.98) 0%, rgba(15,34,64,0.98) 100%)",
              backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
              borderRadius:"18px 18px 0 0",
              padding:`24px 24px calc(env(safe-area-inset-bottom) + 24px)`,
              width:"100%",boxSizing:"border-box",
              border:"1px solid rgba(255,255,255,0.1)",borderTop:`3px solid ${T.blue}`,
              boxShadow:shadow.raised,
              animation:"slideInUp 0.3s cubic-bezier(0.4,0,0.2,1) both",
            }}>
              <div style={{fontSize:16,fontWeight:800,marginBottom:3,color:T.text}}>Edit Session</div>
              <div style={{fontSize:11,color:T.textDim,marginBottom:20}}>{item?.name} · session {sessionIdx+1}</div>
              <div style={{marginBottom:14}}>
                <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>Real study hours</label>
                <input type="number" min="0.25" max="12" step="0.25" value={editSessionForm.hours}
                  onChange={e=>setEditSessionForm(f=>({...f,hours:e.target.value}))} style={inputSt}/>
              </div>
              <div style={{marginBottom:14}}>
                <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>
                  Content hours {item?.type==="course"?`(real÷${settings.courseRatio})`:"(= real for books)"}
                </label>
                <input type="number" min="0.1" max={item?.hours} step="0.1" value={editSessionForm.courseHours}
                  onChange={e=>setEditSessionForm(f=>({...f,courseHours:e.target.value}))} style={inputSt}/>
              </div>
              <div style={{marginBottom:20}}>
                <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>Note</label>
                <input value={editSessionForm.note} onChange={e=>setEditSessionForm(f=>({...f,note:e.target.value}))}
                  style={inputSt} placeholder="What did you cover?"/>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={deleteSession} className="btn-press"
                  style={{flex:1,background:`rgba(239,68,68,0.12)`,border:`1px solid rgba(239,68,68,0.3)`,color:T.red,
                    borderRadius:10,padding:12,fontSize:13,fontWeight:700,cursor:"pointer",minHeight:44}}>Delete</button>
                <button onClick={()=>setEditSession(null)} className="btn-press"
                  style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",
                    color:T.textMid,borderRadius:10,padding:12,fontSize:13,cursor:"pointer",minHeight:44}}>Cancel</button>
                <button onClick={saveEditSession} className="btn-press"
                  style={{flex:2,background:"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",border:"none",color:"#fff",
                    borderRadius:10,padding:12,fontSize:13,fontWeight:800,cursor:"pointer",minHeight:44,
                    boxShadow:"0 4px 16px rgba(59,130,246,0.35)"}}>Save</button>
              </div>
            </div>
          </div>;
        })()}

        {/* ══ LOG MODAL ══ */}
        {logging&&(()=>{
          const p=getP(logging.id);
          const isCourse=logging.type==="course";
          const contentDone=p.courseHoursComplete||0;
          const contentLeft=Math.max(0,(logging.hours||0)-contentDone);
          const previewContentH=isCourse?parseFloat(logForm.contentHours||0):parseFloat(logForm.studyHours||0);
          const previewPct=previewContentH>0
            ?Math.floor((Math.min(contentDone+previewContentH,logging.hours||1)/(logging.hours||1))*100)
            :null;
          const canSubmit=parseFloat(logForm.studyHours||0)>0&&(isCourse?parseFloat(logForm.contentHours||0)>0:true);
          return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",
            display:"flex",alignItems:"flex-end",zIndex:100,backdropFilter:"blur(8px)",
            animation:"fadeIn 0.2s ease both"}}>
            <div style={{
              background:"linear-gradient(145deg, rgba(13,27,42,0.98) 0%, rgba(15,34,64,0.98) 100%)",
              backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
              borderRadius:"18px 18px 0 0",
              padding:`20px 20px calc(env(safe-area-inset-bottom) + 16px)`,
              width:"100%",boxSizing:"border-box",
              border:"1px solid rgba(255,255,255,0.1)",borderTop:`3px solid ${gc(logging.genre)}`,
              boxShadow:shadow.raised,
              animation:"slideInUp 0.3s cubic-bezier(0.4,0,0.2,1) both",
            }}>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:15,fontWeight:800,color:T.text}}>{logging.name}</div>
                <div style={{fontSize:10,color:T.textDim,marginTop:2}}>
                  {p.percentComplete}% complete · {contentLeft.toFixed(1)}h content left
                </div>
              </div>
              {isCourse&&<div style={{marginBottom:12}}>
                <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:5}}>Content Covered (hrs)</label>
                <input type="number" min="0.05" step="0.05"
                  value={logForm.contentHours}
                  onChange={e=>setLogForm(f=>({...f,contentHours:e.target.value}))}
                  style={inputSt} placeholder="0.0" autoFocus/>
              </div>}
              <div style={{marginBottom:16}}>
                <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:5}}>Time Studied (hrs)</label>
                <input type="number" min="0.05" step="0.05"
                  value={logForm.studyHours}
                  onChange={e=>setLogForm(f=>({...f,studyHours:e.target.value}))}
                  style={inputSt} placeholder="0.0" autoFocus={!isCourse}/>
                {previewPct!==null&&<div style={{fontSize:11,color:gc(logging.genre),marginTop:4,fontWeight:600}}>
                  {p.percentComplete}% → {previewPct}%
                </div>}
              </div>
              <button onClick={submitLog} disabled={!canSubmit} className="btn-press"
                style={{width:"100%",background:canSubmit?"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)":"rgba(59,130,246,0.15)",
                  border:"none",color:"#fff",borderRadius:12,padding:"13px 0",fontSize:15,fontWeight:800,
                  cursor:canSubmit?"pointer":"default",minHeight:44,opacity:canSubmit?1:0.4,
                  boxShadow:canSubmit?"0 4px 16px rgba(59,130,246,0.35)":"none",marginBottom:14}}>
                Log Session
              </button>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <button onClick={()=>{setLogging(null);setLogForm({contentHours:"",studyHours:"",date:new Date().toLocaleDateString(),showDate:false});}} className="btn-press"
                  style={{background:"none",border:"none",color:T.textDim,fontSize:12,cursor:"pointer",padding:"2px 0"}}>
                  Cancel
                </button>
                <button onClick={()=>setLogForm(f=>({...f,showDate:!f.showDate}))} className="btn-press"
                  style={{background:"none",border:"none",color:T.textDim,fontSize:11,cursor:"pointer",padding:"2px 0",
                    textDecoration:"underline",textDecorationColor:"rgba(255,255,255,0.2)"}}>
                  {logForm.showDate?"Hide":"Log for different day"}
                </button>
              </div>
              {logForm.showDate&&<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.07)"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:11,color:T.textDim,flexShrink:0}}>Date</span>
                  <input type="date"
                    value={logForm.date?new Date(logForm.date).toLocaleDateString('en-CA'):new Date().toLocaleDateString('en-CA')}
                    max={new Date().toLocaleDateString('en-CA')}
                    onChange={e=>{const d=new Date(e.target.value+"T12:00:00");setLogForm(f=>({...f,date:d.toLocaleDateString()}));}}
                    style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",
                      color:T.textMid,borderRadius:8,padding:"5px 8px",fontSize:12,outline:"none",cursor:"pointer"}}/>
                </div>
                {(()=>{
                  const sd=new Date(logForm.date),mon=getMondayDate();
                  const sun=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+6,23,59,59,999);
                  return sd<mon||sd>sun?<div style={{fontSize:10,color:T.yellow,marginTop:6}}>
                    Previous week — won't count toward this week's {WEEKLY_TARGET}h
                  </div>:null;
                })()}
              </div>}
            </div>
          </div>;
        })()}
      </div>

      {/* ── Bottom Navigation ── */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50}}>
        {/* Background layer — absolutely fills the full area including safe zone */}
        <div style={{
          position:"absolute",inset:0,
          background:"rgba(13,27,42,0.96)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
          borderTop:"1px solid rgba(255,255,255,0.08)",
          boxShadow:"0 -4px 24px rgba(0,0,0,0.4)",
        }}/>
        {/* Button row */}
        <div style={{display:"flex",position:"relative"}}>
          {[
            ["today","Today","☀"],
            ["week","Week","▦"],
            ["ai","Check-In","✦"],
            ["arc","Arc","△"],
          ].map(([k,label,icon])=>(
            <button key={k} onClick={()=>setView(k)} className="btn-press"
              style={{
                flex:1,padding:"10px 4px 8px",background:"none",border:"none",
                cursor:"pointer",display:"flex",flexDirection:"column",
                alignItems:"center",gap:4,color:view===k?T.blue:"rgba(255,255,255,0.35)",
                transition:"color 0.22s cubic-bezier(0.4,0,0.2,1)",minHeight:56,position:"relative",
              }}>
              {view===k&&<div style={{
                position:"absolute",top:0,left:"20%",right:"20%",
                height:2,
                background:"linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)",
                borderRadius:"0 0 3px 3px",
                boxShadow:"0 0 8px rgba(59,130,246,0.7), 0 0 20px rgba(59,130,246,0.3)",
              }}/>}
              <span style={{fontSize:18,lineHeight:1}}>{icon}</span>
              <span style={{
                fontSize:10,fontWeight:view===k?800:500,
                letterSpacing:0.8,textTransform:"uppercase",
              }}>{label}</span>
            </button>
          ))}
        </div>
        {/* Safe area filler — solid background, no blur needed */}
        <div style={{height:"env(safe-area-inset-bottom)",background:"#0d1b2a",position:"relative"}}/>
      </div>
    </>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";

// ── Settings-aware pure helpers ───────────────────────────────────────────────
const snap25 = h => Math.round(h * 4) / 4;
const contentToReal = (item, contentH, s) =>
  item.type === "course" ? contentH * (s?.courseRatio ?? 2) : contentH * (s?.bookRatio ?? 1);
const realToContent = (item, realH, s) =>
  item.type === "course" ? realH / (s?.courseRatio ?? 2) : realH / (s?.bookRatio ?? 1);
const maxRealPerSession = (item, s) =>
  item.type === "course" ? (s?.courseMaxSession ?? 1.5) : (s?.bookMaxSession ?? 2.0);
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
const distributeDays = (totalH, dayNames) => {
  const n = dayNames.length;
  if (n === 0) return [];
  const base = snap25(totalH / n);
  const budgets = Array(n).fill(base);
  const sum = parseFloat(budgets.reduce((s, h) => s + h, 0).toFixed(2));
  const diff = parseFloat((totalH - sum).toFixed(2));
  if (Math.abs(diff) >= 0.25) budgets[n - 1] = snap25(budgets[n - 1] + diff);
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
{id:"B1",name:"Discovering the German New Medicine",hours:10,type:"book",section:"Core",genre:"Biology"},
{id:"B2",name:"Caveman Chemistry",hours:50,type:"book",section:"Core",genre:"Chemistry"},
{id:"B3",name:"Stick and Rudder",hours:15,type:"book",section:"Core",genre:"Pilot"},
{id:"B4",name:"Mental Math for Pilots",hours:5,type:"book",section:"Core",genre:"Pilot"},
{id:"B5",name:"Blood and Thunder",hours:15,type:"book",section:"Core",genre:"American History"},
{id:"B6",name:"Education of a Wandering Man",hours:5,type:"book",section:"Core",genre:"Literature"},
{id:"B7",name:"Empire of the Summer Moon",hours:14,type:"book",section:"Core",genre:"American History"},
{id:"B8",name:"The Sackett Series",hours:44,type:"book",section:"Core",genre:"American History"},
{id:"B9",name:"Virtue of Selfishness",hours:4,type:"book",section:"Core",genre:"Philosophy"},
{id:"B10",name:"Modern Man in Search of a Soul",hours:9,type:"book",section:"Core",genre:"Psychology"},
{id:"B11",name:"The Iliad",hours:9,type:"book",section:"Core",genre:"Literature"},
{id:"B12",name:"Only Yesterday",hours:10,type:"book",section:"Core",genre:"American History"},
{id:"B13",name:"The Law",hours:2,type:"book",section:"Core",genre:"Economics"},
{id:"B14",name:"Greek Art",hours:7,type:"book",section:"Core",genre:"Art"},
{id:"B15",name:"Roman Art",hours:6,type:"book",section:"Core",genre:"Art"},
{id:"B16",name:"The Republic",hours:3,type:"book",section:"Core",genre:"Philosophy"},
{id:"B17",name:"Gorgias",hours:2,type:"book",section:"Core",genre:"Philosophy"},
{id:"B18",name:"Trial and Death of Socrates",hours:3,type:"book",section:"Core",genre:"Philosophy"},
{id:"B19",name:"Way of the Superior Man",hours:5,type:"book",section:"Core",genre:"Philosophy"},
{id:"B20",name:"The Count of Monte Cristo",hours:30,type:"book",section:"Core",genre:"Literature"},
{id:"B21",name:"Adventures of Huckleberry Finn",hours:9,type:"book",section:"Core",genre:"Literature"},
{id:"B22",name:"Underland: A Deep Time Journey",hours:14,type:"book",section:"Core",genre:"Geology"},
{id:"B23",name:"Poke The Box",hours:2,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B24",name:"Atlas Shrugged",hours:29,type:"book",section:"Core",genre:"Philosophy"},
{id:"B25",name:"On Writing",hours:6,type:"book",section:"Core",genre:"Literature"},
{id:"B26",name:"The Creature from Jekyll Island",hours:10,type:"book",section:"Core",genre:"Investing"},
{id:"B27",name:"Consider This",hours:8,type:"book",section:"Core",genre:"Literature"},
{id:"B28",name:"The Elements of Style",hours:2,type:"book",section:"Core",genre:"Literature"},
{id:"B29",name:"Thank You for Arguing",hours:6,type:"book",section:"Core",genre:"Law"},
{id:"B30",name:"Zen and the Art of Motorcycle Maintenance",hours:12,type:"book",section:"Core",genre:"Philosophy"},
{id:"B31",name:"The True Believer",hours:4,type:"book",section:"Core",genre:"Psychology"},
{id:"B32",name:"Gulliver's Travels",hours:6,type:"book",section:"Core",genre:"Literature"},
{id:"B33",name:"The Prize",hours:23,type:"book",section:"Core",genre:"World History"},
{id:"B34",name:"Meditations",hours:6,type:"book",section:"Core",genre:"Philosophy"},
{id:"B35",name:"The Art of War",hours:1,type:"book",section:"Core",genre:"Philosophy"},
{id:"B36",name:"Bobby Fischer Teaches Chess",hours:3,type:"book",section:"Core",genre:"Science"},
{id:"B37",name:"A War Like No Other",hours:9,type:"book",section:"Core",genre:"World History"},
{id:"B38",name:"Beowulf",hours:4,type:"book",section:"Core",genre:"Literature"},
{id:"B39",name:"Book of Five Rings",hours:2,type:"book",section:"Core",genre:"Philosophy"},
{id:"B40",name:"The Guns of August",hours:13,type:"book",section:"Core",genre:"World History"},
{id:"B41",name:"The Moon is a Harsh Mistress",hours:10,type:"book",section:"Core",genre:"Literature"},
{id:"B42",name:"Endurance",hours:7,type:"book",section:"Core",genre:"Nature"},
{id:"B43",name:"Brave New World",hours:7,type:"book",section:"Core",genre:"Literature"},
{id:"B44",name:"The Odyssey",hours:6,type:"book",section:"Core",genre:"Literature"},
{id:"B45",name:"The Travels of Marco Polo",hours:7,type:"book",section:"Core",genre:"World History"},
{id:"B46",name:"1493",hours:11,type:"book",section:"Core",genre:"World History"},
{id:"B47",name:"The Last Place on Earth",hours:12.5,type:"book",section:"Core",genre:"Nature"},
{id:"B48",name:"Cosmos",hours:6.5,type:"book",section:"Core",genre:"Astronomy"},
{id:"B49",name:"The Revenant",hours:8,type:"book",section:"Core",genre:"American History"},
{id:"B50",name:"Undaunted Courage",hours:11.5,type:"book",section:"Core",genre:"American History"},
{id:"B51",name:"One Man's Wilderness",hours:8,type:"book",section:"Core",genre:"Nature"},
{id:"B52",name:"Man's Search for Meaning",hours:4,type:"book",section:"Core",genre:"Psychology"},
{id:"B53",name:"Touching the Void",hours:6,type:"book",section:"Core",genre:"Nature"},
{id:"B54",name:"1984",hours:8,type:"book",section:"Core",genre:"Literature"},
{id:"B55",name:"Animal Farm",hours:3,type:"book",section:"Core",genre:"Literature"},
{id:"B56",name:"1177 B.C.",hours:7,type:"book",section:"Core",genre:"World History"},
{id:"B57",name:"Man, Cattle and Veld",hours:10,type:"book",section:"Core",genre:"Nature"},
{id:"B58",name:"The Ascent of Money",hours:11,type:"book",section:"Core",genre:"Investing"},
{id:"B59",name:"How to Draw and Think like a Real Artist",hours:30,type:"book",section:"Core",genre:"Art"},
{id:"B60",name:"Logic: A Very Short Introduction",hours:2.5,type:"book",section:"Core",genre:"Philosophy"},
{id:"B61",name:"The Art of Thinking Clearly",hours:7,type:"book",section:"Core",genre:"Psychology"},
{id:"B62",name:"The Reluctant Entrepreneur",hours:5,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B63",name:"The Lean Startup",hours:6,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B64",name:"The Million-Dollar One-Person Business",hours:5,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B65",name:"Ready, Fire, Aim",hours:7,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B66",name:"The 1-Page Marketing Plan",hours:4,type:"book",section:"Core",genre:"Marketing"},
{id:"B67",name:"The Boron Letters",hours:4,type:"book",section:"Core",genre:"Sales"},
{id:"B68",name:"Influence",hours:8,type:"book",section:"Core",genre:"Psychology"},
{id:"B69",name:"Think and Grow Rich",hours:6,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B70",name:"Great Leads",hours:4,type:"book",section:"Core",genre:"Sales"},
{id:"B71",name:"How to Win Friends and Influence People",hours:7,type:"book",section:"Core",genre:"Psychology"},
{id:"B72",name:"PreSuasion",hours:10,type:"book",section:"Core",genre:"Psychology"},
{id:"B73",name:"Never Split the Difference",hours:9,type:"book",section:"Core",genre:"Law"},
{id:"B74",name:"Good Strategy/Bad Strategy",hours:6,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B75",name:"Economics in One Lesson",hours:6,type:"book",section:"Core",genre:"Economics"},
{id:"B76",name:"The Intelligent Investor",hours:13,type:"book",section:"Core",genre:"Investing"},
{id:"B77",name:"The Most Important Thing",hours:6,type:"book",section:"Core",genre:"Investing"},
{id:"B78",name:"Market Wizards",hours:9,type:"book",section:"Core",genre:"Investing"},
{id:"B79",name:"When Money Dies",hours:8,type:"book",section:"Core",genre:"Investing"},
{id:"B80",name:"Lords of Finance",hours:14,type:"book",section:"Core",genre:"Investing"},
{id:"B81",name:"When Genius Failed",hours:8,type:"book",section:"Core",genre:"Investing"},
{id:"B82",name:"Manias, Panics & Crashes",hours:12,type:"book",section:"Core",genre:"Investing"},
{id:"B83",name:"Common Stocks & Uncommon Profits",hours:8,type:"book",section:"Core",genre:"Investing"},
{id:"B84",name:"The World for Sale",hours:9,type:"book",section:"Core",genre:"Investing"},
{id:"B85",name:"A Random Walk Down Wall Street",hours:13,type:"book",section:"Core",genre:"Investing"},
{id:"B86",name:"Against the Gods",hours:9,type:"book",section:"Core",genre:"Investing"},
{id:"B87",name:"You Can Be a Stock Market Genius",hours:7,type:"book",section:"Core",genre:"Investing"},
{id:"B88",name:"Reminiscences of a Stock Operator",hours:9,type:"book",section:"Core",genre:"Investing"},
{id:"B89",name:"Berkshire Letters to Shareholders",hours:16,type:"book",section:"Core",genre:"Investing"},
{id:"B90",name:"The Great Crash 1929",hours:6,type:"book",section:"Core",genre:"Investing"},
{id:"B91",name:"The Lords of Easy Money",hours:10,type:"book",section:"Core",genre:"Investing"},
{id:"B92",name:"This Time Is Different",hours:13,type:"book",section:"Core",genre:"Investing"},
{id:"B93",name:"Devil Take the Hindmost",hours:12,type:"book",section:"Core",genre:"Investing"},
{id:"B94",name:"The Dao of Capital",hours:7,type:"book",section:"Core",genre:"Investing"},
{id:"B95",name:"Antifragile",hours:12,type:"book",section:"Core",genre:"Philosophy"},
{id:"B96",name:"Don't Make Me Think",hours:3.5,type:"book",section:"Core",genre:"Tinker"},
{id:"B97",name:"The Three Body Problem",hours:10,type:"book",section:"Core",genre:"Literature"},
{id:"B98",name:"Foundation Trilogy",hours:17,type:"book",section:"Core",genre:"Literature"},
{id:"B99",name:"The War of Art",hours:4,type:"book",section:"Core",genre:"Philosophy"},
{id:"B100",name:"Nicomachean Ethics",hours:6,type:"book",section:"Core",genre:"Philosophy"},
{id:"B101",name:"Scientific Revolution",hours:4,type:"book",section:"Core",genre:"Science"},
{id:"B102",name:"The Diamond Age",hours:13,type:"book",section:"Core",genre:"Literature"},
{id:"B103",name:"The Martian",hours:10,type:"book",section:"Core",genre:"Literature"},
{id:"B104",name:"The Divine Comedy",hours:9,type:"book",section:"Optional",genre:"Literature"},
{id:"B105",name:"Blood Meridian",hours:13,type:"book",section:"Optional",genre:"Literature"},
{id:"B106",name:"The Lord of the Rings",hours:40,type:"book",section:"Optional",genre:"Literature"},
{id:"B107",name:"Stranger in a Strange Land",hours:13,type:"book",section:"Optional",genre:"Literature"},
{id:"B108",name:"The Jungle",hours:13,type:"book",section:"Optional",genre:"Literature"},
{id:"B109",name:"The Old Man and the Sea",hours:2,type:"book",section:"Optional",genre:"Literature"},
{id:"B110",name:"The Fountainhead",hours:28,type:"book",section:"Optional",genre:"Philosophy"},
{id:"B111",name:"Decline & Fall of the Roman Empire Vol 1",hours:17,type:"book",section:"Optional",genre:"World History"},
{id:"B112",name:"The Canterbury Tales",hours:9,type:"book",section:"Optional",genre:"Literature"},
{id:"B113",name:"War and Peace",hours:48,type:"book",section:"Optional",genre:"Literature"},
{id:"B114",name:"Don Quixote",hours:33,type:"book",section:"Optional",genre:"Literature"},
{id:"B115",name:"Glory Road",hours:8,type:"book",section:"Optional",genre:"Literature"},
{id:"B116",name:"Novum Organum",hours:3,type:"book",section:"Optional",genre:"Philosophy"},
{id:"B117",name:"The Time Machine",hours:3,type:"book",section:"Optional",genre:"Literature"},
{id:"B118",name:"Hitchhiker's Guide to the Galaxy",hours:4,type:"book",section:"Optional",genre:"Literature"},
{id:"B119",name:"Dragon's Egg",hours:8,type:"book",section:"Optional",genre:"Literature"},
{id:"B120",name:"Moby Dick",hours:18,type:"book",section:"Optional",genre:"Literature"},
{id:"B121",name:"Slaughterhouse Five",hours:5,type:"book",section:"Optional",genre:"Literature"},
{id:"B122",name:"One Second After",hours:9,type:"book",section:"Optional",genre:"Literature"},
{id:"B123",name:"Lonesome Dove",hours:24,type:"book",section:"Optional",genre:"American History"},
{id:"B124",name:"In the Heart of the Sea",hours:8,type:"book",section:"Optional",genre:"Nature"},
{id:"B125",name:"For Whom The Bell Tolls",hours:11,type:"book",section:"Optional",genre:"Literature"},
{id:"B126",name:"The Portable Greek Historians",hours:9,type:"book",section:"Optional",genre:"World History"},
{id:"B127",name:"The Enlightenment",hours:4,type:"book",section:"Optional",genre:"World History"},
{id:"B128",name:"Confessions",hours:8,type:"book",section:"Optional",genre:"Philosophy"},
{id:"B129",name:"Before France & Germany",hours:8,type:"book",section:"Optional",genre:"World History"},
{id:"B130",name:"The Carolingians",hours:8,type:"book",section:"Optional",genre:"World History"},
{id:"B131",name:"Magna Carta",hours:7,type:"book",section:"Optional",genre:"Law"},
{id:"B132",name:"Heart of Europe",hours:17,type:"book",section:"Optional",genre:"World History"},
{id:"B133",name:"The Fall of Rome",hours:6,type:"book",section:"Optional",genre:"World History"},
{id:"B134",name:"The Holy Roman Empire",hours:15,type:"book",section:"Optional",genre:"World History"},
{id:"B135",name:"Collapse",hours:18,type:"book",section:"Optional",genre:"World History"},
{id:"B136",name:"What Has Government Done to Our Money",hours:12.7,type:"book",section:"Optional",genre:"Economics"},
{id:"B137",name:"The Silk Roads",hours:20,type:"book",section:"Optional",genre:"World History"},
{id:"B138",name:"The Russian Revolution",hours:7,type:"book",section:"Optional",genre:"World History"},
{id:"B139",name:"The Gulag Archipelago",hours:46,type:"book",section:"Optional",genre:"World History"},
{id:"B140",name:"Hagakure",hours:4,type:"book",section:"Optional",genre:"Philosophy"},
{id:"B141",name:"Bhagavad Gita",hours:4,type:"book",section:"Optional",genre:"Philosophy"},
{id:"B142",name:"A History of the US in Five Crashes",hours:8,type:"book",section:"Optional",genre:"American History"},
{id:"B143",name:"A Demon of Our Own Design",hours:7,type:"book",section:"Optional",genre:"Investing"},
{id:"B144",name:"Once in Golconda",hours:7,type:"book",section:"Optional",genre:"Investing"},
{id:"B145",name:"Skeletons on the Zahara",hours:7.5,type:"book",section:"Optional",genre:"Nature"},
{id:"B146",name:"The Prince",hours:3,type:"book",section:"Optional",genre:"Philosophy"},
{id:"B147",name:"Outwitting the Devil",hours:7,type:"book",section:"Optional",genre:"Entrepreneur"},
{id:"B148",name:"Put Your Ass Where Your Heart Wants to Be",hours:3,type:"book",section:"Optional",genre:"Philosophy"},
{id:"B149",name:"Memories, Dreams, Reflections",hours:10,type:"book",section:"Optional",genre:"Psychology"},
{id:"B150",name:"12 Rules for Life",hours:10,type:"book",section:"Optional",genre:"Psychology"},
{id:"B151",name:"About Face",hours:19,type:"book",section:"Optional",genre:"World History"},
{id:"B152",name:"With the Old Breed",hours:8,type:"book",section:"Optional",genre:"World History"},
{id:"B153",name:"Napoleon: A Life",hours:25,type:"book",section:"Optional",genre:"World History"},
{id:"B154",name:"Stilwell and the American Experience in China",hours:16,type:"book",section:"Optional",genre:"World History"},
{id:"B155",name:"The Fourth Turning",hours:8,type:"book",section:"Optional",genre:"World History"},
{id:"B156",name:"Dumbing Us Down",hours:2,type:"book",section:"Optional",genre:"Psychology"},
{id:"B157",name:"The Singularity is Near",hours:10,type:"book",section:"Optional",genre:"Tinker"},
{id:"B158",name:"The Machinery of Freedom",hours:8,type:"book",section:"Optional",genre:"Economics"},
{id:"B159",name:"The Bitcoin Standard",hours:7,type:"book",section:"Optional",genre:"Investing"},
{id:"B160",name:"The Wealth of Nations",hours:31,type:"book",section:"Optional",genre:"Economics"},
{id:"B161",name:"Wealth, War & Wisdom",hours:10,type:"book",section:"Optional",genre:"Investing"},
{id:"B162",name:"Beating the Street",hours:9,type:"book",section:"Optional",genre:"Investing"},
{id:"B163",name:"The Little Book That Still Beats the Market",hours:5,type:"book",section:"Optional",genre:"Investing"},
{id:"B164",name:"What Works on Wall Street",hours:12,type:"book",section:"Optional",genre:"Investing"},
{id:"B165",name:"Adaptive Markets",hours:13,type:"book",section:"Optional",genre:"Investing"},
{id:"B166",name:"The Alchemy of Finance",hours:14,type:"book",section:"Optional",genre:"Investing"},
{id:"B167",name:"House of Morgan",hours:22,type:"book",section:"Optional",genre:"Investing"},
{id:"B168",name:"The Panic of 1907",hours:7,type:"book",section:"Optional",genre:"Investing"},
{id:"B169",name:"Misbehavior of Markets",hours:7,type:"book",section:"Optional",genre:"Investing"},
{id:"B170",name:"Financial Statement Analysis & Security Valuation",hours:20,type:"book",section:"Optional",genre:"Accounting"},
{id:"B171",name:"The Psychology of Money",hours:5,type:"book",section:"Optional",genre:"Investing"},
{id:"B172",name:"The Price of Time",hours:9,type:"book",section:"Optional",genre:"Economics"},
{id:"B173",name:"The Fruits of Graft",hours:14,type:"book",section:"Optional",genre:"World History"},
{id:"B174",name:"Only Yesterday (OPT)",hours:10,type:"book",section:"Optional",genre:"American History"},
{id:"B175",name:"The Hard Thing About Hard Things",hours:9,type:"book",section:"Optional",genre:"Entrepreneur"},
{id:"B176",name:"Confessions of the Pricing Man",hours:6,type:"book",section:"Optional",genre:"Sales"},
{id:"B177",name:"Zig Ziglar's Secrets of Closing the Sale",hours:6,type:"book",section:"Optional",genre:"Sales"},
{id:"B178",name:"The Resilient Farm and Homestead",hours:12,type:"book",section:"Optional",genre:"Nature"},
{id:"B179",name:"Holistic Management Handbook",hours:12,type:"book",section:"Optional",genre:"Nature"},
{id:"B180",name:"Breakthrough Copywriting",hours:5,type:"book",section:"Optional",genre:"Sales"},
{id:"B181",name:"Scientific Advertising",hours:3,type:"book",section:"Optional",genre:"Sales"},
{id:"B182",name:"Making Them Believe",hours:7,type:"book",section:"Optional",genre:"Sales"},
{id:"B183",name:"The 10 Commandments of A-List Copywriters",hours:3,type:"book",section:"Optional",genre:"Sales"},
{id:"B184",name:"The No-Code Revolution",hours:6,type:"book",section:"Optional",genre:"Tinker"},
];

const ALL_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const gc = g => {
  const m = {
    Biology:"#4ade80",Physics:"#60a5fa",Marketing:"#f472b6",Sales:"#fb923c",
    Investing:"#facc15",Law:"#a78bfa",Literature:"#38bdf8","World History":"#f97316",
    "American History":"#ef4444",Art:"#e879f9",Geology:"#86efac",Chemistry:"#fde68a",
    Pilot:"#7dd3fc",Welder:"#fca5a5",Maker:"#6ee7b7",Philosophy:"#fcd34d",
    Nature:"#86efac",Entrepreneur:"#fdba74",Accounting:"#94a3b8",
    Tinker:"#67e8f9",Psychology:"#c4b5fd",Chef:"#fb923c",Music:"#e879f9",
    Science:"#a5b4fc","Music Theory":"#f0abfc",Meteorology:"#7dd3fc",
    Economics:"#fbbf24",Astronomy:"#a5b4fc",
  };
  if (!g) return "#94a3b8";
  for (const [k,v] of Object.entries(m)) if (g.toLowerCase()===k.toLowerCase()) return v;
  return "#94a3b8";
};

const load = (k,d) => { try { return JSON.parse(localStorage.getItem(k))??d; } catch { return d; } };
const save = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

function getMonday() {
  const d=new Date(),day=d.getDay(),diff=day===0?-6:1-day;
  d.setDate(d.getDate()+diff);d.setHours(0,0,0,0);
  return d.toISOString().split('T')[0];
}
function getDayIdx(){ const d=new Date().getDay(); return d===0?6:d-1; }
function getDayName(){ return ALL_DAYS[getDayIdx()]; }
function getTodayISO(){ return new Date().toISOString().split('T')[0]; }
function getWeekISO(){ return new Date().toISOString().split('T')[0].slice(0,7); }
function isSunday(){ return new Date().getDay()===0; }
function isMonday(){ return new Date().getDay()===1; }

const SK_P="tp_p4",SK_W="tp_w4",SK_F="tp_f4",SK_REVIEWS="tp_reviews2",SK_PROFILE="tp_profile2";
const SK_PLAN="tp_plan2",SK_QUEUE="tp_queue1",SK_WEEKLY_HOURS="tp_wkhours1",SK_CUSTOM="tp_custom1";
const SK_SUNDAY_DONE="tp_sundaydone1",SK_SETTINGS="tp_settings1";
const SK_NOTIFS="tp_notifs1";
const SK_HIDDEN="tp_hidden1";
const MAX_REVIEWS=20;
const NOTIF_TTL_MS = 3*24*60*60*1000;

const DEFAULT_SETTINGS={
  weeklyTarget: 20,
  activeDays: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
  courseRatio: 2,
  bookRatio: 1,
  courseMaxSession: 1.5,
  bookMaxSession: 2.0,
};

const DEFAULT_PROFILE=`LEARNER: Connor, 18, Kamloops BC. Self-directed 4-year curriculum called The Preparation.

TIME RATIOS (configurable in Settings):
- Courses: 1h content = 2h real study time. Max 1.5h real per session.
- Books: 1h content = 1h real. Max 2h real per session.
- Weekly budget: configurable in Settings (default 20 real hours).

SEQUENCING RULES:
- Complete Core before Optional in any genre.
- Vary genre every session — never same genre twice in one day.
- Max 2-3 active courses, always pair 2-4 books alongside.
- Always keep 1 Philosophy book active.
- When user asks for specific topics (e.g. "roman history"), map to real curriculum item IDs.

4-YEAR ARC: Year 1 Foundations → Year 2 Applied → Year 3 Specialization → Year 4 Integration`;

const T={
  bg:"#141414",surface0:"#1a1a1a",surface1:"#202020",surface2:"#272727",surface3:"#2e2e2e",
  border:"rgba(255,255,255,0.07)",borderLight:"rgba(255,255,255,0.13)",
  text:"#f0f0f0",textMid:"#999",textDim:"#5a5a5a",textFaint:"#3a3a3a",
  blue:"#60a5fa",green:"#4ade80",pink:"#f472b6",yellow:"#facc15",red:"#ef4444",orange:"#fb923c",
  fontUI:"'DM Sans', -apple-system, sans-serif",
};
const shadow={
  card:"0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 16px rgba(0,0,0,0.5)",
  raised:"0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 32px rgba(0,0,0,0.6)",
  glow:c=>`0 0 12px ${c}28, 0 0 32px ${c}10`,
  inset:"inset 0 2px 8px rgba(0,0,0,0.6)",
};

const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin:0; padding:0; background:#141414; overscroll-behavior:none; }
  body { -webkit-overflow-scrolling: touch; }
  @keyframes splashBloom {
    0%   { opacity:0; transform:scale(0.6); }
    60%  { opacity:1; transform:scale(1.05); }
    100% { opacity:1; transform:scale(1); }
  }
  @keyframes splashPulse { 0% { opacity:0.55; } 100% { opacity:1; } }
  @keyframes splashOut { to { opacity:0; } }
  @keyframes fadeUp {
    from { opacity:0; transform:translateY(14px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  @keyframes slideInLeft {
    from { transform:translateX(-100%); opacity:0; }
    to   { transform:translateX(0);     opacity:1; }
  }
  @keyframes slideInUp {
    from { transform:translateY(100%); opacity:0; }
    to   { transform:translateY(0);    opacity:1; }
  }
  @keyframes toastIn {
    from { opacity:0; transform:translateX(-50%) translateY(-8px) scale(0.95); }
    to   { opacity:1; transform:translateX(-50%) translateY(0)    scale(1); }
  }
  .btn-press { transition: transform 0.15s ease, opacity 0.15s ease; }
  .btn-press:active { transform: scale(0.97); opacity:0.88; }
  .tab-content { animation: fadeUp 0.32s ease both; }
  input, textarea { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
  input:focus, textarea:focus { border-color: #60a5fa60 !important; box-shadow: 0 0 0 3px #60a5fa12; outline:none; }
  body.menu-open { overflow: hidden; position: fixed; width: 100%; }
`;

// ── Splash ────────────────────────────────────────────────────────────────────
function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState("in");
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("pulse"), 400);
    const t2 = setTimeout(() => setPhase("out"),  1900);
    const t3 = setTimeout(() => onDone(),          2450);
    return () => [t1,t2,t3].forEach(clearTimeout);
  }, []);
  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"#141414",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      paddingBottom:"env(safe-area-inset-bottom)",
      animation:phase==="out"?"splashOut 0.55s ease forwards":"none",pointerEvents:"none"}}>
      <div style={{position:"absolute",width:280,height:280,borderRadius:"50%",
        background:"radial-gradient(circle, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 40%, transparent 70%)",
        animation:phase==="in"?"none":"splashBloom 0.7s ease forwards",
        opacity:phase==="in"?0:1,transition:"opacity 0.4s ease"}}/>
      <div style={{position:"absolute",width:420,height:420,borderRadius:"50%",
        background:"radial-gradient(circle, rgba(96,165,250,0.04) 0%, transparent 65%)",
        animation:phase==="in"?"none":"splashBloom 1s ease 0.1s forwards",
        opacity:phase==="in"?0:1}}/>
      <div style={{position:"relative",textAlign:"center",
        animation:phase==="in"?"none":phase==="pulse"?"splashBloom 0.5s ease forwards":"none",
        opacity:phase==="in"?0:1,transition:"opacity 0.4s ease"}}>
        <div style={{fontSize:11,letterSpacing:7,textTransform:"uppercase",
          color:"rgba(255,255,255,0.35)",fontFamily:T.fontUI,fontWeight:700,marginBottom:14,
          animation:phase==="pulse"?"splashPulse 1s ease-in-out infinite alternate":"none"}}>THE</div>
        <div style={{fontSize:34,fontWeight:800,letterSpacing:-1,color:"#f0f0f0",
          fontFamily:T.fontUI,lineHeight:1,marginBottom:10,
          animation:phase==="pulse"?"splashPulse 1s ease-in-out infinite alternate":"none"}}>PREPARATION</div>
        <div style={{fontSize:10,letterSpacing:5,textTransform:"uppercase",
          color:"rgba(255,255,255,0.2)",fontFamily:T.fontUI,fontWeight:600}}>LEARNING TRACKER</div>
        <div style={{width:40,height:1,margin:"18px auto 0",
          background:"linear-gradient(90deg, transparent, rgba(96,165,250,0.5), transparent)"}}/>
      </div>
    </div>
  );
}

// ── Notification system (inbox only — no banner) ──────────────────────────────
function useNotifications() {
  const [notifs, setNotifs] = useState(() => {
    const saved = load(SK_NOTIFS, []);
    const cutoff = Date.now() - NOTIF_TTL_MS;
    return saved.filter(n => n.ts > cutoff);
  });

  useEffect(() => { save(SK_NOTIFS, notifs); }, [notifs]);

  const push = useCallback((title, body, action = null) => {
    const n = { id: Date.now(), ts: Date.now(), title, body, action, read: false };
    setNotifs(prev => [n, ...prev].slice(0, 40));
  }, []);

  const markRead = useCallback(id => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const clearAll = useCallback(() => setNotifs([]), []);
  const dismiss = useCallback(id => setNotifs(prev => prev.filter(n => n.id !== id)), []);
  const unreadCount = notifs.filter(n => !n.read).length;
  return { notifs, push, markRead, clearAll, dismiss, unreadCount };
}

function NotifInbox({ notifs, onMarkRead, onDismiss, onClearAll, onAction, onClose }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:400,
      backdropFilter:"blur(4px)",animation:"fadeIn 0.2s ease both"}}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
        style={{position:"absolute",top:0,right:0,bottom:0,width:"min(88vw,340px)",
          background:T.surface0,borderLeft:`1px solid ${T.border}`,
          display:"flex",flexDirection:"column",
          boxShadow:"-8px 0 40px rgba(0,0,0,0.7)",
          animation:"slideInLeft 0.3s cubic-bezier(0.4,0,0.2,1) both"}}>
        <div style={{padding:`calc(env(safe-area-inset-top) + 18px) 18px 14px`,
          borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div style={{fontSize:16,fontWeight:800}}>Notifications</div>
            <div style={{display:"flex",gap:8}}>
              {notifs.length>0&&<button onClick={onClearAll} className="btn-press"
                style={{background:"none",border:`1px solid ${T.surface3}`,color:T.textDim,
                  borderRadius:8,padding:"4px 10px",fontSize:10,cursor:"pointer"}}>Clear all</button>}
              <button onClick={onClose} className="btn-press"
                style={{background:T.surface2,border:`1px solid ${T.surface3}`,color:T.textMid,
                  borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontWeight:700}}>✕</button>
            </div>
          </div>
          <div style={{fontSize:10,color:T.textDim}}>{notifs.length} notification{notifs.length!==1?"s":""} · saved 3 days</div>
        </div>
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"12px 16px 40px"}}>
          {notifs.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:T.textDim,fontSize:13}}>
            No notifications yet
          </div>}
          {notifs.map((n,i)=>(
            <div key={n.id} style={{
              background:n.read?T.surface1:`${T.blue}08`,
              border:`1px solid ${n.read?T.border:T.blue+"25"}`,
              borderRadius:12,padding:"12px 14px",marginBottom:8,
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
                <button onClick={()=>onDismiss(n.id)} className="btn-press"
                  style={{background:"none",border:"none",color:T.textFaint,fontSize:14,
                    cursor:"pointer",padding:"0 2px",flexShrink:0}}>✕</button>
              </div>
              {n.action&&<button onClick={()=>{onAction(n);onMarkRead(n.id);}} className="btn-press"
                style={{width:"100%",marginTop:10,background:"#0a1220",border:`1px solid ${T.blue}30`,
                  color:T.blue,borderRadius:8,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                {n.action.label}</button>}
              {!n.read&&<button onClick={()=>onMarkRead(n.id)} className="btn-press"
                style={{background:"none",border:"none",color:T.textDim,fontSize:10,
                  cursor:"pointer",marginTop:6,padding:0}}>Mark read</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Pill({color,label}){
  return <span style={{display:"inline-flex",alignItems:"center",fontSize:10,fontWeight:600,
    color,background:`${color}15`,borderRadius:20,padding:"2px 8px",
    border:`1px solid ${color}25`,letterSpacing:0.3,boxShadow:`0 0 8px ${color}15`}}>{label}</span>;
}
function Bar({pct,color=T.blue,height=4,style={},glow=false}){
  return <div style={{background:T.surface2,borderRadius:99,height,overflow:"hidden",boxShadow:shadow.inset,...style}}>
    <div style={{background:color,width:`${Math.min(100,Math.max(0,pct))}%`,height:"100%",
      borderRadius:99,transition:"width 0.5s ease",boxShadow:glow?`0 0 8px ${color}80`:"none"}}/>
  </div>;
}
function Card({children,style={},accent,glow=false}){
  return <div style={{background:T.surface1,borderRadius:16,border:`1px solid ${T.border}`,
    borderTop:`1px solid ${T.borderLight}`,
    boxShadow:glow&&accent?`${shadow.card}, 0 0 24px ${accent}12`:shadow.card,
    ...(accent?{borderLeft:`3px solid ${accent}`}:{}),
    ...style}}>{children}</div>;
}
function StarRating({value,onChange}){
  return <div style={{display:"flex",gap:6}}>
    {[1,2,3,4,5].map(s=>(
      <button key={s} onClick={()=>onChange(s)} className="btn-press"
        style={{background:"none",border:"none",fontSize:28,cursor:"pointer",
          color:s<=value?T.yellow:T.surface3,
          textShadow:s<=value?`0 0 10px ${T.yellow}80`:"none",
          transition:"color 0.15s, text-shadow 0.15s",padding:"2px 4px"}}>★</button>
    ))}
  </div>;
}
function SessionHistory({item,sessions,onEdit}){
  const [open,setOpen]=useState(false);
  return <div style={{marginTop:10}}>
    <button onClick={()=>setOpen(o=>!o)} className="btn-press"
      style={{background:"none",border:"none",color:open?T.blue:T.textDim,fontSize:10,
        cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:"2px 0",
        letterSpacing:0.5,fontWeight:600,textTransform:"uppercase",transition:"color 0.2s"}}>
      <span style={{fontSize:8,transition:"transform 0.2s",display:"inline-block",
        transform:open?"rotate(0deg)":"rotate(-90deg)"}}>▼</span>
      Log History
      <span style={{color:T.textFaint,fontWeight:400,textTransform:"none",letterSpacing:0}}>({sessions.length})</span>
    </button>
    <div style={{overflow:"hidden",maxHeight:open?"600px":"0",transition:"max-height 0.3s ease"}}>
      <div style={{marginTop:8,borderLeft:`1px solid ${T.surface3}`,paddingLeft:12}}>
        {sessions.map((s,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"7px 0",borderBottom:`1px solid ${T.surface2}`,
            animation:`fadeUp 0.15s ease ${i*0.04}s both`}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,color:T.textMid,fontWeight:500}}>{s.date}</div>
              <div style={{fontSize:10,color:T.textDim,marginTop:2}}>
                {s.studyHours}h real · {s.courseHours}h content{s.note?` · ${s.note}`:""}
              </div>
            </div>
            <button onClick={()=>onEdit(i)} className="btn-press"
              style={{background:T.surface2,border:`1px solid ${T.surface3}`,color:T.blue,
                borderRadius:7,padding:"3px 10px",fontSize:10,cursor:"pointer",fontWeight:600,marginLeft:10}}>
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
  return <div style={{background:T.surface1,border:`1px solid ${T.border}`,
    borderTop:`1px solid ${T.borderLight}`,borderRadius:14,marginBottom:8,
    overflow:"hidden",boxShadow:shadow.card}}>
    <div onClick={()=>setOpen(o=>!o)} className="btn-press"
      style={{padding:"14px 16px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:13,fontWeight:700,letterSpacing:0.1}}>{sec.label}</div>
        <div style={{fontSize:10,color:T.textDim,marginTop:3}}>{sec.items.length} items · {totalContentH}h content</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:16,fontWeight:900,color:pct>0?T.blue:T.textFaint}}>{pct}%</div>
          <div style={{fontSize:9,color:T.textDim,marginTop:1}}>{done} done · {active} active</div>
        </div>
        <div style={{color:T.textFaint,fontSize:11,transition:"transform 0.2s",transform:open?"rotate(180deg)":"rotate(0deg)"}}>▼</div>
      </div>
    </div>
    <Bar pct={pct} style={{margin:"0 16px 10px",height:3}} glow={pct>0}/>
    <div style={{overflow:"hidden",maxHeight:open?"9999px":"0",transition:"max-height 0.35s ease"}}>
      <div style={{padding:"0 12px 12px"}}>
        {sec.items.map(item=>{
          const p=getP(item.id),inFocus=focusIds.includes(item.id);
          const isDone=p.percentComplete>=100,isTouched=p.percentComplete>0&&!isDone;
          const c=gc(item.genre);
          const contentLeft=Math.max(0,(item.hours||0)-(p.courseHoursComplete||0));
          const realLeft=contentToReal(item,contentLeft,settings);
          return <div key={item.id}
            style={{display:"flex",alignItems:"center",gap:10,padding:"8px 6px",
              borderBottom:`1px solid ${T.surface2}`}}>
            <div style={{width:6,height:6,borderRadius:"50%",flexShrink:0,
              background:isDone?T.green:isTouched?c:inFocus?"#f472b6":T.surface3,
              boxShadow:isDone||isTouched?`0 0 6px ${isDone?T.green:c}60`:"none"}}/>
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
                style={{background:"none",border:`1px solid ${T.red}20`,color:T.red,
                  borderRadius:8,padding:"7px 12px",fontSize:10,cursor:"pointer",fontWeight:600,minHeight:36}}>Reset</button>}
              {!isDone&&<button onClick={()=>setLogging(item)} className="btn-press"
                style={{background:T.surface2,border:`1px solid ${T.surface3}`,color:T.blue,
                  borderRadius:8,padding:"7px 14px",fontSize:11,cursor:"pointer",fontWeight:700,minHeight:36}}>Log</button>}
              <button onClick={()=>onDelete(item)} className="btn-press"
                style={{background:"none",border:`1px solid ${T.red}15`,color:T.red,
                  borderRadius:8,padding:"7px 10px",fontSize:11,cursor:"pointer",fontWeight:600,opacity:0.6,minHeight:36}}>✕</button>
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
  return `${item.id} "${item.name}" (${item.type},${item.section},${item.genre}): `
    +`totalContent=${item.hours}h|contentDone=${contentDone.toFixed(2)}h|pct=${p.percentComplete}%|`
    +`contentLeft=${contentLeft.toFixed(2)}h|realLeft=${realLeft.toFixed(2)}h|realSpent=${(p.hoursSpent||0).toFixed(2)}h`;
}
const callAI=async(prompt,max_tokens=1500,model="claude-haiku-4-5-20251001")=>{
  const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model,max_tokens,messages:[{role:"user",content:prompt}]})});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const d=await r.json();
  if(d.error) throw new Error(d.error.message||"API error");
  return d.content.map(c=>c.text||"").join("");
};
const loadQueue=()=>load(SK_QUEUE,[]);
const saveQueue=q=>save(SK_QUEUE,q);
const enqueue=(type,payload)=>{const q=loadQueue();q.push({id:Date.now(),type,payload,ts:new Date().toISOString()});saveQueue(q);};
const dequeue=id=>saveQueue(loadQueue().filter(x=>x.id!==id));

function reconcileWeekHours(progress){
  const mon=new Date(getMonday()),sun=new Date(mon);sun.setDate(mon.getDate()+6);
  let total=0;
  Object.values(progress).forEach(p=>{
    (p.sessions||[]).forEach(s=>{
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

  const inputSt = {width:"100%",background:T.surface0,border:`1px solid ${T.surface3}`,
    borderRadius:10,padding:"10px 12px",color:T.text,fontSize:13,
    boxSizing:"border-box",fontFamily:"inherit"};
  const numSt = {...inputSt, width:80, textAlign:"center", fontSize:16, fontWeight:700, padding:"8px 10px"};

  return (
    <>
      <div onClick={onClose} style={{
        position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(3px)",
        opacity:open?1:0,pointerEvents:open?"all":"none",
        transition:"opacity 0.28s ease",touchAction:open?"none":"auto",
      }}/>
      <div style={{
        position:"fixed",top:0,left:0,bottom:0,width:"min(88vw,360px)",
        background:T.surface0,zIndex:201,borderRight:`1px solid ${T.border}`,
        boxShadow:"8px 0 40px rgba(0,0,0,0.7)",display:"flex",flexDirection:"column",
        transform:open?"translateX(0)":"translateX(-100%)",
        transition:"transform 0.35s cubic-bezier(0.4,0,0.2,1)",
        overflowY:"auto",WebkitOverflowScrolling:"touch",
      }}>
        <div style={{padding:`calc(env(safe-area-inset-top) + 18px) 18px 14px`,
          borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{fontSize:9,color:T.textDim,letterSpacing:4,textTransform:"uppercase",marginBottom:4}}>The Preparation</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:18,fontWeight:800,letterSpacing:-0.3}}>Learning Tracker</div>
            <button onClick={onClose} className="btn-press"
              style={{background:T.surface2,border:`1px solid ${T.surface3}`,color:T.textMid,
                borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontWeight:700}}>✕</button>
          </div>
          <div style={{display:"flex",gap:0,marginTop:14}}>
            {[["settings","Settings"],["history","Reviews"],["notifs","Inbox"]].map(([k,l])=>(
              <button key={k} onClick={()=>setSection(k)} className="btn-press"
                style={{flex:1,padding:"8px 0",background:"none",border:"none",
                  borderBottom:section===k?`2px solid ${T.blue}`:"2px solid transparent",
                  color:section===k?T.blue:T.textDim,fontSize:11,fontWeight:700,cursor:"pointer",
                  textTransform:"uppercase",letterSpacing:0.8,transition:"color 0.2s, border-color 0.2s",
                  position:"relative"}}>
                {l}
                {k==="notifs"&&unreadCount>0&&<span style={{
                  position:"absolute",top:4,right:4,background:T.blue,color:"#000",
                  borderRadius:"50%",width:14,height:14,fontSize:8,fontWeight:800,
                  display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
                  {unreadCount>9?"9+":unreadCount}
                </span>}
              </button>
            ))}
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px 18px 60px",WebkitOverflowScrolling:"touch"}}>
          {section==="settings"&&<div style={{animation:"fadeUp 0.28s ease both"}}>

            <div style={{fontSize:9,color:T.blue,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:700}}>
              Learning Profile
            </div>
            <Card style={{padding:"13px 14px",marginBottom:6,border:`1px solid ${T.blue}20`}}>
              <div style={{fontSize:11,color:T.textMid,lineHeight:1.6,marginBottom:10}}>
                The AI reads this every time it plans, adapts, or makes any decision.
              </div>
              <textarea value={profile} onChange={e=>setProfile(e.target.value)}
                style={{...inputSt,fontSize:12,height:200,resize:"none",lineHeight:1.6}}
                placeholder="I'm 18, self-directed learner..."/>
            </Card>
            <div style={{fontSize:10,color:T.textDim,marginBottom:20,lineHeight:1.5,paddingLeft:2}}>
              Changes take effect on the next plan or adapt.
            </div>

            <div style={{fontSize:9,color:T.blue,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:700}}>
              Schedule
            </div>
            <Card style={{padding:"13px 14px",marginBottom:6,border:`1px solid ${T.blue}20`}}>
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
                      style={{background:on?`${T.blue}20`:T.surface2,
                        border:`1px solid ${on?T.blue+"50":T.surface3}`,
                        color:on?T.blue:T.textDim,borderRadius:8,padding:"6px 10px",
                        fontSize:11,cursor:"pointer",fontWeight:on?700:400,transition:"all 0.18s"}}>
                      {day}</button>;
                  })}
                </div>
                <div style={{fontSize:10,color:T.textDim,marginTop:8}}>
                  {localSettings.activeDays.length} days · {((localSettings.weeklyTarget||20)/Math.max(1,localSettings.activeDays.length)).toFixed(1)}h avg/day
                </div>
              </div>
            </Card>
            <button onClick={()=>onSaveSettings(localSettings)} className="btn-press"
              style={{width:"100%",background:"#0a1220",border:`1px solid ${T.blue}30`,color:T.blue,
                borderRadius:10,padding:"11px 0",fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:20}}>
              Save Schedule
            </button>

            <div style={{fontSize:9,color:T.blue,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:700}}>
              Study Ratios
            </div>
            <Card style={{padding:"13px 14px",marginBottom:6,border:`1px solid ${T.blue}20`}}>
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
                        style={{background:on?`${T.blue}20`:T.surface2,border:`1px solid ${on?T.blue+"50":T.surface3}`,
                          color:on?T.blue:T.textDim,borderRadius:8,padding:"5px 8px",fontSize:11,
                          cursor:"pointer",fontWeight:on?700:400,transition:"all 0.18s"}}>{v}</button>;
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
                        style={{background:on?`${T.blue}20`:T.surface2,border:`1px solid ${on?T.blue+"50":T.surface3}`,
                          color:on?T.blue:T.textDim,borderRadius:8,padding:"5px 8px",fontSize:11,
                          cursor:"pointer",fontWeight:on?700:400,transition:"all 0.18s"}}>{v}</button>;
                    })}
                  </div>
                  <div style={{fontSize:10,color:T.textFaint,marginTop:6}}>1h content = {localSettings.bookRatio??1}h real</div>
                </div>
              </div>
              <div style={{borderTop:`1px solid ${T.surface3}`,paddingTop:12,marginTop:4}}>
                <div style={{fontSize:11,color:T.textMid,marginBottom:10,fontWeight:600}}>Max real hours per session (0.5 – 5)</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div>
                    <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>Course max</label>
                    <input type="text" inputMode="decimal"
                      value={localSettings._courseMaxRaw ?? String(localSettings.courseMaxSession ?? 1.5)}
                      onChange={e=>setLocalSettings(s=>({...s,_courseMaxRaw:e.target.value}))}
                      onBlur={()=>setLocalSettings(s=>{
                        const v=Math.max(0.5,Math.min(5,parseFloat(s._courseMaxRaw)||1.5));
                        const snapped=Math.round(v*2)/2;
                        return{...s,courseMaxSession:snapped,_courseMaxRaw:String(snapped)};
                      })}
                      style={{...numSt,width:80}}/>
                    <div style={{fontSize:10,color:T.textFaint,marginTop:4}}>{localSettings.courseMaxSession??1.5}h max</div>
                  </div>
                  <div>
                    <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>Book max</label>
                    <input type="text" inputMode="decimal"
                      value={localSettings._bookMaxRaw ?? String(localSettings.bookMaxSession ?? 2)}
                      onChange={e=>setLocalSettings(s=>({...s,_bookMaxRaw:e.target.value}))}
                      onBlur={()=>setLocalSettings(s=>{
                        const v=Math.max(0.5,Math.min(5,parseFloat(s._bookMaxRaw)||2));
                        const snapped=Math.round(v*2)/2;
                        return{...s,bookMaxSession:snapped,_bookMaxRaw:String(snapped)};
                      })}
                      style={{...numSt,width:80}}/>
                    <div style={{fontSize:10,color:T.textFaint,marginTop:4}}>{localSettings.bookMaxSession??2}h max</div>
                  </div>
                </div>
              </div>
            </Card>
            <button onClick={()=>onSaveSettings(localSettings)} className="btn-press"
              style={{width:"100%",background:"#0a1220",border:`1px solid ${T.blue}30`,color:T.blue,
                borderRadius:10,padding:"11px 0",fontSize:13,fontWeight:800,cursor:"pointer",marginBottom:20}}>
              Save Ratios
            </button>

            <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:700}}>Data Backup</div>
            <Card style={{padding:"13px 14px",marginBottom:20}}>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <button onClick={onExport} className="btn-press"
                  style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                    color:T.textMid,borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:"pointer"}}>Export JSON</button>
                <button onClick={onImport} className="btn-press"
                  style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                    color:T.textMid,borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:"pointer"}}>Import JSON</button>
              </div>
              <button onClick={onClearAll} className="btn-press"
                style={{width:"100%",background:"#180a0a",border:`1px solid ${T.red}20`,
                  color:T.red,borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:"pointer"}}>Clear All Data</button>
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
                        style={{flex:1,background:newItem.type===t?`${T.blue}20`:T.surface2,
                          border:`1px solid ${newItem.type===t?T.blue+"50":T.surface3}`,
                          color:newItem.type===t?T.blue:T.textDim,
                          borderRadius:8,padding:"7px 0",fontSize:11,cursor:"pointer",fontWeight:700,
                          textTransform:"capitalize",transition:"all 0.18s"}}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:5}}>Section</label>
                  <div style={{display:"flex",gap:6}}>
                    {["Core","Optional"].map(sec=>(
                      <button key={sec} onClick={()=>setNewItem(n=>({...n,section:sec}))} className="btn-press"
                        style={{flex:1,background:newItem.section===sec?`${T.green}20`:T.surface2,
                          border:`1px solid ${newItem.section===sec?T.green+"50":T.surface3}`,
                          color:newItem.section===sec?T.green:T.textDim,
                          borderRadius:8,padding:"7px 0",fontSize:11,cursor:"pointer",fontWeight:700,
                          transition:"all 0.18s"}}>{sec}</button>
                    ))}
                  </div>
                </div>
              </div>
              {newItem.type==="course"&&newItem.hours&&<div style={{fontSize:11,color:T.blue,marginBottom:10}}>
                = {(parseFloat(newItem.hours||0)*(localSettings.courseRatio??2)).toFixed(1)}h real study time
              </div>}
              <button onClick={addCustomItem} className="btn-press"
                style={{width:"100%",background:"#0a1220",border:`1px solid ${T.blue}30`,color:T.blue,
                  borderRadius:10,padding:"11px 0",fontSize:13,fontWeight:800,cursor:"pointer"}}>
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
                style={{background:"none",border:`1px solid ${T.surface3}`,color:T.textDim,
                  borderRadius:8,padding:"4px 10px",fontSize:10,cursor:"pointer"}}>Clear all</button>}
            </div>
            {notifs.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:T.textDim,fontSize:13}}>
              No notifications yet
            </div>}
            {notifs.map((n,i)=>(
              <div key={n.id} style={{
                background:n.read?T.surface1:`${T.blue}08`,
                border:`1px solid ${n.read?T.border:T.blue+"25"}`,
                borderRadius:12,padding:"12px 14px",marginBottom:8,
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
                      cursor:"pointer",padding:"0 2px",flexShrink:0}}>✕</button>
                </div>
                {n.action&&<button onClick={()=>{onNotifAction(n);onMarkRead(n.id);onNotifClose();}} className="btn-press"
                  style={{width:"100%",marginTop:10,background:"#0a1220",border:`1px solid ${T.blue}30`,
                    color:T.blue,borderRadius:8,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer"}}>
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
                    background:T.surface0,borderRadius:10,padding:"10px 12px",
                    borderLeft:`2px solid ${T.blue}40`}}>{r.summary}</div>}
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
    return { ...DEFAULT_SETTINGS, ...saved };
  });
  const WEEKLY_TARGET = Math.max(5, Math.min(45, settings.weeklyTarget ?? 20));
  const ACTIVE_DAYS   = settings.activeDays ?? ALL_DAYS;

  // ── Course/book caps based on cognitive load research ──
  // 5-14h: 1 course + 2 books | 15-24h: 2 courses + 3 books
  // 25-34h: 2 courses + 4 books | 35-45h: 3 courses + 5 books
  const MAX_COURSES = WEEKLY_TARGET >= 35 ? 3 : WEEKLY_TARGET >= 15 ? 2 : 1;
  const MAX_BOOKS   = WEEKLY_TARGET >= 35 ? 5 : WEEKLY_TARGET >= 25 ? 4 : WEEKLY_TARGET >= 15 ? 3 : 2;

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
  const [logForm, setLogForm]                   = useState({hours:"",courseHours:"",note:"",date:new Date().toLocaleDateString(),_contentManuallySet:false});
  const [confirmLog, setConfirmLog]             = useState(false);
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
  const [markCompleteConfirm, setMarkCompleteConfirm] = useState(null);
  const [bonusItems, setBonusItems]             = useState(()=>load("tp_bonus1",[]));
  const [bonusLoading, setBonusLoading]         = useState(false);
  const [exportReminder, setExportReminder]     = useState(false);
  const [newItem, setNewItem]                   = useState({name:"",hours:"",type:"course",section:"Core",genre:""});
  const [showSundayReview, setShowSundayReview] = useState(false);
  const [sundayForm, setSundayForm]             = useState({stars:0,note:""});
  const [sundaySubmitting, setSundaySubmitting] = useState(false);
  const prevProgressRef = useRef({});

  const { notifs, push, markRead, clearAll: clearNotifs, dismiss: dismissNotif, unreadCount } = useNotifications();

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
    const last=parseInt(localStorage.getItem("tp_last_export")||"0");
    if((Date.now()-last)/(1000*60*60*24)>=14) setExportReminder(true);
  },[]);

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
    };
    check();const t=setInterval(check,60000);return()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
    requestNotificationPermission();
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
        if(item) push(
          `${item.id} Complete`,
          `"${item.name}" finished.`,
          {label:"Check-In",type:"viewCheckin"}
        );
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
      .map(i=>`${i.id}:"${i.name}"(book,${i.genre},${i.section})`)
      .join("|");

    return{reviewHistory,planVsActual,touchedAndFocus,nextCore,velocityTrend,avgH,courseIndex,bookIndex};
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
    const{reviewHistory,planVsActual,touchedAndFocus,nextCore,velocityTrend,avgH,courseIndex,bookIndex}=buildAIContext();
    const todayStr_=new Date().toLocaleDateString();
    const loggedToday_=Object.values(progress).some(p=>(p.sessions||[]).some(s=>s.date===todayStr_));
    const effectiveDayIdx_=loggedToday_?getDayIdx()+1:getDayIdx();
    const remainingDayNames=ALL_DAYS.slice(effectiveDayIdx_).filter(d=>ACTIVE_DAYS.includes(d));
    const effectiveDLeft=remainingDayNames.length;
    const effectiveWkRem=Math.max(0,WEEKLY_TARGET-weekH);
    if(effectiveDLeft===0||effectiveWkRem===0){toast_("Week complete");setAiLoading(false);return;}
    const dayBudgets=distributeDays(effectiveWkRem,remainingDayNames);

    const prompt=`Learning coach. Plan this learner's week. Respond ONLY with valid JSON — no commentary, no markdown.

STRICT HOUR RULES:
- Courses: 1h content = ${settings.courseRatio}h real. Max ${settings.courseMaxSession}h real/session.
- Books: 1h content = ${settings.bookRatio}h real. Max ${settings.bookMaxSession}h real/session.
- targetPct = floor((contentDone + contentGain) / totalContent × 100)
- ONLY use item IDs that exist in the COURSE INDEX or BOOK INDEX below. Never invent IDs.

WEEK BUDGET (MUST match exactly):
- Target: ${WEEKLY_TARGET}h real. Logged: ${weekH}h. Remaining: ${effectiveWkRem}h across ${effectiveDLeft} days: ${remainingDayNames.join(",")}.
- Day budgets: ${remainingDayNames.map((d,i)=>`${d}:${dayBudgets[i]}h`).join("|")}
- Vary genres — never same genre twice in one day.

FOCUS CAPS (cognitive load science — strictly enforced):
- Max ${MAX_COURSES} active course(s) + max ${MAX_BOOKS} active books at ${WEEKLY_TARGET}h/week.
- Reasoning: Working memory handles 4±1 concepts; interleaving works best with 2-3 subjects.
- Lower hours = fewer items for deeper retention.

LEARNER PROFILE:
${profile}

JOURNEY: Week ~${weekNum}. ARC: ${arcPosition}
VELOCITY: ${velocityTrend}. 4-week avg: ${avgH}h/wk.
${planGuidance?`\nLEARNER GUIDANCE: "${planGuidance}"
IMPORTANT — For courses: search COURSE INDEX by genre/title keywords. For books: search BOOK INDEX by title keywords and genre. Map the request to real IDs. For example "philosophy books" → search Book Index for genre=Philosophy items like B9,B16,B34,B95,B99,B100 etc.`:""}

CURRENT FOCUS (${focus.manual?"MANUAL — respect it":"AI-managed"}): ${focusIds.join(",")}

REVIEW HISTORY:
${reviewHistory||"None yet."}

FOCUS PROPOSAL RULES:
- Respect MAX_COURSES=${MAX_COURSES} and MAX_BOOKS=${MAX_BOOKS}.
- Always keep at least 1 Philosophy book active.
- Never propose Optional if genre has unfinished Core items.
- Only rotate if >85% complete OR 0 momentum 2+ weeks.

ACTIVE ITEMS:
${touchedAndFocus||"None."}

NEXT UNTOUCHED CORE:
${nextCore.slice(0,400)}

COURSE INDEX (use ONLY these IDs for courses):
${courseIndex.slice(0,2000)}

BOOK INDEX (use ONLY these IDs for books — search by title and genre to match guidance):
${bookIndex.slice(0,2500)}

JSON format:
{"days":[{"day":"Mon","totalDayRealH":3,"items":[{"id":"A1","realHours":1.5,"contentHours":0.75,"targetPct":10}]}],"insight":"1 sentence","assessment":"1 sentence","nextMilestone":"1 sentence","focusProposal":{"courses":["A1"],"books":["B34","B99"],"reasoning":"1 sentence"}}`;

    try{
      const raw=await callAI(prompt,2000);
      const jsonMatch=raw.replace(/```json[\s\S]*?```/g,m=>m.slice(7,-3)).replace(/```/g,"").trim().match(/\{[\s\S]*\}/);
      if(!jsonMatch) throw new Error("No JSON");
      const parsed=JSON.parse(jsonMatch[0]);
      // Strip completed items from all days
      const validatedDays=(parsed.days||[]).map((day,i)=>{
        const budget=dayBudgets[i]??dayBudgets[dayBudgets.length-1]??snap25(effectiveWkRem/effectiveDLeft);
        const filteredItems=(day.items||[]).filter(it=>{
          const p=getP(it.id);
          return CURRICULUM.find(c=>c.id===it.id)&&(p.percentComplete||0)<100;
        });
        return{...day,totalDayRealH:budget,
          items:scaleDayItems(filteredItems,budget,id=>CURRICULUM.find(c=>c.id===id),id=>getP(id),settings)};
      });
      const grandTotal=parseFloat(validatedDays.reduce((s,d)=>s+(d.totalDayRealH||0),0).toFixed(2));
      const drift=parseFloat((effectiveWkRem-grandTotal).toFixed(2));
      if(Math.abs(drift)>=0.05&&validatedDays.length>0){
        const last=validatedDays[validatedDays.length-1];
        const newDayH=parseFloat((last.totalDayRealH+drift).toFixed(2));
        validatedDays[validatedDays.length-1]={...last,totalDayRealH:newDayH,
          items:scaleDayItems(last.items,newDayH,id=>CURRICULUM.find(c=>c.id===id),id=>getP(id),settings)};
      }
      const keptDays=(weekPlan?.days||[]).filter(d=>ALL_DAYS.indexOf(d.day)<effectiveDayIdx_);
      const plan={weekStart:getMonday(),generatedAt:new Date().toISOString(),
        days:[...keptDays,...validatedDays],totalPlannedHours:effectiveWkRem,
        reasoning:parsed.insight||"",focusReasoning:parsed.focusProposal?.reasoning||""};
      setWeekPlan(plan);setAiResult(parsed);
      updateWeeklyHours(weekH);
      push("Week Plan Ready",parsed.insight||"Your week has been planned. Tap to view.",{label:"View Week",type:"viewWeek"});
    }catch(e){console.error(e);toast_("Couldn't generate — try again");}
    setAiLoading(false);
  };

  const saveSundayReview = async() => {
    if(!sundayForm.stars){toast_("Pick a star rating first");return;}
    setSundaySubmitting(true);
    const completedThisWeek=CURRICULUM.filter(i=>{
      const sessions=(progress[i.id]?.sessions||[]);
      const mon=new Date(getMonday());
      return sessions.some(s=>new Date(s.date)>=mon)&&(progress[i.id]?.percentComplete||0)>=100;
    }).map(i=>i.id);
    let summary=sundayForm.note||"";
    if(sundayForm.note.trim()&&navigator.onLine){
      try{
        const sumPrompt=`Summarize this learner's weekly review in 2-3 sentences for future AI planning. Learner profile: "${profile.slice(0,300)}". Raw review: "${sundayForm.note}" | Hours: ${weekH.toFixed(1)}h | Stars: ${sundayForm.stars}/5 | Completed: ${completedThisWeek.join(",")||"none"}. Only the summary, no preamble.`;
        summary=await callAI(sumPrompt,200);
      }catch(e){summary=sundayForm.note;}
    }
    const entry={weekStart:getMonday(),date:new Date().toLocaleDateString(),
      stars:sundayForm.stars,rawNote:sundayForm.note,summary,
      hoursLogged:weekH,focusIds:[...(focus.courses||[]),...(focus.books||[])],
      completedCount:completedThisWeek.length};
    setReviews(prev=>[entry,...prev.filter(r=>r.weekStart!==getMonday())].slice(0,MAX_REVIEWS));
    updateWeeklyHours(weekH);
    save(SK_SUNDAY_DONE,getTodayISO());
    setShowSundayReview(false);setSundayForm({stars:0,note:""});setSundaySubmitting(false);
    toast_("Week reviewed and summarized");
  };

  const markItemComplete = async(item) => {
    const p=getP(item.id);
    const tot=item.hours||1;
    const contentRemaining=Math.max(0,tot-(p.courseHoursComplete||0));
    const today=new Date().toLocaleDateString();
    if(contentRemaining>0){
      const realH=contentToReal(item,contentRemaining,settings);
      setProgress(prev=>({...prev,[item.id]:{
        hoursSpent:(prev[item.id]?.hoursSpent||0)+realH,
        courseHoursComplete:tot,percentComplete:100,
        sessions:[...(prev[item.id]?.sessions||[]),
          {date:today,studyHours:parseFloat(realH.toFixed(2)),courseHours:parseFloat(contentRemaining.toFixed(2)),note:"Marked complete"}]
      }}));
    } else {
      setProgress(prev=>({...prev,[item.id]:{...prev[item.id],percentComplete:100}}));
    }
    // Remove from focus if it was there
    setFocus(f=>({
      ...f,
      courses:(f.courses||[]).filter(id=>id!==item.id),
      books:(f.books||[]).filter(id=>id!==item.id),
    }));
    setMarkCompleteConfirm(null);toast_(`${item.name} complete`);
  };

  const runBonusSuggestions = async() => {
    if(!navigator.onLine){toast_("Offline");return;}
    setBonusLoading(true);
    const{touchedAndFocus,nextCore,courseIndex,bookIndex}=buildAIContext();
    const prompt=`Learner hit their ${WEEKLY_TARGET}h weekly target. Suggest 1-2 bonus sessions for ONE extra study day. JSON only — no commentary.
PROFILE: ${profile}
JOURNEY: Week ~${weekNum}. ARC: ${arcPosition}
HOUR RULES: Courses:1h content=${settings.courseRatio}h real, max ${settings.courseMaxSession}h/session. Books:1h=${settings.bookRatio}h real, max ${settings.bookMaxSession}h/session.
FOCUS CAPS: max ${MAX_COURSES} courses + ${MAX_BOOKS} books. Keep 1 Philosophy book. No Optional if Core genre unfinished.
CURRENT FOCUS: ${focusIds.join(",")}
ACTIVE: ${touchedAndFocus||"None."}
NEXT CORE: ${nextCore.slice(0,300)}
COURSE INDEX: ${courseIndex.slice(0,1000)}
BOOK INDEX: ${bookIndex.slice(0,1200)}
Respond ONLY with valid JSON:
{"items":[{"id":"A1","realHours":1.5,"contentHours":0.75}],"note":"one sentence"}`;
    try{
      const raw=await callAI(prompt,600);
      const clean=raw.replace(/```json|```/g,"").trim();
      const jsonMatch=clean.match(/\{[\s\S]*\}/);
      if(!jsonMatch) throw new Error("No JSON found");
      const parsed=JSON.parse(jsonMatch[0]);
      if(!parsed.items||!Array.isArray(parsed.items)) throw new Error("Invalid structure");
      const validItems=parsed.items.filter(it=>CURRICULUM.find(c=>c.id===it.id)&&getP(it.id).percentComplete<100);
      setBonusItems({items:validItems,note:parsed.note||"",generatedAt:new Date().toISOString()});
    }catch(e){console.error("Bonus error:",e);toast_(`Couldn't generate bonus: ${e.message?.slice(0,40)||"unknown"}`);}
    setBonusLoading(false);
  };

  const submitLog = (quickRealH=null,quickContentH=null) => {
    const isQuick=quickRealH!==null;
    if(!isQuick&&!logForm.hours) return;
    if(!isQuick&&!confirmLog){setConfirmLog(true);return;}
    const realH=isQuick?quickRealH:parseFloat(logForm.hours);
    const contentH=isQuick?quickContentH:(logForm.courseHours?parseFloat(logForm.courseHours):realToContent(logging,realH,settings));
    const id=logging.id,tot=logging.hours||1;
    const prevContent=progress[id]?.courseHoursComplete||0;
    const newContent=Math.min(prevContent+contentH,tot);
    const newPct=Math.round((newContent/tot)*100);
    const dateStr=isQuick?new Date().toLocaleDateString():logForm.date;
    setProgress(p=>({...p,[id]:{
      hoursSpent:(p[id]?.hoursSpent||0)+realH,
      courseHoursComplete:newContent,percentComplete:newPct,
      sessions:[...(p[id]?.sessions||[]),
        {date:dateStr,studyHours:realH,courseHours:parseFloat(contentH.toFixed(3)),note:isQuick?"Quick log":logForm.note}]
    }}));
    setLogging(null);
    setLogForm({hours:"",courseHours:"",note:"",date:new Date().toLocaleDateString(),_contentManuallySet:false});
    setConfirmLog(false);
    const mon=new Date(getMonday()),sun=new Date(mon);sun.setDate(mon.getDate()+6);
    const sd=new Date(dateStr);
    toast_(`${realH}h logged · ${logging.name}${sd<mon||sd>sun?" (prev week)":""}`);
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
    setProgress({});setWeek({weekStart:getMonday(),hoursLogged:0});
    setFocus({courses:["A1"],books:["B99","B34"]});setReviews([]);
    setProfile(DEFAULT_PROFILE);setWeekPlan(null);setWeeklyHours([]);
    setBonusItems([]);setOfflineQueue([]);setCustomItems([]);
    setSettings(DEFAULT_SETTINGS);setHiddenIds([]);
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

  const inputSt={width:"100%",background:T.surface0,border:`1px solid ${T.surface3}`,
    borderRadius:10,padding:"11px 13px",color:T.text,fontSize:15,
    boxSizing:"border-box",fontFamily:"inherit",outline:"none",boxShadow:shadow.inset};

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

      {notifOpen&&<NotifInbox
        notifs={notifs} onMarkRead={markRead} onDismiss={dismissNotif}
        onClearAll={clearNotifs} onAction={handleNotifAction}
        onClose={()=>setNotifOpen(false)}
      />}

      <div style={{
        background:T.bg,minHeight:"100dvh",color:T.text,fontFamily:T.fontUI,
        paddingBottom:`calc(env(safe-area-inset-bottom) + 88px)`,
        opacity:splash?0:1,transition:"opacity 0.4s ease 0.1s",
        WebkitFontSmoothing:"antialiased",MozOsxFontSmoothing:"grayscale",
      }}>
        <div style={{height:"env(safe-area-inset-top)",background:T.surface0}}/>

        {toast&&<div style={{
          position:"fixed",top:`calc(env(safe-area-inset-top) + 12px)`,left:"50%",
          transform:"translateX(-50%)",background:T.green,color:"#000",padding:"10px 20px",
          borderRadius:99,fontWeight:700,zIndex:500,fontSize:12,letterSpacing:0.3,
          boxShadow:`0 4px 24px ${T.green}50`,whiteSpace:"nowrap",animation:"toastIn 0.25s ease both"}}>
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
            const clean={
              ...s,
              weeklyTarget:Math.max(5,Math.min(45,parseInt(s.weeklyTarget)||20)),
              courseRatio:[1,1.5,2,2.5,3].includes(parseFloat(s.courseRatio))?parseFloat(s.courseRatio):2,
              bookRatio:[1,1.5,2,2.5,3].includes(parseFloat(s.bookRatio))?parseFloat(s.bookRatio):1,
              courseMaxSession:Math.max(0.5,Math.min(5,Math.round((parseFloat(s.courseMaxSession)||1.5)*2)/2)),
              bookMaxSession:Math.max(0.5,Math.min(5,Math.round((parseFloat(s.bookMaxSession)||2)*2)/2)),
            };
            setSettings(clean);
            toast_("Settings saved");
          }}
        />

        {isSunday()&&load(SK_SUNDAY_DONE,null)!==getTodayISO()&&!showSundayReview&&
          <button onClick={()=>setShowSundayReview(true)} className="btn-press"
            style={{position:"fixed",bottom:`calc(env(safe-area-inset-bottom) + 100px)`,right:16,
              width:44,height:44,borderRadius:"50%",background:`${T.yellow}20`,
              border:`1px solid ${T.yellow}50`,color:T.yellow,fontSize:16,cursor:"pointer",
              zIndex:60,boxShadow:`0 4px 16px ${T.yellow}30`,
              display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.3s ease both"}}>
            ✍
          </button>}

        {(!isOnline||offlineQueue.length>0)&&<div style={{background:isOnline?"#1a1200":"#180808",
          borderBottom:`1px solid ${isOnline?T.yellow:T.red}30`,padding:"8px 16px",
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:10,color:isOnline?T.yellow:T.red,fontWeight:700,letterSpacing:0.5}}>
            {isOnline?`Back online — ${offlineQueue.length} queued`:"Offline — AI features queued"}
          </div>
          {isOnline&&offlineQueue.length>0&&<button onClick={processQueue} className="btn-press"
            style={{background:"none",border:`1px solid ${T.yellow}30`,color:T.yellow,
              borderRadius:7,padding:"3px 10px",fontSize:10,cursor:"pointer",fontWeight:700}}>
            Sync now</button>}
        </div>}

        {exportReminder&&<div style={{background:"#0f0f1a",borderBottom:`1px solid ${T.blue}25`,
          padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",
          animation:"fadeUp 0.25s ease both"}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:T.blue,letterSpacing:0.5}}>Time to back up</div>
            <div style={{fontSize:10,color:T.textDim,marginTop:2}}>2+ weeks since last export</div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setExportReminder(false)} className="btn-press"
              style={{background:"none",border:`1px solid ${T.surface3}`,color:T.textDim,
                borderRadius:7,padding:"4px 10px",fontSize:10,cursor:"pointer"}}>Later</button>
            <button onClick={()=>{doExport();setExportReminder(false);}} className="btn-press"
              style={{background:T.blue,border:"none",color:"#000",borderRadius:7,
                padding:"4px 10px",fontSize:10,fontWeight:800,cursor:"pointer"}}>Export Now</button>
          </div>
        </div>}

        {completionBanner.length>0&&<div style={{background:"#0a150a",borderBottom:`1px solid #1a3a1a`,
          padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",
          animation:"fadeUp 0.25s ease both"}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:T.green,letterSpacing:0.5}}>
              {completionBanner.length} item{completionBanner.length>1?"s":""} completed
            </div>
            <div style={{fontSize:10,color:"#2a5a2a",marginTop:2}}>
              {completionBanner.map(id=>CURRICULUM.find(i=>i.id===id)?.name||id).join(", ")}
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setCompletionBanner([])} className="btn-press"
              style={{background:"none",border:`1px solid #1a3a1a`,color:"#2a5a2a",
                borderRadius:7,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>✕</button>
            <button onClick={()=>{setView("ai");setCompletionBanner([]);}} className="btn-press"
              style={{background:T.green,border:"none",color:"#000",borderRadius:8,padding:"6px 12px",
                fontSize:11,fontWeight:800,cursor:"pointer"}}>Check-In →</button>
          </div>
        </div>}

        {graduationProposal&&<div style={{background:"#0a1220",borderBottom:`1px solid ${T.blue}30`,
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
              style={{background:"none",border:`1px solid ${T.surface3}`,color:T.textDim,
                borderRadius:7,padding:"5px 10px",fontSize:10,cursor:"pointer"}}>Skip</button>
            <button onClick={()=>{
              const key=graduationProposal.next.type==="course"?"courses":"books";
              setFocus(f=>({...f,[key]:[...(f[key]||[]).filter(id=>id!==graduationProposal.completed.id),graduationProposal.next.id],manual:false}));
              setGraduationProposal(null);toast_(`${graduationProposal.next.id} added to focus`);
            }} className="btn-press"
              style={{background:T.blue,border:"none",color:"#000",borderRadius:7,
                padding:"5px 10px",fontSize:10,fontWeight:800,cursor:"pointer"}}>Add to Focus</button>
          </div>
        </div>}

        {missedDayBanner&&<div style={{background:"#1a1200",borderBottom:`1px solid #3a2a00`,
          padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",
          animation:"fadeUp 0.25s ease both"}}>
          <div style={{fontSize:11,fontWeight:700,color:T.yellow,letterSpacing:0.5}}>Missed session yesterday</div>
          <button onClick={()=>setMissedDayBanner(false)} className="btn-press"
            style={{background:"none",border:`1px solid ${T.surface3}`,color:T.textDim,
              borderRadius:7,padding:"5px 10px",fontSize:10,cursor:"pointer"}}>Dismiss</button>
        </div>}

        {/* ── Header ── */}
        <div style={{
          background:T.surface0,
          padding:`calc(env(safe-area-inset-top) + 16px) 16px 12px`,
          borderBottom:`1px solid ${T.border}`,position:"sticky",top:0,zIndex:50,
          boxShadow:"0 4px 24px rgba(0,0,0,0.6)",
        }}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
              <button onClick={()=>setSideOpen(true)} className="btn-press"
                style={{background:"none",border:"none",cursor:"pointer",padding:"6px 4px",
                  display:"flex",flexDirection:"column",gap:5,marginTop:4,flexShrink:0,
                  minWidth:44,minHeight:44,justifyContent:"center",alignItems:"flex-start",
                  position:"relative"}}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{width:22,height:2,background:T.textMid,borderRadius:99}}/>
                ))}
                {unreadCount>0&&<div style={{position:"absolute",top:2,right:2,
                  background:T.blue,color:"#000",borderRadius:"50%",
                  width:14,height:14,fontSize:8,fontWeight:800,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  border:`2px solid ${T.surface0}`}}>{unreadCount>9?"9+":unreadCount}</div>}
              </button>
              <div>
                <div style={{fontSize:9,color:T.textDim,letterSpacing:4,textTransform:"uppercase",marginBottom:4}}>The Preparation</div>
                <div style={{fontSize:22,fontWeight:800,letterSpacing:-0.5}}>Learning Tracker</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              {/* Bell icon for notifications */}
              <button onClick={()=>setNotifOpen(true)} className="btn-press"
                style={{background:"none",border:`1px solid ${unreadCount>0?T.blue+"40":T.surface3}`,
                  color:unreadCount>0?T.blue:T.textDim,borderRadius:10,padding:"8px 10px",
                  fontSize:14,cursor:"pointer",position:"relative",marginTop:4,
                  transition:"all 0.2s",minWidth:44,minHeight:44,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                🔔
                {unreadCount>0&&<div style={{position:"absolute",top:-2,right:-2,
                  background:T.blue,color:"#000",borderRadius:"50%",
                  width:14,height:14,fontSize:8,fontWeight:800,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  border:`2px solid ${T.surface0}`}}>{unreadCount>9?"9+":unreadCount}</div>}
              </button>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:20,fontWeight:900,letterSpacing:-0.5,
                  color:weekH>=WEEKLY_TARGET?T.green:T.text,
                  textShadow:weekH>=WEEKLY_TARGET?shadow.glow(T.green):"none",
                  transition:"color 0.4s ease"}}>
                  {weekH.toFixed(1)}<span style={{fontSize:11,color:T.textDim,fontWeight:400}}>/{WEEKLY_TARGET}h</span>
                </div>
                <div style={{fontSize:9,color:T.textDim,marginTop:1}}>{getDayName()} · {dLeft}d left</div>
              </div>
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
              style={{background:"none",border:`1px solid ${editFocus?T.blue+"40":T.surface3}`,
                color:editFocus?T.blue:T.textDim,borderRadius:8,padding:"5px 12px",fontSize:11,
                cursor:"pointer",letterSpacing:0.3,flexShrink:0,transition:"all 0.2s"}}>
              {editFocus?"Done":"Edit Focus"}
            </button>
          </div>
        </div>

        {editFocus&&<div style={{background:T.surface0,padding:"14px 16px",borderBottom:`1px solid ${T.border}`,
          animation:"fadeUp 0.2s ease both"}}>
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
                    style={{background:on?`${c}15`:T.surface2,border:`1px solid ${on?c+"40":T.surface3}`,
                      color:on?c:T.textDim,borderRadius:20,padding:"8px 14px",fontSize:11,
                      cursor:"pointer",fontWeight:on?700:400,transition:"all 0.18s",minHeight:36}}>
                    {i.id}{i.custom?" *":""}
                  </button>;
                })}
              </div>
            </div>
          ))}
        </div>}

        <div style={{padding:"16px 14px"}}>

          {/* ══ TODAY ══ */}
          {view==="today"&&<div className="tab-content">

            {/* No plan state */}
            {!planIsFromThisWeek&&<Card style={{padding:"24px 20px",textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:28,marginBottom:12}}>📋</div>
              <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>No plan for this week yet</div>
              <div style={{fontSize:12,color:T.textDim,marginBottom:20,lineHeight:1.6}}>
                Head to Check-In to generate your week plan. The Today tab will show your sessions once a plan exists.
              </div>
              <button onClick={()=>setView("ai")} className="btn-press"
                style={{background:"#0a1220",border:`1px solid ${T.blue}30`,color:T.blue,
                  borderRadius:10,padding:"12px 24px",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                Plan My Week →
              </button>
            </Card>}

            {planIsFromThisWeek&&<>
              {todayPlannedH>0&&<Card style={{padding:"12px 14px",marginBottom:14,border:`1px solid ${T.surface3}`}}>
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
                  style={{marginBottom:10,padding:16,opacity:isComplete?0.6:1,
                    animation:`fadeUp 0.2s ease ${idx*0.07}s both`,transition:"opacity 0.3s"}}>
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
                  <div style={{background:T.surface0,borderRadius:10,padding:"10px 12px",marginBottom:12,border:`1px solid ${T.surface3}`}}>
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
                      style={{width:"100%",background:T.surface2,border:`1px solid ${T.surface3}`,
                        color:T.blue,borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                      {sessionDoneToday?"+ Log Another Session":"+ Log Session"}
                    </button>
                  </div>}
                  {!isComplete&&<button onClick={()=>setMarkCompleteConfirm(item)} className="btn-press"
                    style={{width:"100%",background:"none",border:`1px solid ${T.green}20`,
                      color:T.green,borderRadius:10,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    Mark Complete
                  </button>}
                </Card>;
              })}

              {weekH>=WEEKLY_TARGET&&<Card style={{padding:"13px 14px",marginBottom:10,border:`1px solid ${T.green}15`,
                animation:"fadeUp 0.2s ease both"}}>
                <div style={{fontSize:9,color:T.green,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:6}}>Bonus Mode</div>
                <div style={{fontSize:11,color:T.textDim,marginBottom:12,lineHeight:1.5}}>
                  {weekH.toFixed(2)}h logged — target hit.
                </div>
                {bonusItems?.items?.length>0&&<div>
                  {bonusItems.note&&<div style={{fontSize:11,color:T.textMid,marginBottom:10,fontStyle:"italic"}}>{bonusItems.note}</div>}
                  {bonusItems.items.map(it=>{
                    const item=CURRICULUM.find(i=>i.id===it.id);if(!item) return null;
                    const c=gc(item.genre);
                    return <div key={it.id} style={{background:T.surface0,borderRadius:10,
                      padding:"10px 12px",marginBottom:8,borderLeft:`2px solid ${c}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                        <div style={{fontSize:12,fontWeight:600,flex:1,paddingRight:8}}>{item.name}</div>
                        <div style={{fontSize:13,fontWeight:800,color:T.blue,flexShrink:0}}>{it.realHours}h</div>
                      </div>
                      <button onClick={()=>setLogging(item)} className="btn-press"
                        style={{width:"100%",background:T.surface2,border:`1px solid ${T.surface3}`,
                          color:T.blue,borderRadius:8,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                        + Log Bonus Session</button>
                    </div>;
                  })}
                  <button onClick={()=>setBonusItems(null)} className="btn-press"
                    style={{background:"none",border:"none",color:T.textDim,fontSize:10,cursor:"pointer",marginTop:4}}>
                    Clear suggestions</button>
                </div>}
                {(!bonusItems?.items?.length)&&<button onClick={runBonusSuggestions} disabled={bonusLoading} className="btn-press"
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.green}20`,
                    color:bonusLoading?T.textDim:T.green,borderRadius:10,padding:"10px 0",
                    fontSize:12,fontWeight:700,cursor:"pointer",transition:"color 0.2s"}}>
                  {bonusLoading?"Thinking…":"Suggest Bonus Sessions"}
                </button>}
              </Card>}
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
              padding:"13px 14px",marginBottom:12,border:`1px solid ${T.green}20`}}>
              <div style={{fontSize:9,color:T.green,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:8}}>Bonus Day</div>
              {bonusItems.note&&<div style={{fontSize:11,color:T.textMid,marginBottom:10,fontStyle:"italic"}}>{bonusItems.note}</div>}
              {bonusItems.items.map(it=>{
                const item=CURRICULUM.find(i=>i.id===it.id);if(!item) return null;
                const c=gc(item.genre);
                return <div key={it.id} style={{background:T.surface0,borderRadius:10,
                  padding:"8px 12px",marginBottom:6,borderLeft:`2px solid ${c}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:12,fontWeight:600,flex:1,paddingRight:8}}>{item.name}</div>
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
                const isToday=day.day===getDayName();
                const dayIdx=ALL_DAYS.indexOf(day.day);
                const todayIdx=getDayIdx();
                const isPast=dayIdx<todayIdx,isFuture=dayIdx>todayIdx;
                if(weekH>=WEEKLY_TARGET&&isFuture) return null;
                const dayActualH=parseFloat((day.items||[]).reduce((s,it)=>s+(it.realHours||0),0).toFixed(2));
                const dayDate=new Date(getMonday()+"T12:00:00");
                dayDate.setDate(dayDate.getDate()+dayIdx);
                const dayStr=dayDate.toLocaleDateString();
                const dayLoggedH=parseFloat(CURRICULUM.reduce((s,i)=>
                  s+(getP(i.id).sessions||[]).filter(sess=>sess.date===dayStr)
                    .reduce((ss,x)=>ss+(x.studyHours||0),0),0).toFixed(2));
                const hitRate=dayActualH>0?dayLoggedH/dayActualH:0;
                return <div key={day.day} style={{marginBottom:14,opacity:isPast&&!isToday?0.45:1,transition:"opacity 0.3s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontSize:11,fontWeight:800,color:isToday?T.blue:isPast?T.textMid:T.text}}>
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
                    return <div key={it.id} style={{background:T.surface0,borderRadius:10,
                      padding:"8px 12px",marginBottom:5,
                      borderLeft:`2px solid ${isComplete?T.green:wasLogged&&!isComplete?T.yellow:c}`,
                      opacity:isComplete?0.5:1,transition:"opacity 0.3s, border-color 0.3s"}}>
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
                animation:`fadeUp 0.18s ease ${idx*0.06}s both`}}>
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
                      style={{background:T.surface2,border:`1px solid ${T.surface3}`,color:T.blue,
                        borderRadius:8,padding:"10px 16px",fontSize:12,cursor:"pointer",fontWeight:700,minHeight:44}}>Log</button>
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
              style={{width:"100%",background:`${T.yellow}10`,border:`1px solid ${T.yellow}30`,
                color:T.yellow,borderRadius:10,padding:13,fontSize:13,fontWeight:800,
                cursor:"pointer",marginBottom:12,letterSpacing:0.3}}>
              Write This Week's Review
            </button>}

            {planIsFromThisWeek&&<div style={{background:T.surface1,borderRadius:12,padding:"10px 14px",
              marginBottom:12,border:`1px solid ${T.green}20`,animation:"fadeUp 0.2s ease both",
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
                style={{...inputSt,fontSize:12,resize:"none",height:56,lineHeight:1.5,padding:"10px 12px"}}/>
              <div style={{fontSize:10,color:T.textDim,marginTop:5,lineHeight:1.5}}>
                Tip: For books, try "philosophy books", "investing books", "roman history books" etc. The AI searches by genre and title.
              </div>
            </div>

            <button onClick={()=>runPlanWeek(false)} disabled={aiLoading} className="btn-press"
              style={{width:"100%",background:aiLoading?T.surface1:T.surface2,
                border:`1px solid ${aiLoading?T.surface3:T.blue+"40"}`,
                color:aiLoading?T.textDim:T.blue,borderRadius:10,padding:13,fontSize:14,
                fontWeight:800,cursor:aiLoading?"default":"pointer",marginBottom:12,
                letterSpacing:0.3,transition:"all 0.2s"}}>
              {aiLoading?"Thinking…":planIsFromThisWeek?"Replan Week":"Plan Week"}
            </button>

            <div style={{marginBottom:16}}/>

            {aiResult&&<div style={{animation:"fadeUp 0.2s ease both"}}>
              {[["assessment",T.blue,"Assessment"],["insight",T.pink,"Insight"],["nextMilestone",T.green,"Next Milestone"]]
                .map(([k,c,label])=>aiResult[k]&&<Card key={k} accent={c} style={{padding:"13px 14px",marginBottom:10}}>
                  <div style={{fontSize:9,color:c,textTransform:"uppercase",letterSpacing:1.5,marginBottom:7,fontWeight:700}}>{label}</div>
                  <div style={{fontSize:13,color:"#bbb",lineHeight:1.65}}>{aiResult[k]}</div>
                </Card>)}
              {aiResult.focusProposal&&<Card style={{padding:"13px 14px",marginBottom:10,border:`1px solid ${T.pink}20`}}>
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
                        padding:"7px 0",borderBottom:`1px solid ${T.surface2}`}}>
                        <div style={{width:5,height:5,borderRadius:"50%",flexShrink:0,background:current?T.surface3:T.green}}/>
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
                    style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                      color:T.textMid,borderRadius:10,padding:12,fontSize:13,cursor:"pointer"}}>Keep Current</button>
                  <button onClick={()=>applyFocusProposal(aiResult.focusProposal)} className="btn-press"
                    style={{flex:2,background:"#0a180a",border:`1px solid ${T.green}30`,color:T.green,
                      borderRadius:10,padding:12,fontSize:13,fontWeight:800,cursor:"pointer"}}>
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
                  <div key={l} style={{background:T.surface0,borderRadius:12,padding:"12px 14px",
                    border:`1px solid ${T.border}`,animation:`fadeUp 0.18s ease ${i*0.05}s both`}}>
                    <div style={{fontSize:24,fontWeight:900,color:c,letterSpacing:-1}}>{v}</div>
                    <div style={{fontSize:10,color:T.textDim,marginTop:2,letterSpacing:0.3}}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{background:T.surface0,borderRadius:12,padding:"12px 14px",marginBottom:12,border:`1px solid ${T.border}`}}>
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
              <div style={{background:T.surface0,borderRadius:12,padding:"12px 14px",marginBottom:12,border:`1px solid ${T.border}`}}>
                <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:700}}>12-Week Hours</div>
                <div style={{display:"flex",alignItems:"flex-end",gap:3,height:56}}>
                  {chartWeeks.map((w,i)=>{
                    const pct=w.h/chartMax,isTarget=w.h>=WEEKLY_TARGET,isCurrent=i===11;
                    return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                      <div style={{width:"100%",background:isTarget?T.green:isCurrent?T.blue:T.surface3,
                        height:`${Math.max(pct*44,w.h>0?4:1)}px`,borderRadius:"3px 3px 0 0",
                        transition:"height 0.5s ease, background 0.3s"}}/>
                      <div style={{fontSize:7,color:isCurrent?T.blue:T.textFaint}}>{w.label.slice(3)}</div>
                    </div>;
                  })}
                </div>
              </div>
              {genreBalance.length>0&&<div style={{background:T.surface0,borderRadius:12,padding:"12px 14px",marginBottom:12,border:`1px solid ${T.border}`}}>
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
              <div style={{background:T.surface0,borderRadius:12,padding:"12px 14px",marginBottom:12,border:`1px solid ${T.border}`}}>
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
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginTop:5,paddingBottom:10,borderBottom:`1px solid ${T.surface3}`}}>
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
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:6,paddingTop:10,borderTop:`1px solid ${T.surface2}`}}>
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
        {showSundayReview&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",
          display:"flex",alignItems:"flex-end",zIndex:150,backdropFilter:"blur(4px)",
          animation:"fadeIn 0.2s ease both"}}>
          <div style={{
            background:T.surface1,borderRadius:"18px 18px 0 0",
            padding:`24px 24px calc(env(safe-area-inset-bottom) + 24px)`,
            width:"100%",boxSizing:"border-box",
            borderTop:`3px solid ${T.yellow}`,boxShadow:shadow.raised,
            animation:"slideInUp 0.3s cubic-bezier(0.4,0,0.2,1) both",
          }}>
            <div style={{fontSize:17,fontWeight:800,letterSpacing:-0.3,marginBottom:4}}>Week Review</div>
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
                style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                  color:T.textMid,borderRadius:10,padding:12,fontSize:13,cursor:"pointer"}}>Later</button>
              <button onClick={saveSundayReview} disabled={sundaySubmitting} className="btn-press"
                style={{flex:2,background:"#1a1200",border:`1px solid ${T.yellow}30`,
                  color:sundaySubmitting?T.textDim:T.yellow,
                  borderRadius:10,padding:12,fontSize:13,fontWeight:800,cursor:"pointer"}}>
                {sundaySubmitting?"Summarizing…":"Save & Summarize"}</button>
            </div>
          </div>
        </div>}

        {/* ══ MARK COMPLETE ══ */}
        {markCompleteConfirm&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",
          display:"flex",alignItems:"flex-end",zIndex:100,backdropFilter:"blur(4px)",
          animation:"fadeIn 0.2s ease both"}}>
          <div style={{
            background:T.surface1,borderRadius:"18px 18px 0 0",
            padding:`24px 24px calc(env(safe-area-inset-bottom) + 24px)`,
            width:"100%",boxSizing:"border-box",
            borderTop:`3px solid ${T.green}`,boxShadow:shadow.raised,
            animation:"slideInUp 0.3s cubic-bezier(0.4,0,0.2,1) both",
          }}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:6}}>Mark Complete?</div>
            <div style={{fontSize:12,color:T.textMid,marginBottom:6}}>{markCompleteConfirm.name}</div>
            <div style={{fontSize:11,color:T.textDim,marginBottom:20,lineHeight:1.5}}>
              Logs remaining hours, marks 100%, and removes from focus.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setMarkCompleteConfirm(null)} className="btn-press"
                style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                  color:T.textMid,borderRadius:10,padding:12,fontSize:13,cursor:"pointer"}}>Cancel</button>
              <button onClick={()=>markItemComplete(markCompleteConfirm)} className="btn-press"
                style={{flex:2,background:"#0a180a",border:`1px solid ${T.green}30`,color:T.green,
                  borderRadius:10,padding:12,fontSize:13,fontWeight:800,cursor:"pointer"}}>
                Mark Complete</button>
            </div>
          </div>
        </div>}

        {/* ══ EDIT SESSION ══ */}
        {editSession&&(()=>{
          const{itemId,sessionIdx}=editSession;
          const item=CURRICULUM.find(i=>i.id===itemId);
          return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",
            display:"flex",alignItems:"flex-end",zIndex:100,backdropFilter:"blur(4px)",
            animation:"fadeIn 0.2s ease both"}}>
            <div style={{
              background:T.surface1,borderRadius:"18px 18px 0 0",
              padding:`24px 24px calc(env(safe-area-inset-bottom) + 24px)`,
              width:"100%",boxSizing:"border-box",
              borderTop:`3px solid ${T.blue}`,boxShadow:shadow.raised,
              animation:"slideInUp 0.3s cubic-bezier(0.4,0,0.2,1) both",
            }}>
              <div style={{fontSize:16,fontWeight:800,marginBottom:3}}>Edit Session</div>
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
                  style={{flex:1,background:"#180a0a",border:`1px solid ${T.red}30`,color:T.red,
                    borderRadius:10,padding:12,fontSize:13,fontWeight:700,cursor:"pointer"}}>Delete</button>
                <button onClick={()=>setEditSession(null)} className="btn-press"
                  style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                    color:T.textMid,borderRadius:10,padding:12,fontSize:13,cursor:"pointer"}}>Cancel</button>
                <button onClick={saveEditSession} className="btn-press"
                  style={{flex:2,background:"#0a1220",border:`1px solid ${T.blue}30`,color:T.blue,
                    borderRadius:10,padding:12,fontSize:13,fontWeight:800,cursor:"pointer"}}>Save</button>
              </div>
            </div>
          </div>;
        })()}

        {/* ══ LOG MODAL ══ */}
        {logging&&(()=>{
          const p=getP(logging.id);
          const contentDone=p.courseHoursComplete||0;
          const contentLeft=Math.max(0,(logging.hours||0)-contentDone);
          const realH=parseFloat(logForm.hours||0);
          const previewPct=realH>0?targetPctAfterSession(logging,p,realH,settings):null;
          return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",
            display:"flex",alignItems:"flex-end",zIndex:100,backdropFilter:"blur(4px)",
            animation:"fadeIn 0.2s ease both"}}>
            <div style={{
              background:T.surface1,borderRadius:"18px 18px 0 0",
              padding:`24px 24px calc(env(safe-area-inset-bottom) + 24px)`,
              width:"100%",boxSizing:"border-box",
              borderTop:`3px solid ${gc(logging.genre)}`,boxShadow:shadow.raised,
              animation:"slideInUp 0.3s cubic-bezier(0.4,0,0.2,1) both",
              maxHeight:"92dvh",overflowY:"auto",WebkitOverflowScrolling:"touch",
            }}>
              <div style={{fontSize:16,fontWeight:800,marginBottom:3}}>{logging.name}</div>
              <div style={{fontSize:11,color:T.textDim,marginBottom:4}}>
                {logging.id} · {logging.type==="course"?`Course (1h content = ${settings.courseRatio}h real)`:"Book (1:1 ratio)"}
              </div>
              <div style={{fontSize:11,color:T.textDim,marginBottom:12}}>
                {contentDone.toFixed(2)}h / {logging.hours}h · {p.percentComplete}% · {contentLeft.toFixed(2)}h content left
              </div>
              {!confirmLog&&<div style={{marginBottom:16}}>
                <div style={{fontSize:10,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>Quick Log</div>
                <div style={{display:"flex",gap:6}}>
                  {[0.5,1,1.5,2].filter(h=>h<=maxRealPerSession(logging,settings)).map(h=>(
                    <button key={h} onClick={()=>submitLog(h,realToContent(logging,h,settings))} className="btn-press"
                      style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                        color:T.blue,borderRadius:10,padding:"12px 0",
                        fontSize:13,fontWeight:700,cursor:"pointer"}}>
                      {h}h</button>
                  ))}
                </div>
              </div>}
              {confirmLog?(
                <div style={{animation:"fadeUp 0.18s ease both"}}>
                  <div style={{background:T.surface0,borderRadius:12,padding:14,marginBottom:16,border:`1px solid ${T.surface3}`}}>
                    <div style={{fontSize:11,color:T.textDim,marginBottom:6}}>Confirm session</div>
                    <div style={{fontSize:15,fontWeight:700}}>
                      {logForm.hours}h real
                      <span style={{color:T.blue}}> · {parseFloat(realToContent(logging,parseFloat(logForm.hours||0),settings).toFixed(3))}h content</span>
                    </div>
                    {previewPct&&<div style={{fontSize:12,color:gc(logging.genre),marginTop:5,fontWeight:600}}>
                      {p.percentComplete}% → {previewPct}%
                    </div>}
                    {logForm.note&&<div style={{fontSize:11,color:T.textMid,marginTop:5}}>{logForm.note}</div>}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setConfirmLog(false)} className="btn-press"
                      style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                        color:T.textMid,borderRadius:10,padding:12,fontSize:14,cursor:"pointer"}}>Edit</button>
                    <button onClick={()=>submitLog()} className="btn-press"
                      style={{flex:2,background:"#0a1220",border:`1px solid ${T.blue}30`,color:T.blue,
                        borderRadius:10,padding:12,fontSize:14,fontWeight:800,cursor:"pointer"}}>Confirm</button>
                  </div>
                </div>
              ):(
                <div>
                  <div style={{marginBottom:14}}>
                    <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>Session date</label>
                    <input type="date"
                      value={logForm.date?new Date(logForm.date).toLocaleDateString('en-CA'):new Date().toLocaleDateString('en-CA')}
                      max={new Date().toLocaleDateString('en-CA')}
                      onChange={e=>{const d=new Date(e.target.value+"T12:00:00");setLogForm(f=>({...f,date:d.toLocaleDateString()}));}}
                      style={{...inputSt,fontSize:14,colorScheme:"dark"}}/>
                    {(()=>{
                      const sd=new Date(logForm.date),mon=new Date(getMonday());
                      const sun=new Date(mon);sun.setDate(mon.getDate()+6);
                      return sd<mon||sd>sun?<div style={{fontSize:11,color:T.yellow,marginTop:5}}>
                        Previous week — won't count toward this week's {WEEKLY_TARGET}h
                      </div>:null;
                    })()}
                  </div>
                  <div style={{marginBottom:14}}>
                    <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>
                      Real study hours (max {maxRealPerSession(logging,settings)}h/session)
                    </label>
                    <input type="number" min="0.25" max={maxRealPerSession(logging,settings)} step="0.25"
                      value={logForm.hours}
                      onChange={e=>{
                        const rh=e.target.value;
                        setLogForm(f=>({...f,hours:rh,
                          courseHours:f._contentManuallySet?f.courseHours
                            :rh?parseFloat(realToContent(logging,parseFloat(rh),settings).toFixed(3)).toString():""}));
                      }}
                      style={inputSt} placeholder={logging.type==="course"?`e.g. ${settings.courseMaxSession}`:"e.g. 1.0"}/>
                    {realH>0&&<div style={{fontSize:11,color:T.blue,marginTop:5}}>
                      = {realToContent(logging,realH,settings).toFixed(3)}h content
                      {previewPct?` → ${p.percentComplete}% → ${previewPct}%`:""}
                    </div>}
                  </div>
                  {logging.type==="course"&&<div style={{marginBottom:14}}>
                    <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>
                      Content hours <span style={{color:T.textDim,fontWeight:400}}>— adjust if ratio wasn't 1:{settings.courseRatio}</span>
                    </label>
                    <input type="number" min="0.1" max={logging.hours} step="0.05"
                      value={logForm.courseHours}
                      onChange={e=>setLogForm(f=>({...f,courseHours:e.target.value,_contentManuallySet:true}))}
                      onFocus={()=>{
                        if(!logForm.courseHours&&logForm.hours)
                          setLogForm(f=>({...f,courseHours:parseFloat(realToContent(logging,parseFloat(logForm.hours),settings).toFixed(3)).toString(),_contentManuallySet:false}));
                      }}
                      style={{...inputSt,border:`1px solid ${logForm._contentManuallySet?T.yellow+"60":T.surface3}`}}
                      placeholder={realH>0?`Standard: ${realToContent(logging,realH,settings).toFixed(3)}h`:"Enter real hours first"}/>
                    {logForm._contentManuallySet&&logForm.courseHours&&logForm.hours&&<div style={{fontSize:11,color:T.yellow,marginTop:5}}>
                      Custom ratio — {logForm.hours}h real → {logForm.courseHours}h content
                      {(()=>{const ch=parseFloat(logForm.courseHours),tot=logging.hours||1;
                        return ` → ${p.percentComplete}% → ${Math.round((Math.min((p.courseHoursComplete||0)+ch,tot)/tot)*100)}%`;})()}
                    </div>}
                  </div>}
                  <div style={{marginBottom:20}}>
                    <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>Note (optional)</label>
                    <input value={logForm.note} onChange={e=>setLogForm(f=>({...f,note:e.target.value}))}
                      style={inputSt} placeholder="What did you cover?"/>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{setLogging(null);setLogForm({hours:"",courseHours:"",note:"",date:new Date().toLocaleDateString(),_contentManuallySet:false});setConfirmLog(false);}} className="btn-press"
                      style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                        color:T.textMid,borderRadius:10,padding:12,fontSize:14,cursor:"pointer"}}>Cancel</button>
                    <button onClick={()=>submitLog()} className="btn-press"
                      style={{flex:2,background:"#0a1220",border:`1px solid ${T.blue}30`,color:T.blue,
                        borderRadius:10,padding:12,fontSize:14,fontWeight:800,cursor:"pointer"}}>Review</button>
                  </div>
                </div>
              )}
            </div>
          </div>;
        })()}
      </div>

      {/* ── Bottom Navigation ── */}
      <div style={{
        position:"fixed",bottom:0,left:0,right:0,zIndex:50,
        background:T.surface0,borderTop:`1px solid ${T.border}`,
        boxShadow:"0 -4px 24px rgba(0,0,0,0.5)",
        display:"flex",paddingBottom:"env(safe-area-inset-bottom)",
      }}>
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
              alignItems:"center",gap:4,color:view===k?T.blue:T.textDim,
              transition:"color 0.2s",minHeight:56,position:"relative",
            }}>
            {view===k&&<div style={{
              position:"absolute",top:0,left:"20%",right:"20%",
              height:2,background:T.blue,borderRadius:"0 0 3px 3px",
            }}/>}
            <span style={{fontSize:18,lineHeight:1,opacity:view===k?1:0.6}}>{icon}</span>
            <span style={{
              fontSize:10,fontWeight:view===k?800:500,
              letterSpacing:0.8,textTransform:"uppercase",
            }}>{label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

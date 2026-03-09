import { useState, useEffect, useRef, useCallback } from "react";

const WEEKLY_TARGET = 20;

const snap25 = h => Math.round(h * 4) / 4;
const contentToReal = (item, contentH) => item.type === "course" ? contentH * 2 : contentH;
const realToContent = (item, realH) => item.type === "course" ? realH / 2 : realH;
const maxRealPerSession = (item) => item.type === "course" ? 1.5 : 2.0;
const realHoursRemaining = (item, p) => {
  const contentLeft = Math.max(0, (item.hours || 0) - (p.courseHoursComplete || 0));
  return contentToReal(item, contentLeft);
};
const targetPctAfterSession = (item, p, sessionRealH) => {
  const contentDone = p.courseHoursComplete || 0;
  const contentGain = realToContent(item, sessionRealH);
  const newContent = Math.min(contentDone + contentGain, item.hours || 1);
  return Math.floor((newContent / (item.hours || 1)) * 100);
};

// Distribute totalH across n days as evenly as possible in 0.25h increments
const distributeDays = (totalH, dayNames) => {
  const n = dayNames.length;
  if (n === 0) return [];
  const base = snap25(totalH / n);
  const budgets = Array(n).fill(base);
  // Fix rounding drift by adding remainder to last day
  const sum = parseFloat(budgets.reduce((s, h) => s + h, 0).toFixed(2));
  const diff = parseFloat((totalH - sum).toFixed(2));
  if (Math.abs(diff) >= 0.25) budgets[n - 1] = snap25(budgets[n - 1] + diff);
  return budgets;
};

// Scale items within a day to exactly hit dayBudget, then true-up last item
const scaleDayItems = (items, dayBudget, getCurrItem, getP) => {
  if (!items.length) return items;
  const rawSum = parseFloat(items.reduce((s, it) => s + (it.realHours || 0), 0).toFixed(2));
  const scale = rawSum > 0 ? dayBudget / rawSum : 1;
  let scaled = items.map(it => {
    const r = snap25(it.realHours * scale);
    const ci = getCurrItem(it.id);
    const ch = ci ? parseFloat(realToContent(ci, r).toFixed(3)) : r;
    const tgt = ci ? targetPctAfterSession(ci, getP(it.id), r) : it.targetPct;
    return { ...it, realHours: r, contentHours: ch, targetPct: tgt };
  });
  // True-up: adjust last item for any rounding gap
  const snappedSum = parseFloat(scaled.reduce((s, it) => s + (it.realHours || 0), 0).toFixed(2));
  const gap = parseFloat((dayBudget - snappedSum).toFixed(2));
  if (Math.abs(gap) >= 0.05) {
    const last = scaled[scaled.length - 1];
    const adj = Math.max(0.25, snap25(last.realHours + gap));
    const ci = getCurrItem(last.id);
    const ch = ci ? parseFloat(realToContent(ci, adj).toFixed(3)) : adj;
    const tgt = ci ? targetPctAfterSession(ci, getP(last.id), adj) : last.targetPct;
    scaled[scaled.length - 1] = { ...last, realHours: adj, contentHours: ch, targetPct: tgt };
  }
  return scaled;
};

const CURRICULUM = [
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
{id:"A93",name:"Big History",hours:24,type:"course",section:"Optional",genre:"History"},
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
{id:"A107",name:"Food: A Cultural History",hours:12,type:"course",section:"Optional",genre:"History"},
{id:"A108",name:"The Everyday Gourmet",hours:12,type:"course",section:"Optional",genre:"Chef"},
{id:"A109",name:"Introduction to Jungian Psychology",hours:7,type:"course",section:"Optional",genre:"Psychology"},
{id:"A110",name:"Personality and its Transformations",hours:72,type:"course",section:"Optional",genre:"Psychology"},
{id:"A111",name:"Greece and Rome: Integrated History",hours:1,type:"course",section:"Optional",genre:"History"},
{id:"A112",name:"How the Medici Shaped the Renaissance",hours:6,type:"course",section:"Optional",genre:"History"},
{id:"A113",name:"Western Civilization II",hours:24,type:"course",section:"Optional",genre:"World History"},
{id:"A114",name:"Hannibal: Military Genius",hours:7,type:"course",section:"Optional",genre:"History"},
{id:"A115",name:"The Decisive Battles of World History",hours:13,type:"course",section:"Optional",genre:"History"},
{id:"A116",name:"Alexander the Great",hours:13,type:"course",section:"Optional",genre:"History"},
{id:"A117",name:"Turning Points in Modern History",hours:12,type:"course",section:"Optional",genre:"History"},
{id:"A118",name:"The Real History of Pirates",hours:12,type:"course",section:"Optional",genre:"History"},
{id:"A119",name:"History's Greatest Voyages",hours:12,type:"course",section:"Optional",genre:"History"},
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
{id:"B1",name:"Discovering the German New Medicine",hours:10,type:"book",section:"Core",genre:"Medic"},
{id:"B2",name:"Caveman Chemistry",hours:50,type:"book",section:"Core",genre:"Medic"},
{id:"B3",name:"Stick and Rudder",hours:15,type:"book",section:"Core",genre:"Pilot"},
{id:"B4",name:"Mental Math for Pilots",hours:5,type:"book",section:"Core",genre:"Pilot"},
{id:"B5",name:"Blood and Thunder",hours:15,type:"book",section:"Core",genre:"Cowboy"},
{id:"B6",name:"Education of a Wandering Man",hours:5,type:"book",section:"Core",genre:"Cowboy"},
{id:"B7",name:"Empire of the Summer Moon",hours:14,type:"book",section:"Core",genre:"Cowboy"},
{id:"B8",name:"The Sackett Series",hours:44,type:"book",section:"Core",genre:"Cowboy"},
{id:"B9",name:"Virtue of Selfishness",hours:4,type:"book",section:"Core",genre:"Builder"},
{id:"B10",name:"Modern Man in Search of a Soul",hours:9,type:"book",section:"Core",genre:"Builder"},
{id:"B11",name:"The Iliad",hours:9,type:"book",section:"Core",genre:"Builder"},
{id:"B12",name:"Only Yesterday",hours:10,type:"book",section:"Core",genre:"Builder"},
{id:"B13",name:"The Law",hours:2,type:"book",section:"Core",genre:"Builder"},
{id:"B14",name:"Greek Art",hours:7,type:"book",section:"Core",genre:"Chef"},
{id:"B15",name:"Roman Art",hours:6,type:"book",section:"Core",genre:"Chef"},
{id:"B16",name:"The Republic",hours:3,type:"book",section:"Core",genre:"Fighter"},
{id:"B17",name:"Gorgias",hours:2,type:"book",section:"Core",genre:"Fighter"},
{id:"B18",name:"Trial and Death of Socrates",hours:3,type:"book",section:"Core",genre:"Fighter"},
{id:"B19",name:"Way of the Superior Man",hours:5,type:"book",section:"Core",genre:"All"},
{id:"B20",name:"The Count of Monte Cristo",hours:30,type:"book",section:"Core",genre:"Heavy Equipment"},
{id:"B21",name:"Adventures of Huckleberry Finn",hours:9,type:"book",section:"Core",genre:"Heavy Equipment"},
{id:"B22",name:"Underland: A Deep Time Journey",hours:14,type:"book",section:"Core",genre:"Heavy Equipment"},
{id:"B23",name:"Poke The Box",hours:2,type:"book",section:"Core",genre:"Work"},
{id:"B24",name:"Atlas Shrugged",hours:29,type:"book",section:"Core",genre:"Work"},
{id:"B25",name:"On Writing",hours:6,type:"book",section:"Core",genre:"Work"},
{id:"B26",name:"The Creature from Jekyll Island",hours:10,type:"book",section:"Core",genre:"Work"},
{id:"B27",name:"Consider This",hours:8,type:"book",section:"Core",genre:"Work"},
{id:"B28",name:"The Elements of Style",hours:2,type:"book",section:"Core",genre:"Work"},
{id:"B29",name:"Thank You for Arguing",hours:6,type:"book",section:"Core",genre:"Work"},
{id:"B30",name:"Zen and the Art of Motorcycle Maintenance",hours:12,type:"book",section:"Core",genre:"Welder"},
{id:"B31",name:"The True Believer",hours:4,type:"book",section:"Core",genre:"Welder"},
{id:"B32",name:"Gulliver's Travels",hours:6,type:"book",section:"Core",genre:"Welder"},
{id:"B33",name:"The Prize",hours:23,type:"book",section:"Core",genre:"Welder"},
{id:"B34",name:"Meditations",hours:6,type:"book",section:"Core",genre:"Fighter"},
{id:"B35",name:"The Art of War",hours:1,type:"book",section:"Core",genre:"Fighter"},
{id:"B36",name:"Bobby Fischer Teaches Chess",hours:3,type:"book",section:"Core",genre:"Fighter"},
{id:"B37",name:"A War Like No Other",hours:9,type:"book",section:"Core",genre:"Fighter"},
{id:"B38",name:"Beowulf",hours:4,type:"book",section:"Core",genre:"Fighter"},
{id:"B39",name:"Book of Five Rings",hours:2,type:"book",section:"Core",genre:"Fighter"},
{id:"B40",name:"The Guns of August",hours:13,type:"book",section:"Core",genre:"Fighter"},
{id:"B41",name:"The Moon is a Harsh Mistress",hours:10,type:"book",section:"Core",genre:"Fighter"},
{id:"B42",name:"Endurance",hours:7,type:"book",section:"Core",genre:"Sailor"},
{id:"B43",name:"Brave New World",hours:7,type:"book",section:"Core",genre:"Sailor"},
{id:"B44",name:"The Odyssey",hours:6,type:"book",section:"Core",genre:"Sailor"},
{id:"B45",name:"The Travels of Marco Polo",hours:7,type:"book",section:"Core",genre:"Sailor"},
{id:"B46",name:"1493",hours:11,type:"book",section:"Core",genre:"Sailor"},
{id:"B47",name:"The Last Place on Earth",hours:12.5,type:"book",section:"Core",genre:"Sailor"},
{id:"B48",name:"Cosmos",hours:6.5,type:"book",section:"Core",genre:"Sailor"},
{id:"B49",name:"The Revenant",hours:8,type:"book",section:"Core",genre:"Survivalist"},
{id:"B50",name:"Undaunted Courage",hours:11.5,type:"book",section:"Core",genre:"Survivalist"},
{id:"B51",name:"One Man's Wilderness",hours:8,type:"book",section:"Core",genre:"Survivalist"},
{id:"B52",name:"Man's Search for Meaning",hours:4,type:"book",section:"Core",genre:"Survivalist"},
{id:"B53",name:"Touching the Void",hours:6,type:"book",section:"Core",genre:"Survivalist"},
{id:"B54",name:"1984",hours:8,type:"book",section:"Core",genre:"Survivalist"},
{id:"B55",name:"Animal Farm",hours:3,type:"book",section:"Core",genre:"Survivalist"},
{id:"B56",name:"1177 B.C.",hours:7,type:"book",section:"Core",genre:"Survivalist"},
{id:"B57",name:"Man, Cattle and Veld",hours:10,type:"book",section:"Core",genre:"Farmer"},
{id:"B58",name:"The Ascent of Money",hours:11,type:"book",section:"Core",genre:"Farmer"},
{id:"B59",name:"How to Draw and Think like a Real Artist",hours:30,type:"book",section:"Core",genre:"Farmer"},
{id:"B60",name:"Logic: A Very Short Introduction",hours:2.5,type:"book",section:"Core",genre:"Farmer"},
{id:"B61",name:"The Art of Thinking Clearly",hours:7,type:"book",section:"Core",genre:"Farmer"},
{id:"B62",name:"The Reluctant Entrepreneur",hours:5,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B63",name:"The Lean Startup",hours:6,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B64",name:"The Million-Dollar One-Person Business",hours:5,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B65",name:"Ready, Fire, Aim",hours:7,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B66",name:"The 1-Page Marketing Plan",hours:4,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B67",name:"The Boron Letters",hours:4,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B68",name:"Influence",hours:8,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B69",name:"Think and Grow Rich",hours:6,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B70",name:"Great Leads",hours:4,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B71",name:"How to Win Friends and Influence People",hours:7,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B72",name:"PreSuasion",hours:10,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B73",name:"Never Split the Difference",hours:9,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B74",name:"Good Strategy/Bad Strategy",hours:6,type:"book",section:"Core",genre:"Entrepreneur"},
{id:"B75",name:"Economics in One Lesson",hours:6,type:"book",section:"Core",genre:"Investor"},
{id:"B76",name:"The Intelligent Investor",hours:13,type:"book",section:"Core",genre:"Investor"},
{id:"B77",name:"The Most Important Thing",hours:6,type:"book",section:"Core",genre:"Investor"},
{id:"B78",name:"Market Wizards",hours:9,type:"book",section:"Core",genre:"Investor"},
{id:"B79",name:"When Money Dies",hours:8,type:"book",section:"Core",genre:"Investor"},
{id:"B80",name:"Lords of Finance",hours:14,type:"book",section:"Core",genre:"Investor"},
{id:"B81",name:"When Genius Failed",hours:8,type:"book",section:"Core",genre:"Investor"},
{id:"B82",name:"Manias, Panics & Crashes",hours:12,type:"book",section:"Core",genre:"Investor"},
{id:"B83",name:"Common Stocks & Uncommon Profits",hours:8,type:"book",section:"Core",genre:"Investor"},
{id:"B84",name:"The World for Sale",hours:9,type:"book",section:"Core",genre:"Investor"},
{id:"B85",name:"A Random Walk Down Wall Street",hours:13,type:"book",section:"Core",genre:"Investor"},
{id:"B86",name:"Against the Gods",hours:9,type:"book",section:"Core",genre:"Investor"},
{id:"B87",name:"You Can Be a Stock Market Genius",hours:7,type:"book",section:"Core",genre:"Investor"},
{id:"B88",name:"Reminiscences of a Stock Operator",hours:9,type:"book",section:"Core",genre:"Investor"},
{id:"B89",name:"Berkshire Letters to Shareholders",hours:16,type:"book",section:"Core",genre:"Investor"},
{id:"B90",name:"The Great Crash 1929",hours:6,type:"book",section:"Core",genre:"Hacker"},
{id:"B91",name:"The Lords of Easy Money",hours:10,type:"book",section:"Core",genre:"Hacker"},
{id:"B92",name:"This Time Is Different",hours:13,type:"book",section:"Core",genre:"Hacker"},
{id:"B93",name:"Devil Take the Hindmost",hours:12,type:"book",section:"Core",genre:"Hacker"},
{id:"B94",name:"The Dao of Capital",hours:7,type:"book",section:"Core",genre:"Hacker"},
{id:"B95",name:"Antifragile",hours:12,type:"book",section:"Core",genre:"Hacker"},
{id:"B96",name:"Don't Make Me Think",hours:3.5,type:"book",section:"Core",genre:"Hacker"},
{id:"B97",name:"The Three Body Problem",hours:10,type:"book",section:"Core",genre:"Hacker"},
{id:"B98",name:"Foundation Trilogy",hours:17,type:"book",section:"Core",genre:"Hacker"},
{id:"B99",name:"The War of Art",hours:4,type:"book",section:"Core",genre:"Maker"},
{id:"B100",name:"Nicomachean Ethics",hours:6,type:"book",section:"Core",genre:"Maker"},
{id:"B101",name:"Scientific Revolution",hours:4,type:"book",section:"Core",genre:"Maker"},
{id:"B102",name:"The Diamond Age",hours:13,type:"book",section:"Core",genre:"Maker"},
{id:"B103",name:"The Martian",hours:10,type:"book",section:"Core",genre:"Maker"},
{id:"B104",name:"The Divine Comedy",hours:9,type:"book",section:"Optional",genre:"Classics"},
{id:"B105",name:"Blood Meridian",hours:13,type:"book",section:"Optional",genre:"Classics"},
{id:"B106",name:"The Lord of the Rings",hours:40,type:"book",section:"Optional",genre:"Classics"},
{id:"B107",name:"Stranger in a Strange Land",hours:13,type:"book",section:"Optional",genre:"Classics"},
{id:"B108",name:"The Jungle",hours:13,type:"book",section:"Optional",genre:"Classics"},
{id:"B109",name:"The Old Man and the Sea",hours:2,type:"book",section:"Optional",genre:"Classics"},
{id:"B110",name:"The Fountainhead",hours:28,type:"book",section:"Optional",genre:"Classics"},
{id:"B111",name:"Decline & Fall of the Roman Empire Vol 1",hours:17,type:"book",section:"Optional",genre:"Classics"},
{id:"B112",name:"The Canterbury Tales",hours:9,type:"book",section:"Optional",genre:"Classics"},
{id:"B113",name:"War and Peace",hours:48,type:"book",section:"Optional",genre:"Classics"},
{id:"B114",name:"Don Quixote",hours:33,type:"book",section:"Optional",genre:"Classics"},
{id:"B115",name:"Glory Road",hours:8,type:"book",section:"Optional",genre:"Classics"},
{id:"B116",name:"Novum Organum",hours:3,type:"book",section:"Optional",genre:"Classics"},
{id:"B117",name:"The Time Machine",hours:3,type:"book",section:"Optional",genre:"Classics"},
{id:"B118",name:"Hitchhiker's Guide to the Galaxy",hours:4,type:"book",section:"Optional",genre:"Classics"},
{id:"B119",name:"Dragon's Egg",hours:8,type:"book",section:"Optional",genre:"Classics"},
{id:"B120",name:"Moby Dick",hours:18,type:"book",section:"Optional",genre:"Classics"},
{id:"B121",name:"Slaughterhouse Five",hours:5,type:"book",section:"Optional",genre:"Classics"},
{id:"B122",name:"One Second After",hours:9,type:"book",section:"Optional",genre:"Classics"},
{id:"B123",name:"Lonesome Dove",hours:24,type:"book",section:"Optional",genre:"Classics"},
{id:"B124",name:"In the Heart of the Sea",hours:8,type:"book",section:"Optional",genre:"Classics"},
{id:"B125",name:"For Whom The Bell Tolls",hours:11,type:"book",section:"Optional",genre:"Classics"},
{id:"B126",name:"The Portable Greek Historians",hours:9,type:"book",section:"Optional",genre:"Power/State"},
{id:"B127",name:"The Enlightenment",hours:4,type:"book",section:"Optional",genre:"Power/State"},
{id:"B128",name:"Confessions",hours:8,type:"book",section:"Optional",genre:"Power/State"},
{id:"B129",name:"Before France & Germany",hours:8,type:"book",section:"Optional",genre:"Power/State"},
{id:"B130",name:"The Carolingians",hours:8,type:"book",section:"Optional",genre:"Power/State"},
{id:"B131",name:"Magna Carta",hours:7,type:"book",section:"Optional",genre:"Power/State"},
{id:"B132",name:"Heart of Europe",hours:17,type:"book",section:"Optional",genre:"Power/State"},
{id:"B133",name:"The Fall of Rome",hours:6,type:"book",section:"Optional",genre:"Power/State"},
{id:"B134",name:"The Holy Roman Empire",hours:15,type:"book",section:"Optional",genre:"Power/State"},
{id:"B135",name:"Collapse",hours:18,type:"book",section:"Optional",genre:"Power/State"},
{id:"B136",name:"What Has Government Done to Our Money",hours:12.7,type:"book",section:"Optional",genre:"Power/State"},
{id:"B137",name:"The Silk Roads",hours:20,type:"book",section:"Optional",genre:"Power/State"},
{id:"B138",name:"The Russian Revolution",hours:7,type:"book",section:"Optional",genre:"Power/State"},
{id:"B139",name:"The Gulag Archipelago",hours:46,type:"book",section:"Optional",genre:"Power/State"},
{id:"B140",name:"Hagakure",hours:4,type:"book",section:"Optional",genre:"Power/State"},
{id:"B141",name:"Bhagavad Gita",hours:4,type:"book",section:"Optional",genre:"Power/State"},
{id:"B142",name:"A History of the US in Five Crashes",hours:8,type:"book",section:"Optional",genre:"Power/State"},
{id:"B143",name:"A Demon of Our Own Design",hours:7,type:"book",section:"Optional",genre:"Power/State"},
{id:"B144",name:"Once in Golconda",hours:7,type:"book",section:"Optional",genre:"Power/State"},
{id:"B145",name:"Skeletons on the Zahara",hours:7.5,type:"book",section:"Optional",genre:"Power/State"},
{id:"B146",name:"The Prince",hours:3,type:"book",section:"Optional",genre:"Power/State"},
{id:"B147",name:"Outwitting the Devil",hours:7,type:"book",section:"Optional",genre:"Personal Mastery"},
{id:"B148",name:"Put Your Ass Where Your Heart Wants to Be",hours:3,type:"book",section:"Optional",genre:"Personal Mastery"},
{id:"B149",name:"Memories, Dreams, Reflections",hours:10,type:"book",section:"Optional",genre:"Personal Mastery"},
{id:"B150",name:"12 Rules for Life",hours:10,type:"book",section:"Optional",genre:"Personal Mastery"},
{id:"B151",name:"About Face",hours:19,type:"book",section:"Optional",genre:"Personal Mastery"},
{id:"B152",name:"With the Old Breed",hours:8,type:"book",section:"Optional",genre:"Personal Mastery"},
{id:"B153",name:"Napoleon: A Life",hours:25,type:"book",section:"Optional",genre:"Personal Mastery"},
{id:"B154",name:"Stilwell and the American Experience in China",hours:16,type:"book",section:"Optional",genre:"Personal Mastery"},
{id:"B155",name:"The Fourth Turning",hours:8,type:"book",section:"Optional",genre:"Enterprise"},
{id:"B156",name:"Dumbing Us Down",hours:2,type:"book",section:"Optional",genre:"Enterprise"},
{id:"B157",name:"The Singularity is Near",hours:10,type:"book",section:"Optional",genre:"Enterprise"},
{id:"B158",name:"The Machinery of Freedom",hours:8,type:"book",section:"Optional",genre:"Money & Markets"},
{id:"B159",name:"The Bitcoin Standard",hours:7,type:"book",section:"Optional",genre:"Money & Markets"},
{id:"B160",name:"The Wealth of Nations",hours:31,type:"book",section:"Optional",genre:"Money & Markets"},
{id:"B161",name:"Wealth, War & Wisdom",hours:10,type:"book",section:"Optional",genre:"Money & Markets"},
{id:"B162",name:"Beating the Street",hours:9,type:"book",section:"Optional",genre:"Money & Markets"},
{id:"B163",name:"The Little Book That Still Beats the Market",hours:5,type:"book",section:"Optional",genre:"Money & Markets"},
{id:"B164",name:"What Works on Wall Street",hours:12,type:"book",section:"Optional",genre:"Money & Markets"},
{id:"B165",name:"Adaptive Markets",hours:13,type:"book",section:"Optional",genre:"Money & Markets"},
{id:"B166",name:"The Alchemy of Finance",hours:14,type:"book",section:"Optional",genre:"Money & Markets"},
{id:"B167",name:"House of Morgan",hours:22,type:"book",section:"Optional",genre:"Money & Markets"},
{id:"B168",name:"The Panic of 1907",hours:7,type:"book",section:"Optional",genre:"Money & Markets"},
{id:"B169",name:"Misbehavior of Markets",hours:7,type:"book",section:"Optional",genre:"Money & Markets"},
{id:"B170",name:"Financial Statement Analysis & Security Valuation",hours:20,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B171",name:"The Psychology of Money",hours:5,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B172",name:"The Price of Time",hours:9,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B173",name:"The Fruits of Graft",hours:14,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B174",name:"Only Yesterday (OPT)",hours:10,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B175",name:"The Hard Thing About Hard Things",hours:9,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B176",name:"Confessions of the Pricing Man",hours:6,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B177",name:"Zig Ziglar's Secrets of Closing the Sale",hours:6,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B178",name:"The Resilient Farm and Homestead",hours:12,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B179",name:"Holistic Management Handbook",hours:12,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B180",name:"Breakthrough Copywriting",hours:5,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B181",name:"Scientific Advertising",hours:3,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B182",name:"Making Them Believe",hours:7,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B183",name:"The 10 Commandments of A-List Copywriters",hours:3,type:"book",section:"Optional",genre:"Skills & Craft"},
{id:"B184",name:"The No-Code Revolution",hours:6,type:"book",section:"Optional",genre:"Skills & Craft"},
];

const SECTIONS=[
  {label:"Core Courses",   items:CURRICULUM.filter(i=>i.type==="course"&&i.section==="Core")},
  {label:"Optional Courses",items:CURRICULUM.filter(i=>i.type==="course"&&i.section==="Optional")},
  {label:"Core Books",     items:CURRICULUM.filter(i=>i.type==="book"&&i.section==="Core")},
  {label:"Optional Books", items:CURRICULUM.filter(i=>i.type==="book"&&i.section==="Optional")},
];

const DAY_NAMES=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const gc=g=>{
  const m={Biology:"#4ade80",Physics:"#60a5fa",Marketing:"#f472b6",Sales:"#fb923c",
    Investing:"#facc15",Law:"#a78bfa",Literature:"#38bdf8","World History":"#f97316",
    "American History":"#ef4444",Art:"#e879f9",Geology:"#86efac",Chemistry:"#fde68a",
    Pilot:"#7dd3fc",Welder:"#fca5a5",Maker:"#6ee7b7",Fighter:"#fcd34d",Sailor:"#93c5fd",
    Survivalist:"#86efac",Farmer:"#d9f99d",Entrepreneur:"#fdba74",Investor:"#fbbf24",
    Hacker:"#67e8f9",Builder:"#c4b5fd",Medic:"#6ee7b7",Chef:"#fb923c",Music:"#e879f9",
    Tinker:"#67e8f9","Personal Mastery":"#c084fc","Money & Markets":"#fbbf24",
    "Skills & Craft":"#94a3b8","Power/State":"#ef4444",Classics:"#e2e8f0",
    Astronomy:"#a5b4fc","Music Theory":"#f0abfc",Meteorology:"#7dd3fc"};
  if(!g) return "#94a3b8";
  for(const [k,v] of Object.entries(m)) if(g.toLowerCase().includes(k.toLowerCase())) return v;
  return "#94a3b8";
};

const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d;}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};

function getMonday(){
  const d=new Date(),day=d.getDay(),diff=day===0?-6:1-day;
  d.setDate(d.getDate()+diff);d.setHours(0,0,0,0);
  return d.toISOString().split('T')[0];
}
function getDayIdx(){const d=new Date().getDay();return d===0?6:d-1;}
function getDayName(){return DAY_NAMES[getDayIdx()];}
function getRemainingDays(){return 7-getDayIdx();}
function getTodayISO(){return new Date().toISOString().split('T')[0];}
function getWeekISO(){const d=new Date();return d.toISOString().split('T')[0].slice(0,7);}

const SK_P="tp_p4",SK_W="tp_w4",SK_F="tp_f4",SK_LOG="tp_wlog3",SK_PROFILE="tp_profile2";
const SK_PLAN="tp_plan2",SK_QUEUE="tp_queue1",SK_WEEKLY_HOURS="tp_wkhours1";
const MAX_WEEK_LOGS=12;

const DEFAULT_PROFILE=`LEARNER: Connor, 18, Kamloops BC. Self-directed 4-year curriculum called The Preparation.

TIME RATIOS (CRITICAL — always use these):
- Courses: 1h content = 2h real study time (1:2 ratio). Max 1.5h real per session = 0.75h content progress.
- Books: 1h content = 1h real study time (1:1 ratio). Max 2h real per session = 2h content progress.
- Weekly budget: 20 real study hours total.

PROGRESS TRACKING (CRITICAL):
- "hoursSpent" = real study hours logged (used for week budget tracking)
- "courseHoursComplete" = content hours completed (used for % calculation)
- % = courseHoursComplete / item.hours × 100
- realHoursRemaining for a course = (item.hours - courseHoursComplete) × 2
- realHoursRemaining for a book = (item.hours - courseHoursComplete) × 1
- NEVER confuse hoursSpent with courseHoursComplete — they are different numbers

SEQUENCING RULES:
- Always complete Core before Optional in any genre
- Pedagogical order: Biology/Physics → History → Literature/Logic → Law/Economics → Technical
- Vary genre every session — never stack same genre twice in one day
- Max 2-3 active courses at once, always pair 2-4 books alongside
- Always keep 1 Fighter/philosophy book and 1 narrative book (Cowboy/Sailor/Survivalist) active

4-YEAR ARC:
- Year 1: Foundations — biology, history, physics, literature, philosophy
- Year 2: Applied — law, economics, investing, business
- Year 3: Specialization — pilot, advanced investing, technical
- Year 4: Integration`;

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
  glow:(c)=>`0 0 12px ${c}28, 0 0 32px ${c}10`,
  inset:"inset 0 2px 8px rgba(0,0,0,0.6)",
};

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

function SessionHistory({item,sessions,onEdit}){
  const [open,setOpen]=useState(false);
  return <div style={{marginTop:10}}>
    <button onClick={()=>setOpen(o=>!o)}
      style={{background:"none",border:"none",color:open?T.blue:T.textDim,fontSize:10,
        cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:"2px 0",
        letterSpacing:0.5,fontWeight:600,textTransform:"uppercase",transition:"color 0.2s"}}>
      <span style={{fontSize:8}}>{open?"▲":"▼"}</span>Log History
      <span style={{color:T.textFaint,fontWeight:400,textTransform:"none",letterSpacing:0}}>({sessions.length})</span>
    </button>
    {open&&<div style={{marginTop:8,borderLeft:`1px solid ${T.surface3}`,paddingLeft:12}}>
      {sessions.map((s,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"7px 0",borderBottom:`1px solid ${T.surface2}`}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:T.textMid,fontWeight:500}}>{s.date}</div>
            <div style={{fontSize:10,color:T.textDim,marginTop:2}}>
              {s.studyHours}h real study · {s.courseHours}h content
              {s.note?` · ${s.note}`:""}
            </div>
          </div>
          <button onClick={()=>onEdit(i)}
            style={{background:T.surface2,border:`1px solid ${T.surface3}`,color:T.blue,
              borderRadius:7,padding:"3px 10px",fontSize:10,cursor:"pointer",fontWeight:600,marginLeft:10}}>
            Edit
          </button>
        </div>
      ))}
    </div>}
  </div>;
}

function SectionBlock({sec,focusIds,getP,setLogging,onReset}){
  const [open,setOpen]=useState(false);
  const done=sec.items.filter(i=>getP(i.id).percentComplete>=100).length;
  const active=sec.items.filter(i=>getP(i.id).percentComplete>0&&getP(i.id).percentComplete<100).length;
  const totalContentH=sec.items.reduce((s,i)=>s+(i.hours||0),0);
  const doneContentH=sec.items.reduce((s,i)=>s+(getP(i.id).courseHoursComplete||0),0);
  const pct=totalContentH>0?Math.round((doneContentH/totalContentH)*100):0;
  return <div style={{background:T.surface1,border:`1px solid ${T.border}`,
    borderTop:`1px solid ${T.borderLight}`,borderRadius:14,marginBottom:8,
    overflow:"hidden",boxShadow:shadow.card}}>
    <div onClick={()=>setOpen(o=>!o)}
      style={{padding:"14px 16px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:13,fontWeight:700,letterSpacing:0.1}}>{sec.label}</div>
        <div style={{fontSize:10,color:T.textDim,marginTop:3}}>{sec.items.length} items · {totalContentH}h content</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:16,fontWeight:900,color:pct>0?T.blue:T.textFaint,
            textShadow:pct>0?shadow.glow(T.blue):"none"}}>{pct}%</div>
          <div style={{fontSize:9,color:T.textDim,marginTop:1}}>{done} done · {active} active</div>
        </div>
        <div style={{color:T.textFaint,fontSize:11}}>{open?"▲":"▼"}</div>
      </div>
    </div>
    <Bar pct={pct} style={{margin:"0 16px 10px",height:3}} glow={pct>0}/>
    {open&&<div style={{padding:"0 12px 12px"}}>
      {sec.items.map(item=>{
        const p=getP(item.id),inFocus=focusIds.includes(item.id);
        const isDone=p.percentComplete>=100,isTouched=p.percentComplete>0&&!isDone;
        const c=gc(item.genre);
        const contentLeft=Math.max(0,(item.hours||0)-(p.courseHoursComplete||0));
        const realLeft=contentToReal(item,contentLeft);
        return <div key={item.id}
          style={{display:"flex",alignItems:"center",gap:10,padding:"8px 6px",
            borderBottom:`1px solid ${T.surface2}`,borderRadius:inFocus?6:0}}>
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
              {inFocus?" · 🎯":""}
            </div>
          </div>
          <div style={{flexShrink:0,textAlign:"right",display:"flex",alignItems:"center",gap:6}}>
            {isTouched&&<div style={{fontSize:11,fontWeight:700,color:c,textShadow:`0 0 8px ${c}40`}}>{p.percentComplete}%</div>}
            {isDone&&<div style={{fontSize:13,color:T.green}}>✓</div>}
            {isDone&&<button onClick={()=>onReset(item)}
              style={{background:"none",border:`1px solid ${T.red}20`,color:T.red,
                borderRadius:7,padding:"3px 8px",fontSize:9,cursor:"pointer",fontWeight:600,
                letterSpacing:0.3}}>Reset</button>}
            {!isDone&&<button onClick={()=>setLogging(item)}
              style={{background:T.surface2,border:`1px solid ${T.surface3}`,color:T.blue,
                borderRadius:7,padding:"3px 9px",fontSize:10,cursor:"pointer",fontWeight:600}}>Log</button>}
          </div>
        </div>;
      })}
    </div>}
  </div>;
}

async function requestNotificationPermission(){
  if(!("Notification" in window)) return false;
  if(Notification.permission==="granted") return true;
  const r=await Notification.requestPermission();
  return r==="granted";
}
function showPlanReadyNotification(){
  if(Notification.permission==="granted"){
    new Notification("The Preparation",{
      body:"Your Monday plan is ready — 20h scheduled.",icon:"/icon.png",tag:"weekly-plan"
    });
  }
}

function buildItemContext(item, p) {
  const contentDone = p.courseHoursComplete || 0;
  const contentLeft = Math.max(0, (item.hours || 0) - contentDone);
  const realLeft = contentToReal(item, contentLeft);
  const realSpent = p.hoursSpent || 0;
  return `${item.id} "${item.name}" (${item.type}, ${item.section}, ${item.genre}): `
    + `totalContent=${item.hours}h | contentDone=${contentDone.toFixed(2)}h | pct=${p.percentComplete}% | `
    + `contentLeft=${contentLeft.toFixed(2)}h | realHoursLeft=${realLeft.toFixed(2)}h | realSpent=${realSpent.toFixed(2)}h`;
}

const callAI = async (prompt, max_tokens = 1500, model = "claude-haiku-4-5-20251001") => {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens, messages: [{ role: "user", content: prompt }] })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "API error");
  return d.content.map(c => c.text || "").join("");
};

const loadQueue=()=>load(SK_QUEUE,[]);
const saveQueue=q=>save(SK_QUEUE,q);
const enqueue=(type,payload)=>{
  const q=loadQueue();
  q.push({id:Date.now(),type,payload,ts:new Date().toISOString()});
  saveQueue(q);
};
const dequeue=id=>{
  const q=loadQueue().filter(x=>x.id!==id);
  saveQueue(q);
};

export default function App(){
  const [progress,setProgress]=useState(()=>load(SK_P,{}));
  const [week,setWeek]=useState(()=>{
    const w=load(SK_W,{weekStart:getMonday(),hoursLogged:0}),mon=getMonday();
    return w.weekStart!==mon?{weekStart:mon,hoursLogged:0}:w;
  });
  const [focus,setFocus]=useState(()=>{
    const f=load(SK_F,{courses:["A1"],books:["B99","B34"],manual:false});
    if(f.primary!==undefined) return{courses:[f.primary,f.secondary].filter(Boolean),books:f.books||[],manual:false};
    return f;
  });
  const [weekPlan,setWeekPlan]=useState(()=>{
    const p=load(SK_PLAN,null);
    return p?.weekStart===getMonday()?p:null;
  });
  const [weeklyHours,setWeeklyHours]=useState(()=>load(SK_WEEKLY_HOURS,[]));
  const [view,setView]=useState("today");
  const [logging,setLogging]=useState(null);
  const [logForm,setLogForm]=useState({hours:"",courseHours:"",note:"",date:new Date().toLocaleDateString()});
  const [confirmLog,setConfirmLog]=useState(false);
  const [toast,setToast]=useState(null);
  const [aiLoading,setAiLoading]=useState(false);
  const [adaptLoading,setAdaptLoading]=useState(false);
  const [summaryLoading,setSummaryLoading]=useState(false);
  const [aiResult,setAiResult]=useState(null);
  const [weekNote,setWeekNote]=useState("");
  const [editFocus,setEditFocus]=useState(false);
  const [completionBanner,setCompletionBanner]=useState([]);
  const [weekLogs,setWeekLogs]=useState(()=>load(SK_LOG,[]));
  const [profile,setProfile]=useState(()=>localStorage.getItem(SK_PROFILE)||DEFAULT_PROFILE);
  const [editProfile,setEditProfile]=useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const [editSession,setEditSession]=useState(null);
  const [editSessionForm,setEditSessionForm]=useState({hours:"",courseHours:"",note:""});
  const [missedDayBanner,setMissedDayBanner]=useState(false);
  const [offlineQueue,setOfflineQueue]=useState(()=>loadQueue());
  const [isOnline,setIsOnline]=useState(navigator.onLine);
  const [weeklySummary,setWeeklySummary]=useState(null);
  const [markCompleteConfirm,setMarkCompleteConfirm]=useState(null);
  const [bonusItems,setBonusItems]=useState(()=>load("tp_bonus1",[]));
  const [bonusLoading,setBonusLoading]=useState(false);
  const [exportReminder,setExportReminder]=useState(false);
  const prevProgressRef=useRef({});

  useEffect(()=>save(SK_P,progress),[progress]);
  useEffect(()=>save(SK_W,week),[week]);
  useEffect(()=>save(SK_F,focus),[focus]);
  useEffect(()=>save(SK_LOG,weekLogs),[weekLogs]);
  useEffect(()=>save("tp_bonus1",bonusItems),[bonusItems]);
  useEffect(()=>save(SK_WEEKLY_HOURS,weeklyHours),[weeklyHours]);
  useEffect(()=>localStorage.setItem(SK_PROFILE,profile),[profile]);
  useEffect(()=>save(SK_PLAN,weekPlan),[weekPlan]);

  useEffect(()=>{
    const last=parseInt(localStorage.getItem("tp_last_export")||"0");
    const daysSince=(Date.now()-last)/(1000*60*60*24);
    if(daysSince>=14) setExportReminder(true);
  },[]);

  useEffect(()=>{
    const up=()=>{setIsOnline(true);processQueue();};
    const dn=()=>setIsOnline(false);
    window.addEventListener("online",up);
    window.addEventListener("offline",dn);
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
    const now=new Date();
    const isMonday=now.getDay()===1;
    const isAfter7=now.getHours()>=7;
    const planExistsThisWeek=weekPlan&&weekPlan.weekStart===getMonday();
    if(isMonday&&isAfter7&&!planExistsThisWeek){
      setTimeout(()=>runFullCheckin(true),1500);
    }
    const isSunday=now.getDay()===0;
    if(isSunday&&!weeklySummary){
      setTimeout(()=>runSundaySummary(),3000);
    }
  },[]);

  useEffect(()=>{
    if(!weekPlan?.days) return;
    const todayIdx=getDayIdx();
    if(todayIdx===0) return;
    const yesterday=DAY_NAMES[todayIdx-1];
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
    if(newlyDone.length>0) setCompletionBanner(b=>[...new Set([...b,...newlyDone])]);
    prevProgressRef.current=progress;
  },[progress]);

  const toast_=m=>{setToast(m);setTimeout(()=>setToast(null),2600);};
  const getP=id=>progress[id]||{hoursSpent:0,courseHoursComplete:0,percentComplete:0,sessions:[]};
  const weekH=week.hoursLogged||0;
  const wkRem=Math.max(0,WEEKLY_TARGET-weekH);
  const dLeft=getRemainingDays();

  const focusIds=[...(focus.courses||[]),...(focus.books||[])];
  const focusItems=focusIds.map(id=>CURRICULUM.find(i=>i.id===id)).filter(Boolean);

  const bestWeek=weeklyHours.reduce((b,w)=>w.realH>b?w.realH:b,0);
  const currentStreak=(()=>{
    let streak=0;
    for(let i=0;i<weeklyHours.length;i++){
      if(weeklyHours[i].realH>=WEEKLY_TARGET) streak++;
      else break;
    }
    return streak;
  })();
  const longestStreak=(()=>{
    let max=0,cur=0;
    [...weeklyHours].reverse().forEach(w=>{if(w.realH>=WEEKLY_TARGET){cur++;max=Math.max(max,cur);}else cur=0;});
    return max;
  })();

  const genreBalance=(()=>{
    const map={};
    CURRICULUM.forEach(i=>{
      const p=getP(i.id);
      if(p.hoursSpent>0) map[i.genre]=(map[i.genre]||0)+(p.hoursSpent||0);
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8);
  })();

  const avgWeeklyH=weeklyHours.length>0
    ?weeklyHours.slice(0,4).reduce((s,w)=>s+(w.realH||0),0)/Math.min(4,weeklyHours.length)
    :WEEKLY_TARGET/2;

  const todayItems=()=>{
    if(weekH>=WEEKLY_TARGET) return [];
    const todayName=getDayName();
    if(weekPlan&&weekPlan.weekStart===getMonday()&&weekPlan.days){
      const todayPlan=weekPlan.days.find(d=>d.day===todayName);
      if(todayPlan?.items?.length>0){
        return todayPlan.items.map(it=>{
          const item=CURRICULUM.find(i=>i.id===it.id);
          if(!item||getP(it.id).percentComplete>=100) return null;
          const p=getP(it.id);
          const realH=it.realHours||it.hours||1;
          const contentGain=realToContent(item,realH);
          const targetPct=targetPctAfterSession(item,p,realH);
          const contentDone=p.courseHoursComplete||0;
          const contentLeft=Math.max(0,(item.hours||0)-contentDone);
          return{...item,allocRealH:realH,
            contentGain:parseFloat(contentGain.toFixed(2)),targetPct,
            contentDone:parseFloat(contentDone.toFixed(2)),contentTotal:item.hours,
            contentLeft:parseFloat(contentLeft.toFixed(2)),planNote:it.focus||null};
        }).filter(Boolean);
      }
    }
    let rem=Math.max(wkRem/Math.max(dLeft,1),1.5);
    return focusItems.filter(i=>getP(i.id).percentComplete<100).reduce((acc,item)=>{
      if(rem<=0) return acc;
      const maxR=maxRealPerSession(item);
      const alloc=Math.min(rem,maxR);
      if(alloc>=0.5){
        const p=getP(item.id);
        const contentGain=realToContent(item,alloc);
        const tgt=targetPctAfterSession(item,p,alloc);
        const contentDone=p.courseHoursComplete||0;
        acc.push({...item,allocRealH:parseFloat(alloc.toFixed(1)),
          contentGain:parseFloat(contentGain.toFixed(2)),targetPct:tgt,
          contentDone:parseFloat(contentDone.toFixed(2)),contentTotal:item.hours,
          contentLeft:parseFloat(Math.max(0,(item.hours||0)-contentDone).toFixed(2))});
        rem-=alloc;
      }
      return acc;
    },[]);
  };

  const buildAIContext=()=>{
    const recentHistory=weekLogs.slice(0,4).map((l,i)=>
      `WEEK ${i+1} AGO (${l.date}): ${(l.hoursLogged||0).toFixed(1)}h real logged. Note:"${l.note||"none"}". Assessment:"${l.assessment||""}". Focus at time:${l.focusBefore?.join(", ")||"unknown"}.`
    ).join("\n");

    let planVsActual="No plan this week yet.";
    if(weekPlan?.days){
      const pastDays=weekPlan.days.filter(d=>DAY_NAMES.indexOf(d.day)<getDayIdx());
      if(pastDays.length>0){
        planVsActual=pastDays.map(d=>{
          const plannedH=d.items?.reduce((s,it)=>s+(it.realHours||0),0)||0;
          const dayDate=new Date(getMonday()+"T12:00:00");
          dayDate.setDate(dayDate.getDate()+DAY_NAMES.indexOf(d.day));
          const dayStr=dayDate.toLocaleDateString();
          const loggedH=CURRICULUM.reduce((s,i)=>{
            return s+(getP(i.id).sessions||[])
              .filter(s=>s.date===dayStr)
              .reduce((ss,x)=>ss+(x.studyHours||0),0);
          },0);
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
        const recentSessions=(p.sessions||[]).filter(s=>new Date(s.date)>=twoWeeksAgo);
        const recentRealH=recentSessions.reduce((s,x)=>s+(x.studyHours||0),0);
        const momentum=recentRealH>3?"HIGH":recentRealH>0?"LOW":"STALLED";
        return buildItemContext(i,p)+` | momentum=${momentum} (${recentRealH.toFixed(1)}h in last 2wk)`;
      }).join("\n");

    const nextCore=CURRICULUM
      .filter(i=>i.section==="Core"&&getP(i.id).percentComplete===0&&!focusIds.includes(i.id))
      .slice(0,12)
      .map(i=>{const realH=contentToReal(i,i.hours||0);return `${i.id} "${i.name}" (${i.type}, ${i.genre}): ${i.hours}h content = ${realH}h real`;})
      .join("\n");

    const totalDoneH=CURRICULUM.reduce((s,i)=>s+(getP(i.id).hoursSpent||0),0);
    const arcYear=totalDoneH<200?"Year 1 — Foundations":totalDoneH<600?"Year 2 — Applied":totalDoneH<1200?"Year 3 — Specialization":"Year 4 — Integration";
    const completedGenres=[...new Set(CURRICULUM.filter(i=>getP(i.id).percentComplete>=100).map(i=>i.genre))];
    const inProgressGenres=[...new Set(CURRICULUM.filter(i=>getP(i.id).percentComplete>0&&getP(i.id).percentComplete<100).map(i=>i.genre))];
    const arcPosition=`${arcYear}. ${totalDoneH.toFixed(0)}h real logged total. Completed genres: ${completedGenres.join(", ")||"none"}. Active genres: ${inProgressGenres.join(", ")||"none"}.`;

    const recentWeeks=weeklyHours.slice(0,4);
    const velocityTrend=recentWeeks.length>=2
      ?recentWeeks[0].realH>recentWeeks[1].realH?"↑ accelerating"
        :recentWeeks[0].realH<recentWeeks[1].realH?"↓ decelerating":"→ stable"
      :"insufficient data";
    const avgH=recentWeeks.length>0?(recentWeeks.reduce((s,w)=>s+(w.realH||0),0)/recentWeeks.length).toFixed(1):"—";

    return{recentHistory,planVsActual,touchedAndFocus,nextCore,arcPosition,velocityTrend,avgH};
  };

  const processQueue=useCallback(async()=>{
    const q=loadQueue();
    if(!q.length||!navigator.onLine) return;
    for(const item of q){
      try{
        if(item.type==="checkin") await runFullCheckin(false);
        else if(item.type==="adapt") await runAdaptPlan(item.payload?.contextNote||"");
        dequeue(item.id);
        setOfflineQueue(loadQueue());
        toast_("✓ Queued plan synced");
      }catch(e){break;}
    }
  },[]);

  // ─── FULL CHECKIN ────────────────────────────────────────────────────────────
  const runFullCheckin=async(auto=false)=>{
    if(!navigator.onLine){enqueue("checkin",{auto});setOfflineQueue(loadQueue());toast_("Offline — check-in queued");return;}
    if(!auto) requestNotificationPermission();
    setAiLoading(true);setAiResult(null);
    const mondaySeed=localStorage.getItem("tp_monday_seed")||"";
    const{recentHistory,planVsActual,touchedAndFocus,nextCore,arcPosition,velocityTrend,avgH}=buildAIContext();
    const todayStr_=new Date().toLocaleDateString();
    const loggedToday_=Object.values(progress).some(p=>(p.sessions||[]).some(s=>s.date===todayStr_));
    const effectiveDayIdx_=loggedToday_?getDayIdx()+1:getDayIdx();
    const remainingDayNames=DAY_NAMES.slice(effectiveDayIdx_);
    const effectiveDLeft=remainingDayNames.length;
    const effectiveWkRem=Math.max(0,WEEKLY_TARGET-weekH);

    if(effectiveDLeft===0||effectiveWkRem===0){toast_("Week complete — nothing left to plan");setAiLoading(false);return;}

    // Pre-compute day budgets so we can validate the AI response
    const dayBudgets=distributeDays(effectiveWkRem,remainingDayNames);

    const prompt=`Learning coach. Plan this learner's remaining week. Respond ONLY with valid JSON — no markdown, no extra text.

HOUR RULES (strict):
- Courses: 1h content = 2h real. Max 1.5h real/session = 0.75h content.
- Books: 1h content = 1h real. Max 2h real/session.
- targetPct = floor((contentDone + contentGain) / totalContent × 100)

WEEK BUDGET — NON-NEGOTIABLE:
- Weekly target: ${WEEKLY_TARGET}h real. Already logged: ${weekH.toFixed(2)}h.
- Remaining to schedule: ${effectiveWkRem.toFixed(2)}h across ${effectiveDLeft} day(s): ${remainingDayNames.join(", ")}.
- Suggested day budgets (you may vary slightly, but grand total MUST equal ${effectiveWkRem.toFixed(2)}h):
  ${remainingDayNames.map((d,i)=>`${d}: ${dayBudgets[i]}h`).join(" | ")}
- Max 4h real per day. Vary genres — never same genre twice in one day.
- totalPlannedHours in your JSON MUST equal ${effectiveWkRem.toFixed(2)}.

PROFILE: ${profile.split('\n').slice(0,6).join(' ')}
ARC: ${arcPosition} Velocity: ${velocityTrend}. Avg: ${avgH}h/wk.
${mondaySeed?"CONTEXT: "+mondaySeed:""}
WEEK NOTE: "${weekNote||"none"}"
THIS WEEK: ${weekH.toFixed(2)}h logged. Plan vs actual: ${planVsActual}
FOCUS (${focus.manual?"MANUAL — hard constraint":"AI proposed"}): ${focusIds.join(", ")}

ACTIVE ITEMS:
${touchedAndFocus||"None."}

NEXT UNTOUCHED CORE:
${nextCore.split('\n').slice(0,6).join('\n')}

HISTORY: ${recentHistory.split('\n').slice(0,2).join(' ')}

Respond ONLY as JSON:
{"assessment":"2 sentences max","insight":"1 sentence","nextMilestone":"1 sentence","focusProposal":{"courses":["A1"],"books":["B34","B99"],"reasoning":"1 sentence"},"days":[{"day":"Mon","totalDayRealH":3,"items":[{"id":"A1","realHours":1.5,"contentHours":0.75,"targetPct":44,"focus":"short specific instruction"}]}],"totalPlannedHours":${effectiveWkRem.toFixed(2)}}`;

    try{
      const raw=await callAI(prompt,2000);
      const jsonMatch=raw.match(/\{[\s\S]*\}/);
      if(!jsonMatch) throw new Error("No JSON: "+raw.slice(0,200));
      const parsed=JSON.parse(jsonMatch[0]);

      // ── Validate & fix each day against its pre-computed budget ──
      const validatedDays=(parsed.days||[]).map((day,i)=>{
        const budget=dayBudgets[i]??dayBudgets[dayBudgets.length-1]??snap25(effectiveWkRem/effectiveDLeft);
        const scaled=scaleDayItems(day.items||[],budget,
          id=>CURRICULUM.find(c=>c.id===id),id=>getP(id));
        return{...day,totalDayRealH:budget,items:scaled};
      });

      // ── Final grand-total guard: snap any remaining drift ──
      const grandTotal=parseFloat(validatedDays.reduce((s,d)=>s+(d.totalDayRealH||0),0).toFixed(2));
      const drift=parseFloat((effectiveWkRem-grandTotal).toFixed(2));
      if(Math.abs(drift)>=0.05&&validatedDays.length>0){
        const last=validatedDays[validatedDays.length-1];
        const newDayH=parseFloat((last.totalDayRealH+drift).toFixed(2));
        const scaledLast=scaleDayItems(last.items,newDayH,
          id=>CURRICULUM.find(c=>c.id===id),id=>getP(id));
        validatedDays[validatedDays.length-1]={...last,totalDayRealH:newDayH,items:scaledLast};
      }

      const keptDays=(weekPlan?.days||[]).filter(d=>DAY_NAMES.indexOf(d.day)<effectiveDayIdx_);
      const plan={
        weekStart:getMonday(),
        generatedAt:new Date().toISOString(),
        days:[...keptDays,...validatedDays],
        totalPlannedHours:effectiveWkRem,
        isBaseplan:true,
        reasoning:parsed.insight||"",
        focusReasoning:parsed.focusProposal?.reasoning||""
      };
      setWeekPlan(plan);
      setAiResult(parsed);
      saveWeekLog(parsed);
      updateWeeklyHours(weekH);
      localStorage.removeItem("tp_monday_seed");
      if(auto) showPlanReadyNotification();
    }catch(e){console.error("Checkin error:",e);toast_("Couldn't generate — try again");}
    setAiLoading(false);
  };

  // ─── ADAPT PLAN ──────────────────────────────────────────────────────────────
  const runAdaptPlan=async(contextNote="")=>{
    if(!navigator.onLine){enqueue("adapt",{contextNote});setOfflineQueue(loadQueue());toast_("Offline — adapt queued");return;}
    setAdaptLoading(true);
    const{planVsActual,touchedAndFocus,nextCore,arcPosition,velocityTrend,avgH}=buildAIContext();
    const todayStr=new Date().toLocaleDateString();
    const loggedToday=Object.values(progress).some(p=>(p.sessions||[]).some(s=>s.date===todayStr));
    const effectiveDayIdx=loggedToday?getDayIdx()+1:getDayIdx();
    const remainingDays=DAY_NAMES.slice(effectiveDayIdx);
    const dLeftEffective=remainingDays.length;
    const freshWeekH=week.hoursLogged||0;
    const freshWkRem=Math.max(0,WEEKLY_TARGET-freshWeekH);

    if(dLeftEffective===0||freshWkRem===0){toast_("Week complete — nothing to adapt");setAdaptLoading(false);return;}

    // Pre-compute day budgets for validation
    const dayBudgets=distributeDays(freshWkRem,remainingDays);

    const prompt=`Learning coach. Adapt remaining week plan. Respond ONLY with valid JSON.

RULES:
- Courses: 1h content = 2h real. Max 1.5h real/session.
- Books: 1h content = 1h real. Max 2h real/session.
- Grand total of all days MUST equal exactly ${freshWkRem.toFixed(2)}h. Non-negotiable.
- Suggested day budgets: ${remainingDays.map((d,i)=>`${d}: ${dayBudgets[i]}h`).join(" | ")}
- Max 4h/day. Vary genres — never same genre twice in one day.
- totalPlannedHours MUST equal ${freshWkRem.toFixed(2)}.

TRIGGER: ${contextNote||"Manual adapt — infer reason from plan vs actual."}
ARC: ${arcPosition} Velocity: ${velocityTrend}.
THIS WEEK: ${freshWeekH.toFixed(2)}h logged. Remaining: ${freshWkRem.toFixed(2)}h across ${dLeftEffective} day(s): ${remainingDays.join(", ")||"none"}.
Today: ${getDayName()}${loggedToday?" (logged — skip today)":""}.
Plan vs actual: ${planVsActual}
Focus (${focus.manual?"MANUAL":"AI"}): ${focusIds.join(", ")}

ITEMS:
${touchedAndFocus||"None."}

NEXT CORE:
${nextCore.split('\n').slice(0,4).join('\n')}

Respond ONLY as JSON:
{"days":[{"day":"Tue","totalDayRealH":3,"items":[{"id":"A1","realHours":1.5,"contentHours":0.75,"targetPct":44,"focus":"brief instruction"}]}],"totalPlannedHours":${freshWkRem.toFixed(2)},"note":"1 sentence what changed","focusProposal":{"courses":["A1"],"books":["B34","B99"],"reasoning":"1 sentence"}}`;

    try{
      const raw=await callAI(prompt,1500);
      const txt=raw.replace(/```json[\s\S]*?```/g,m=>m.slice(7,-3)).replace(/```/g,"").trim();
      const jsonMatch=raw.match(/\{[\s\S]*\}/);
      if(!jsonMatch) throw new Error("No JSON: "+raw.slice(0,200));
      const parsed=JSON.parse(jsonMatch[0]);

      // ── Validate each day against its pre-computed budget ──
      let adaptDays=(parsed.days||[]).map((day,i)=>{
        const budget=dayBudgets[i]??dayBudgets[dayBudgets.length-1]??snap25(freshWkRem/dLeftEffective);
        const scaled=scaleDayItems(day.items||[],budget,
          id=>CURRICULUM.find(c=>c.id===id),id=>getP(id));
        return{...day,totalDayRealH:budget,items:scaled};
      });

      // ── Final grand-total guard ──
      const grandTotal=parseFloat(adaptDays.reduce((s,d)=>s+(d.totalDayRealH||0),0).toFixed(2));
      const drift=parseFloat((freshWkRem-grandTotal).toFixed(2));
      if(Math.abs(drift)>=0.05&&adaptDays.length>0){
        const last=adaptDays[adaptDays.length-1];
        const newDayH=parseFloat((last.totalDayRealH+drift).toFixed(2));
        const scaledLast=scaleDayItems(last.items,newDayH,
          id=>CURRICULUM.find(c=>c.id===id),id=>getP(id));
        adaptDays[adaptDays.length-1]={...last,totalDayRealH:newDayH,items:scaledLast};
      }

      const keptDays=(weekPlan?.days||[]).filter(d=>!remainingDays.includes(d.day));
      const newPlan={...weekPlan,
        days:[...keptDays,...adaptDays],
        totalPlannedHours:WEEKLY_TARGET,
        lastAdapted:new Date().toISOString()
      };
      setWeekPlan(newPlan);
      if(parsed.focusProposal){
        setAiResult(r=>({...(r||{}),focusProposal:parsed.focusProposal,quickNote:parsed.note}));
      } else {
        toast_(`✓ Plan adapted — ${parsed.note||"remaining days updated"}`);
      }
    }catch(e){toast_(`Adapt failed: ${e.message?.slice(0,60)||"unknown error"}`);}
    setAdaptLoading(false);
  };

  const markItemComplete=async(item)=>{
    const p=getP(item.id);
    const tot=item.hours||1;
    const contentDone=p.courseHoursComplete||0;
    const contentRemaining=Math.max(0,tot-contentDone);
    const today=new Date().toLocaleDateString();
    if(contentRemaining>0){
      const realH=contentToReal(item,contentRemaining);
      setProgress(prev=>({...prev,[item.id]:{
        hoursSpent:(prev[item.id]?.hoursSpent||0)+realH,
        courseHoursComplete:tot,percentComplete:100,
        sessions:[...(prev[item.id]?.sessions||[]),
          {date:today,studyHours:parseFloat(realH.toFixed(2)),courseHours:parseFloat(contentRemaining.toFixed(2)),note:"Marked complete"}]
      }}));
      const monDate=new Date(getMonday());
      const sunDate=new Date(monDate);sunDate.setDate(monDate.getDate()+6);
      if(new Date()>=monDate&&new Date()<=sunDate){
        setWeek(w=>({...w,hoursLogged:(w.hoursLogged||0)+realH}));
      }
    } else {
      setProgress(prev=>({...prev,[item.id]:{...prev[item.id],percentComplete:100}}));
    }
    setMarkCompleteConfirm(null);
    toast_(`✓ ${item.name} marked complete`);
    setTimeout(()=>runAdaptPlan(`${item.id} "${item.name}" was just marked complete mid-week. Swap it out and pull in the next logical curriculum item.`),400);
  };

  const runBonusSuggestions=async()=>{
    if(!navigator.onLine){toast_("Offline — can't generate bonus");return;}
    setBonusLoading(true);
    const{touchedAndFocus,nextCore}=buildAIContext();
    const prompt=`The learner has hit their 20h weekly target. Suggest 1-2 optional bonus sessions for today.

COURSES: 1h content = 2h real. Max 1.5h real per session.
BOOKS: 1h content = 1h real. Max 2h real per session.

CURRENT STATUS:
${touchedAndFocus||"None."}

NEXT UNTOUCHED CORE ITEMS:
${nextCore}

Pick 1-2 high-value items. Keep tone light — bonus, not obligation.

Respond ONLY with valid JSON:
{"items":[{"id":"A1","realHours":1.5,"contentHours":0.75,"focus":"..."}],"note":"one sentence"}`;
    try{
      const bonusRaw=await callAI(prompt,600);
      const txt=bonusRaw.replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(txt);
      setBonusItems({items:parsed.items||[],note:parsed.note||"",generatedAt:new Date().toISOString()});
    }catch(e){toast_("Couldn't generate bonus — try again");}
    setBonusLoading(false);
  };

  const runSundaySummary=async()=>{
    if(!navigator.onLine) return;
    setSummaryLoading(true);
    const{planVsActual,arcPosition,velocityTrend,avgH}=buildAIContext();
    const thisWeekItems=CURRICULUM
      .filter(i=>{
        const sessions=getP(i.id).sessions||[];
        const mon=new Date(getMonday());
        return sessions.some(s=>{const d=new Date(s.date);return d>=mon;});
      })
      .map(i=>{
        const p=getP(i.id);
        const weekSessions=(p.sessions||[]).filter(s=>{
          const d=new Date(s.date),mon=new Date(getMonday());return d>=mon;
        });
        const wH=weekSessions.reduce((s,x)=>s+(x.studyHours||0),0);
        return `${i.id} "${i.name}": ${wH.toFixed(1)}h this week, now ${p.percentComplete}%`;
      }).join("\n");

    const stalledItems=CURRICULUM
      .filter(i=>{
        const p=getP(i.id);
        if(p.percentComplete>=100||p.percentComplete===0) return false;
        const twoWeeksAgo=new Date(Date.now()-14*24*60*60*1000);
        return !(p.sessions||[]).some(s=>new Date(s.date)>=twoWeeksAgo);
      })
      .map(i=>`${i.id} "${i.name}" stalled at ${getP(i.id).percentComplete}%`)
      .join("\n");

    const prompt=`Write a short Sunday review (3-4 sentences). Be specific — reference actual items, hours, patterns. No fluff.

Weekly hours: ${weekH.toFixed(1)}h / ${WEEKLY_TARGET}h.
${arcPosition}
Velocity: ${velocityTrend}. Rolling avg: ${avgH}h/week.
Plan vs actual: ${planVsActual}
Items worked: ${thisWeekItems||"None logged."}
${stalledItems?`Stalled:\n${stalledItems}`:""}

Then write exactly: ---MONDAY_SEED---
Then 3-4 sentences of sharp context for Monday's AI plan. No labels or headers.`;

    try{
      const summaryRaw=await callAI(prompt,500,"claude-sonnet-4-6");
      const txt=summaryRaw.trim();
      const parts=summaryRaw.split("---MONDAY_SEED---");
      setWeeklySummary(parts[0].trim());
      if(parts[1]) localStorage.setItem("tp_monday_seed",parts[1].trim());
    }catch(e){}
    setSummaryLoading(false);
  };

  const updateWeeklyHours=(h)=>{
    const iso=getWeekISO();
    setWeeklyHours(prev=>{
      const filtered=prev.filter(w=>w.weekISO!==iso);
      return [{weekISO:iso,realH:h},...filtered].slice(0,12);
    });
  };

  const saveWeekLog=result=>{
    const entry={weekStart:week.weekStart,date:new Date().toLocaleDateString(),
      note:weekNote,hoursLogged:weekH,assessment:result.assessment||"",
      insight:result.insight||"",nextMilestone:result.nextMilestone||"",
      focusBefore:[...(focus.courses||[]),...(focus.books||[])]};
    setWeekLogs(logs=>[entry,...logs.filter(l=>l.weekStart!==week.weekStart)].slice(0,MAX_WEEK_LOGS));
    updateWeeklyHours(weekH);
  };

  const submitLog=(quickRealH=null,quickContentH=null)=>{
    const isQuick=quickRealH!==null;
    if(!isQuick&&!logForm.hours) return;
    if(!isQuick&&!confirmLog){setConfirmLog(true);return;}
    const realH=isQuick?quickRealH:parseFloat(logForm.hours);
    const contentH=isQuick?quickContentH:(logForm.courseHours?parseFloat(logForm.courseHours):realToContent(logging,realH));
    const id=logging.id,tot=logging.hours||1;
    const prevContent=progress[id]?.courseHoursComplete||0;
    const newContent=Math.min(prevContent+contentH,tot);
    const newPct=Math.round((newContent/tot)*100);
    const sessionDate=isQuick?new Date():new Date(logForm.date);
    const monDate=new Date(getMonday());
    const sunDate=new Date(monDate);sunDate.setDate(monDate.getDate()+6);
    const isThisWeek=sessionDate>=monDate&&sessionDate<=sunDate;
    const dateStr=isQuick?new Date().toLocaleDateString():logForm.date;
    setProgress(p=>({...p,[id]:{
      hoursSpent:(p[id]?.hoursSpent||0)+realH,
      courseHoursComplete:newContent,percentComplete:newPct,
      sessions:[...(p[id]?.sessions||[]),
        {date:dateStr,studyHours:realH,courseHours:parseFloat(contentH.toFixed(3)),note:isQuick?"Quick log":logForm.note}]
    }}));
    if(isThisWeek) setWeek(w=>({...w,hoursLogged:(w.hoursLogged||0)+realH}));
    setLogging(null);
    setLogForm({hours:"",courseHours:"",note:"",date:new Date().toLocaleDateString(),_contentManuallySet:false});
    setConfirmLog(false);
    toast_(`✓ ${realH}h logged · ${logging.name}${!isThisWeek?" (prev week)":""}`);
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
    const newContentH=parseFloat(editSessionForm.courseHours)||realToContent(item,newRealH);
    sessions[sessionIdx]={...old,studyHours:newRealH,courseHours:newContentH,note:editSessionForm.note};
    const tot=item?.hours||1;
    const newContentTotal=Math.min(sessions.reduce((s,x)=>s+(x.courseHours||0),0),tot);
    const newSpent=sessions.reduce((s,x)=>s+(x.studyHours||0),0);
    setProgress(p=>({...p,[itemId]:{...p[itemId],sessions,
      courseHoursComplete:newContentTotal,hoursSpent:newSpent,
      percentComplete:Math.round((newContentTotal/tot)*100)}}));
    const diff=newRealH-(old.studyHours||0);
    setWeek(w=>({...w,hoursLogged:Math.max(0,(w.hoursLogged||0)+diff)}));
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
    setWeek(w=>({...w,hoursLogged:Math.max(0,(w.hoursLogged||0)-(removed.studyHours||0))}));
    setEditSession(null);toast_("Session deleted");
  };
  const applyFocusProposal=proposal=>{
    setFocus({courses:proposal.courses,books:proposal.books,manual:false});
    setAiResult(r=>({...r,focusProposal:null}));
    toast_("✓ Focus updated");
  };

  const totalItems=CURRICULUM.length;
  const doneItems=CURRICULUM.filter(i=>getP(i.id).percentComplete>=100).length;
  const totalSpentRealH=CURRICULUM.reduce((s,i)=>s+(getP(i.id).hoursSpent||0),0);
  const totalRealRemaining=CURRICULUM
    .filter(i=>getP(i.id).percentComplete<100)
    .reduce((s,i)=>s+realHoursRemaining(i,getP(i.id)),0);
  const wksLeft=Math.round(totalRealRemaining/WEEKLY_TARGET);
  const estDate=new Date(Date.now()+wksLeft*7*24*60*60*1000)
    .toLocaleDateString("en-CA",{year:"numeric",month:"short"});

  const planIsFromThisWeek=weekPlan&&weekPlan.weekStart===getMonday();
  const today=todayItems();

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

  return(
    <div style={{background:T.bg,minHeight:"100dvh",color:T.text,fontFamily:T.fontUI,paddingBottom:88}}>

      <div style={{height:"env(safe-area-inset-top)",background:T.surface0}}/>

      {toast&&<div style={{position:"fixed",top:`calc(env(safe-area-inset-top) + 12px)`,left:"50%",transform:"translateX(-50%)",
        background:T.green,color:"#000",padding:"10px 20px",borderRadius:99,fontWeight:700,
        zIndex:999,fontSize:12,letterSpacing:0.3,boxShadow:`0 4px 24px ${T.green}50`,whiteSpace:"nowrap"}}>
        {toast}</div>}

      {(!isOnline||offlineQueue.length>0)&&<div style={{background:isOnline?"#1a1200":"#180808",
        borderBottom:`1px solid ${isOnline?T.yellow:T.red}30`,
        padding:"8px 16px",paddingTop:`calc(env(safe-area-inset-top) + 8px)`,
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:10,color:isOnline?T.yellow:T.red,fontWeight:700,letterSpacing:0.5}}>
          {isOnline?`✓ Back online — ${offlineQueue.length} queued`:"Offline — AI features queued, logging works"}
        </div>
        {isOnline&&offlineQueue.length>0&&<button onClick={processQueue}
          style={{background:"none",border:`1px solid ${T.yellow}30`,color:T.yellow,
            borderRadius:7,padding:"3px 10px",fontSize:10,cursor:"pointer",fontWeight:700}}>
          Sync now
        </button>}
      </div>}

      {exportReminder&&<div style={{background:"#0f0f1a",borderBottom:`1px solid ${T.blue}25`,
        padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:T.blue,letterSpacing:0.5}}>💾 Time to back up</div>
          <div style={{fontSize:10,color:T.textDim,marginTop:2}}>2+ weeks since last export</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setExportReminder(false)}
            style={{background:"none",border:`1px solid ${T.surface3}`,color:T.textDim,
              borderRadius:7,padding:"4px 10px",fontSize:10,cursor:"pointer"}}>Later</button>
          <button onClick={()=>{
            const data={progress,week,focus,weekLogs,profile,weekPlan,weeklyHours};
            const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
            const url=URL.createObjectURL(blob);
            const a=document.createElement("a");a.href=url;
            a.download=`the-preparation-${getTodayISO()}.json`;a.click();URL.revokeObjectURL(url);
            localStorage.setItem("tp_last_export",String(Date.now()));
            setExportReminder(false);toast_("✓ Data exported");
          }} style={{background:T.blue,border:"none",color:"#000",borderRadius:7,
            padding:"4px 10px",fontSize:10,fontWeight:800,cursor:"pointer"}}>
            Export Now
          </button>
        </div>
      </div>}

      {completionBanner.length>0&&<div style={{background:"#0a150a",borderBottom:`1px solid #1a3a1a`,
        padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:T.green,letterSpacing:0.5}}>
            🎯 {completionBanner.length} item{completionBanner.length>1?"s":""} completed
          </div>
          <div style={{fontSize:10,color:"#2a5a2a",marginTop:2}}>
            {completionBanner.map(id=>CURRICULUM.find(i=>i.id===id)?.name||id).join(", ")}
          </div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setCompletionBanner([])}
            style={{background:"none",border:`1px solid #1a3a1a`,color:"#2a5a2a",
              borderRadius:7,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>✕</button>
          <button onClick={()=>{setView("ai");setCompletionBanner([]);}}
            style={{background:T.green,border:"none",color:"#000",borderRadius:8,padding:"6px 12px",
              fontSize:11,fontWeight:800,cursor:"pointer",boxShadow:`0 0 16px ${T.green}40`}}>
            Check-In →
          </button>
        </div>
      </div>}

      {missedDayBanner&&<div style={{background:"#1a1200",borderBottom:`1px solid #3a2a00`,
        padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:T.yellow,letterSpacing:0.5}}>⚠ Missed session yesterday</div>
          <div style={{fontSize:10,color:"#5a4a00",marginTop:2}}>Redistribute those hours?</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setMissedDayBanner(false)}
            style={{background:"none",border:`1px solid ${T.surface3}`,color:T.textDim,
              borderRadius:7,padding:"5px 10px",fontSize:10,cursor:"pointer"}}>Skip</button>
          <button onClick={()=>{setMissedDayBanner(false);runAdaptPlan("Missed yesterday — redistribute hours across remaining days.");}}
            style={{background:T.yellow,border:"none",color:"#000",borderRadius:7,
              padding:"5px 10px",fontSize:10,fontWeight:800,cursor:"pointer"}}>Adapt →</button>
        </div>
      </div>}

      <div style={{background:T.surface0,padding:`calc(env(safe-area-inset-top) + 16px) 16px 0`,
        borderBottom:`1px solid ${T.border}`,position:"sticky",top:0,zIndex:50,
        boxShadow:"0 4px 24px rgba(0,0,0,0.6)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontSize:9,color:T.textDim,letterSpacing:4,textTransform:"uppercase",marginBottom:4}}>The Preparation</div>
            <div style={{fontSize:22,fontWeight:800,letterSpacing:-0.5}}>Learning Tracker</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:20,fontWeight:900,letterSpacing:-0.5,
              color:weekH>=WEEKLY_TARGET?T.green:T.text,
              textShadow:weekH>=WEEKLY_TARGET?shadow.glow(T.green):"none"}}>
              {weekH.toFixed(1)}<span style={{fontSize:11,color:T.textDim,fontWeight:400}}>/{WEEKLY_TARGET}h</span>
            </div>
            <div style={{fontSize:9,color:T.textDim,marginTop:1}}>{getDayName()} · {dLeft}d left</div>
          </div>
        </div>
        <Bar pct={(weekH/WEEKLY_TARGET)*100} color={weekH>=WEEKLY_TARGET?T.green:T.blue} height={3} glow style={{marginBottom:4}}/>
        <div style={{fontSize:9,color:T.textDim,marginBottom:14,textAlign:"right",letterSpacing:0.3}}>
          {weekH>=WEEKLY_TARGET?"✓ Target hit":`${(wkRem/Math.max(dLeft,1)).toFixed(1)}h/day to finish`}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,flex:1,paddingRight:8}}>
            {focusItems.filter(i=>getP(i.id).percentComplete<100).map(i=>(
              <Pill key={i.id} color={gc(i.genre)} label={i.id}/>
            ))}
          </div>
          <button onClick={()=>setEditFocus(e=>!e)}
            style={{background:"none",border:`1px solid ${T.surface3}`,color:T.textDim,
              borderRadius:8,padding:"5px 12px",fontSize:11,cursor:"pointer",letterSpacing:0.3,flexShrink:0}}>
            {editFocus?"Done":"Edit Focus"}
          </button>
        </div>
        <div style={{display:"flex"}}>
          {[["today","Today"],["week","Week"],["ai","Check-In"],["arc","Year Arc"]].map(([k,l])=>(
            <button key={k} onClick={()=>setView(k)}
              style={{flex:1,padding:"10px 2px",background:"none",border:"none",
                borderBottom:view===k?`2px solid ${T.blue}`:"2px solid transparent",
                color:view===k?T.blue:T.textDim,fontSize:11,fontWeight:700,cursor:"pointer",
                textTransform:"uppercase",letterSpacing:1,transition:"color 0.2s",
                textShadow:view===k?shadow.glow(T.blue):"none"}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {editFocus&&<div style={{background:T.surface0,padding:"14px 16px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontSize:10,fontWeight:700,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12}}>
          Manual Focus Override
        </div>
        {[["COURSES","courses","course"],["BOOKS","books","book"]].map(([label,key,type])=>(
          <div key={key} style={{marginBottom:12}}>
            <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:7}}>{label}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {CURRICULUM.filter(i=>i.type===type&&getP(i.id).percentComplete<100).map(i=>{
                const on=(focus[key]||[]).includes(i.id),c=gc(i.genre);
                return <button key={i.id}
                  onClick={()=>setFocus(f=>({...f,[key]:on?(f[key]||[]).filter(x=>x!==i.id):[...(f[key]||[]),i.id],manual:true}))}
                  style={{background:on?`${c}15`:T.surface2,border:`1px solid ${on?c+"40":T.surface3}`,
                    color:on?c:T.textDim,borderRadius:20,padding:"4px 10px",fontSize:10,
                    cursor:"pointer",fontWeight:on?700:400,boxShadow:on?`0 0 8px ${c}20`:"none",
                    transition:"all 0.2s"}}>
                  {i.id}
                </button>;
              })}
            </div>
          </div>
        ))}
      </div>}

      <div style={{padding:"16px 14px"}}>

        {view==="today"&&<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:11,color:T.textDim,letterSpacing:0.3}}>
              {weekH>=WEEKLY_TARGET?"🎯 Target hit — bonus mode"
                :planIsFromThisWeek?`Plan · ${getDayName()}`:"No plan yet — estimated"}
            </div>
            {planIsFromThisWeek&&weekH<WEEKLY_TARGET&&<button onClick={()=>runAdaptPlan()} disabled={adaptLoading}
              style={{background:"none",border:`1px solid ${T.surface3}`,
                color:adaptLoading?T.textDim:T.blue,borderRadius:8,padding:"4px 10px",
                fontSize:10,cursor:"pointer",fontWeight:700,letterSpacing:0.3}}>
              {adaptLoading?"…":"⚡ Adapt"}
            </button>}
          </div>

          {today.length===0&&weekH<WEEKLY_TARGET&&<Card style={{padding:20,textAlign:"center",marginBottom:10}}>
            <div style={{fontSize:13,color:T.textMid,marginBottom:8}}>No plan for today yet</div>
            <button onClick={()=>setView("ai")}
              style={{background:T.surface2,border:`1px solid ${T.blue}30`,color:T.blue,
                borderRadius:10,padding:"10px 20px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              Generate Week Plan →
            </button>
          </Card>}

          {today.map(item=>{
            const p=getP(item.id),c=gc(item.genre);
            const isDone=p.percentComplete>=100;
            const todayStr=new Date().toLocaleDateString();
            const loggedTodayH=(p.sessions||[]).filter(s=>s.date===todayStr).reduce((s,x)=>s+(x.studyHours||0),0);
            const remainingH=Math.max(0,parseFloat((item.allocRealH-loggedTodayH).toFixed(2)));
            const sessionDoneToday=loggedTodayH>0;
            const isComplete=isDone||(sessionDoneToday&&remainingH===0);
            return <Card key={item.id} accent={isComplete?T.green:c} glow style={{marginBottom:10,padding:16,opacity:isComplete?0.6:1}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div style={{flex:1,paddingRight:10}}>
                  <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>
                    {item.type==="course"?"Course":"Book"}
                    {sessionDoneToday&&!isComplete&&<span style={{marginLeft:8,color:T.blue}}>· {loggedTodayH}h logged</span>}
                    {isComplete&&<span style={{marginLeft:8,color:T.green}}>· ✓ Complete</span>}
                  </div>
                  <div style={{fontSize:14,fontWeight:700,letterSpacing:-0.2,lineHeight:1.3}}>{item.name}</div>
                  <div style={{marginTop:7}}><Pill color={isComplete?T.green:c} label={item.genre||item.id}/></div>
                  {item.planNote&&<div style={{fontSize:10,color:T.textDim,marginTop:7,lineHeight:1.4,fontStyle:"italic"}}>
                    {item.planNote}
                  </div>}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  {isComplete
                    ?<div style={{fontSize:22,fontWeight:900,color:T.green,letterSpacing:-1,textShadow:shadow.glow(T.green)}}>✓</div>
                    :<div>
                      <div style={{fontSize:22,fontWeight:900,color:remainingH<item.allocRealH?T.yellow:T.blue,letterSpacing:-1,
                        textShadow:shadow.glow(remainingH<item.allocRealH?T.yellow:T.blue)}}>
                        {remainingH}h
                      </div>
                      <div style={{fontSize:10,color:T.textDim,marginTop:2}}>
                        {sessionDoneToday?"remaining":"real study"}
                      </div>
                      {sessionDoneToday&&<div style={{fontSize:10,color:T.textDim,marginTop:1}}>
                        of {item.allocRealH}h planned
                      </div>}
                      {!sessionDoneToday&&item.type==="course"&&<div style={{fontSize:10,color:T.textDim,marginTop:1}}>
                        {item.contentGain}h content
                      </div>}
                    </div>}
                </div>
              </div>

              <div style={{background:T.surface0,borderRadius:10,padding:"10px 12px",marginBottom:12,
                border:`1px solid ${T.surface3}`}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:6}}>
                  <span style={{color:T.textDim}}>{(p.courseHoursComplete||0).toFixed(2)}h / {item.contentTotal}h content</span>
                  <span style={{color:T.textDim}}>{item.contentLeft.toFixed(2)}h left</span>
                </div>
                <Bar pct={p.percentComplete} color={isComplete?T.green:sessionDoneToday?T.yellow:c} height={4} glow/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginTop:5}}>
                  <span style={{color:T.textMid,fontWeight:600}}>Now: {p.percentComplete}%</span>
                  {!isComplete&&<span style={{color:sessionDoneToday?T.yellow:c,fontWeight:700,textShadow:`0 0 8px ${c}40`}}>
                    Target: {item.targetPct}%{sessionDoneToday?` · ${remainingH}h to go`:" after session"}
                  </span>}
                  {isComplete&&<span style={{color:T.green,fontWeight:700}}>✓ Done</span>}
                </div>
              </div>

              {!isComplete&&<div style={{marginBottom:8}}>
                <button onClick={()=>setLogging(item)}
                  style={{width:"100%",background:T.surface2,border:`1px solid ${T.surface3}`,
                    color:T.blue,borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  {sessionDoneToday?"+ Log Another Session":"+ Log Session"}
                </button>
              </div>}
              {!isComplete&&<button onClick={()=>setMarkCompleteConfirm(item)}
                style={{width:"100%",background:"none",border:`1px solid ${T.green}20`,
                  color:T.green,borderRadius:10,padding:"7px 0",fontSize:11,fontWeight:700,
                  cursor:"pointer",letterSpacing:0.3}}>
                ✓ Mark Complete &amp; Adapt
              </button>}
            </Card>;
          })}

          {weekH>=WEEKLY_TARGET&&<div>
            <Card style={{padding:"13px 14px",marginBottom:10,border:`1px solid ${T.green}15`}}>
              <div style={{fontSize:9,color:T.green,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:6}}>
                Bonus Mode
              </div>
              <div style={{fontSize:11,color:T.textDim,marginBottom:12,lineHeight:1.5}}>
                {weekH.toFixed(1)}h logged — weekly plan locked. Any session from here is purely extra.
              </div>
              {bonusItems?.items?.length>0&&<div>
                {bonusItems.note&&<div style={{fontSize:11,color:T.textMid,marginBottom:10,fontStyle:"italic",lineHeight:1.5}}>
                  {bonusItems.note}
                </div>}
                {bonusItems.items.map(it=>{
                  const item=CURRICULUM.find(i=>i.id===it.id);
                  if(!item) return null;
                  const p=getP(it.id);const c=gc(item.genre);
                  return <div key={it.id} style={{background:T.surface0,borderRadius:10,
                    padding:"10px 12px",marginBottom:8,borderLeft:`2px solid ${c}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                      <div style={{fontSize:12,fontWeight:600,flex:1,paddingRight:8}}>{item.name}</div>
                      <div style={{fontSize:13,fontWeight:800,color:T.blue,flexShrink:0}}>{it.realHours}h</div>
                    </div>
                    {it.focus&&<div style={{fontSize:10,color:T.textDim,lineHeight:1.4,marginBottom:8}}>{it.focus}</div>}
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:T.textDim,marginBottom:6}}>
                      <span>Now: {p.percentComplete}%</span>
                      {it.targetPct&&<span style={{color:c,fontWeight:700}}>→ {it.targetPct}% if done</span>}
                    </div>
                    <button onClick={()=>setLogging(item)}
                      style={{width:"100%",background:T.surface2,border:`1px solid ${T.surface3}`,
                        color:T.blue,borderRadius:8,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                      + Log Bonus Session
                    </button>
                  </div>;
                })}
                <button onClick={()=>setBonusItems(null)}
                  style={{background:"none",border:"none",color:T.textDim,fontSize:10,cursor:"pointer",marginTop:4}}>
                  Clear suggestions
                </button>
              </div>}
              {(!bonusItems?.items?.length)&&<button onClick={runBonusSuggestions} disabled={bonusLoading}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.green}20`,
                  color:bonusLoading?T.textDim:T.green,borderRadius:10,padding:"10px 0",
                  fontSize:12,fontWeight:700,cursor:"pointer"}}>
                {bonusLoading?"Thinking…":"⚡ Suggest Bonus Sessions"}
              </button>}
            </Card>
          </div>}
        </div>}

        {view==="week"&&<div>
          <div style={{fontSize:11,color:T.textDim,marginBottom:16,letterSpacing:0.3}}>
            {planIsFromThisWeek?"This week's plan":"Active focus"} · {weekH.toFixed(1)}h logged
            {weekH>=WEEKLY_TARGET&&<span style={{color:T.green,fontWeight:700}}> · 🎯 Target hit</span>}
          </div>

          {focusItems.filter(i=>getP(i.id).percentComplete<100&&getP(i.id).percentComplete>0).length>0&&
          <Card style={{padding:"13px 14px",marginBottom:12}}>
            <div style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,marginBottom:10}}>
              Projected Finish at Current Pace
            </div>
            {focusItems.filter(i=>getP(i.id).percentComplete<100&&getP(i.id).percentComplete>0).map(item=>{
              const realLeft=realHoursRemaining(item,getP(item.id));
              const weeksToFinish=avgWeeklyH>0?(realLeft/avgWeeklyH):null;
              const finishDate=weeksToFinish?new Date(Date.now()+weeksToFinish*7*24*60*60*1000)
                .toLocaleDateString("en-CA",{month:"short",day:"numeric"}):null;
              const c=gc(item.genre);
              return <div key={item.id} style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${T.surface2}`}}>
                <div>
                  <div style={{fontSize:11,fontWeight:600,color:T.text}}>{item.id} — {item.name.slice(0,32)}{item.name.length>32?"…":""}</div>
                  <div style={{fontSize:9,color:T.textDim,marginTop:2}}>{realLeft.toFixed(1)}h real left · {getP(item.id).percentComplete}% done</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  {finishDate&&<div style={{fontSize:12,fontWeight:800,color:c}}>{finishDate}</div>}
                  {weeksToFinish&&<div style={{fontSize:9,color:T.textDim}}>{weeksToFinish.toFixed(1)}w</div>}
                </div>
              </div>;
            })}
          </Card>}

          {planIsFromThisWeek&&weekPlan.days&&<Card style={{padding:"13px 14px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700}}>
                  {weekH>=WEEKLY_TARGET?"Week Plan (Complete)":"Week Schedule"}
                </div>
                {weekPlan.lastAdapted&&<div style={{fontSize:9,color:T.textDim,marginTop:2}}>
                  Adapted {new Date(weekPlan.lastAdapted).toLocaleDateString()}
                </div>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:13,fontWeight:900,
                  color:weekH>=WEEKLY_TARGET?T.green:T.textMid,
                  textShadow:weekH>=WEEKLY_TARGET?shadow.glow(T.green):"none"}}>
                  {weekH.toFixed(1)}h logged
                </div>
                {weekH<WEEKLY_TARGET&&<button onClick={()=>runAdaptPlan()} disabled={adaptLoading}
                  style={{background:"none",border:`1px solid ${T.surface3}`,
                    color:adaptLoading?T.textDim:T.blue,borderRadius:7,
                    padding:"3px 10px",fontSize:10,cursor:"pointer",fontWeight:700}}>
                  {adaptLoading?"…":"⚡ Adapt"}
                </button>}
              </div>
            </div>
            {weekPlan.days.map(day=>{
              const isToday=day.day===getDayName();
              const dayIdx=DAY_NAMES.indexOf(day.day);
              const todayIdx=getDayIdx();
              const isPast=dayIdx<todayIdx;
              const isFuture=dayIdx>todayIdx;
              if(weekH>=WEEKLY_TARGET&&isFuture) return null;
              const dayRealH=day.totalDayRealH||day.items?.reduce((s,i)=>s+(i.realHours||i.hours||0),0)||0;
              const dayDate=new Date(getMonday()+"T12:00:00");
              dayDate.setDate(dayDate.getDate()+dayIdx);
              const dayStr=dayDate.toLocaleDateString();
              const isDayDone=isPast||(isToday&&(day.items||[]).every(it=>getP(it.id).percentComplete>=100));
              return <div key={day.day} style={{marginBottom:14,opacity:isDayDone&&!isToday?0.45:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontSize:11,fontWeight:800,
                    color:isToday?T.blue:isPast?T.textMid:T.text,
                    textShadow:isToday?shadow.glow(T.blue):"none"}}>
                    {day.day}{isToday?" — Today":""}
                    {isDayDone&&<span style={{marginLeft:6,fontSize:9,color:T.green,fontWeight:700}}>✓</span>}
                  </div>
                  <div style={{fontSize:10,color:T.textDim}}>{dayRealH.toFixed(1)}h planned</div>
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
                  const liveTargetPct=f?targetPctAfterSession(f,p,it.realHours):it.targetPct;
                  return <div key={it.id} style={{background:T.surface0,borderRadius:10,
                    padding:"8px 12px",marginBottom:5,
                    borderLeft:`2px solid ${isComplete?T.green:wasLogged&&!isComplete?T.yellow:c}`,
                    boxShadow:shadow.card,opacity:isComplete?0.5:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{fontSize:12,fontWeight:600,flex:1,paddingRight:8,lineHeight:1.3,
                        color:isComplete?T.green:T.text}}>
                        {isComplete&&<span style={{marginRight:5}}>✓</span>}{f?.name||it.id}
                      </div>
                      <div style={{flexShrink:0,textAlign:"right"}}>
                        {isComplete
                          ?<div style={{fontSize:11,color:T.green,fontWeight:700}}>
                            {isDone?"Done":`${loggedOnDay.toFixed(1)}h logged`}
                          </div>
                          :wasLogged
                            ?<div>
                              <div style={{fontSize:13,fontWeight:800,color:T.yellow,textShadow:shadow.glow(T.yellow)}}>
                                {remainingH}h
                              </div>
                              <div style={{fontSize:9,color:T.textDim}}>remaining of {it.realHours}h</div>
                            </div>
                            :<div>
                              <div style={{fontSize:13,fontWeight:800,color:T.blue,textShadow:shadow.glow(T.blue)}}>
                                {it.realHours}h
                              </div>
                              {it.contentHours&&f?.type==="course"&&<div style={{fontSize:9,color:T.textDim}}>
                                {it.contentHours}h content
                              </div>}
                            </div>}
                      </div>
                    </div>
                    {!isComplete&&it.focus&&<div style={{fontSize:10,color:T.textDim,marginTop:3,lineHeight:1.4}}>{it.focus}</div>}
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,marginTop:5}}>
                      <span style={{color:isComplete?T.green:T.textDim,fontWeight:isComplete?700:400}}>
                        {p.percentComplete}%
                      </span>
                      {!isComplete&&<span style={{color:wasLogged?T.yellow:c,fontWeight:700}}>
                        → target {liveTargetPct}%{wasLogged&&remainingH>0?` · ${remainingH}h to go`:" after session"}
                      </span>}
                      {isComplete&&<span style={{color:T.green,fontWeight:700}}>✓</span>}
                    </div>
                    <Bar pct={p.percentComplete} color={isComplete?T.green:wasLogged?T.yellow:c} height={2} style={{marginTop:4}}/>
                  </div>;
                })}
              </div>;
            })}
            {weekH>=WEEKLY_TARGET&&<div style={{textAlign:"center",padding:"12px 0 4px",
              fontSize:11,color:T.green,fontWeight:700,letterSpacing:0.3,
              textShadow:shadow.glow(T.green)}}>
              🎯 {weekH.toFixed(1)}h — week done.
            </div>}
          </Card>}

          <div style={{fontSize:10,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:700}}>
            Log Sessions
          </div>
          {focusItems.filter(i=>getP(i.id).percentComplete<100).map(item=>{
            const p=getP(item.id),sessions=p.sessions||[],c=gc(item.genre);
            const contentLeft=Math.max(0,(item.hours||0)-(p.courseHoursComplete||0));
            const realLeft=contentToReal(item,contentLeft);
            return <Card key={item.id} accent={c} style={{marginBottom:10,padding:"13px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{flex:1,minWidth:0,paddingRight:10}}>
                  <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:3}}>
                    {item.type==="course"?"Course":"Book"}
                  </div>
                  <div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {item.name}
                  </div>
                  <div style={{fontSize:9,color:T.textDim,marginTop:2}}>
                    {item.id} · {(p.courseHoursComplete||0).toFixed(2)}h/{item.hours}h · {realLeft.toFixed(1)}h real left
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:15,fontWeight:800,color:c,textShadow:`0 0 10px ${c}40`}}>
                      {p.percentComplete}%
                    </div>
                    <div style={{fontSize:9,color:T.textDim,marginTop:1}}>{realLeft.toFixed(1)}h left</div>
                  </div>
                  <button onClick={()=>setLogging(item)}
                    style={{background:T.surface2,border:`1px solid ${T.surface3}`,color:T.blue,
                      borderRadius:8,padding:"7px 12px",fontSize:11,cursor:"pointer",fontWeight:700}}>
                    Log
                  </button>
                </div>
              </div>
              <Bar pct={p.percentComplete} color={c} glow/>
              {sessions.length>0&&<SessionHistory item={item} sessions={sessions}
                onEdit={idx=>openEditSession(item.id,idx)}/>}
            </Card>;
          })}
        </div>}

        {view==="ai"&&<div>
          <div style={{fontSize:11,color:T.textDim,marginBottom:16,letterSpacing:0.3}}>
            Weekly check-in · AI coach with memory
          </div>

          <Card style={{padding:"13px 14px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:11,fontWeight:700,color:T.textMid,letterSpacing:0.5}}>Learning Profile</div>
              <button onClick={()=>setEditProfile(e=>!e)}
                style={{background:"none",border:"none",color:T.textDim,fontSize:11,cursor:"pointer",fontWeight:600}}>
                {editProfile?"Done":"Edit"}
              </button>
            </div>
            {editProfile&&<textarea value={profile} onChange={e=>setProfile(e.target.value)}
              style={{...inputSt,fontSize:11,height:160,resize:"none",marginTop:10,lineHeight:1.6}}/>}
          </Card>

          {weekLogs.length>0&&<Card style={{padding:"13px 14px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showHistory?10:0}}>
              <div style={{fontSize:11,fontWeight:700,color:T.textMid,letterSpacing:0.5}}>
                Week History <span style={{color:T.textDim,fontWeight:400}}>({weekLogs.length})</span>
              </div>
              <button onClick={()=>setShowHistory(s=>!s)}
                style={{background:"none",border:"none",color:T.textDim,fontSize:11,cursor:"pointer",fontWeight:600}}>
                {showHistory?"Hide":"Show"}
              </button>
            </div>
            {showHistory&&weekLogs.map((l,i)=>(
              <div key={i} style={{borderTop:`1px solid ${T.surface2}`,paddingTop:10,marginTop:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <div style={{fontSize:10,fontWeight:700,color:T.blue}}>{l.date}</div>
                  <div style={{fontSize:10,fontWeight:700,color:l.hoursLogged>=WEEKLY_TARGET?T.green:T.textMid}}>
                    {(l.hoursLogged||0).toFixed(1)}h
                  </div>
                </div>
                {l.assessment&&<div style={{fontSize:11,color:T.textMid,lineHeight:1.5,marginBottom:4}}>{l.assessment}</div>}
                {l.insight&&<div style={{fontSize:10,color:T.pink,fontStyle:"italic"}}>{l.insight}</div>}
              </div>
            ))}
          </Card>}

          {(weeklySummary||summaryLoading)&&<Card accent={T.yellow} style={{padding:"13px 14px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:9,color:T.yellow,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700}}>
                Sunday Review
              </div>
              {!summaryLoading&&<button onClick={()=>setWeeklySummary(null)}
                style={{background:"none",border:"none",color:T.textDim,fontSize:11,cursor:"pointer"}}>✕</button>}
            </div>
            {summaryLoading?<div style={{fontSize:12,color:T.textDim}}>Generating…</div>
              :<div style={{fontSize:13,color:"#bbb",lineHeight:1.65}}>{weeklySummary}</div>}
          </Card>}

          <Card style={{padding:"13px 14px",marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:T.textMid,letterSpacing:0.5,marginBottom:8}}>
              What happened this week?
            </div>
            <textarea value={weekNote} onChange={e=>setWeekNote(e.target.value)}
              placeholder="Energy, what you finished, missed days, life context..."
              style={{...inputSt,fontSize:12,resize:"none",height:76,lineHeight:1.5}}/>
          </Card>

          {planIsFromThisWeek&&<div style={{background:T.surface1,borderRadius:12,padding:"10px 14px",
            marginBottom:12,border:`1px solid ${T.green}20`,
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:T.green,letterSpacing:0.5}}>✓ Week plan active</div>
              <div style={{fontSize:10,color:T.textDim,marginTop:2}}>
                Generated {new Date(weekPlan.generatedAt).toLocaleDateString()} · {weekPlan.totalPlannedHours}h
                {weekPlan.lastAdapted?` · Adapted ${new Date(weekPlan.lastAdapted).toLocaleDateString()}`:""}
              </div>
            </div>
            {weekH<WEEKLY_TARGET&&<button onClick={()=>runAdaptPlan()} disabled={adaptLoading}
              style={{background:"none",border:`1px solid ${T.blue}30`,color:T.blue,
                borderRadius:8,padding:"5px 12px",fontSize:11,cursor:"pointer",fontWeight:700}}>
              {adaptLoading?"…":"⚡ Adapt"}
            </button>}
          </div>}

          <button onClick={()=>runFullCheckin(false)} disabled={aiLoading}
            style={{width:"100%",background:aiLoading?T.surface1:T.surface2,
              border:`1px solid ${aiLoading?T.surface3:T.blue+"40"}`,
              color:aiLoading?T.textDim:T.blue,borderRadius:10,padding:13,fontSize:14,
              fontWeight:800,cursor:aiLoading?"default":"pointer",marginBottom:16,
              letterSpacing:0.3,boxShadow:aiLoading?"none":`0 0 20px ${T.blue}15`,transition:"all 0.2s"}}>
            {aiLoading?"Thinking…":planIsFromThisWeek?"↺ Regenerate Week Plan":"Run Weekly Check-In"}
          </button>

          {aiResult&&<div>
            {[["assessment",T.blue,"Assessment"],["insight",T.pink,"Insight"],["nextMilestone",T.green,"Next Milestone"]]
              .map(([k,c,label])=>aiResult[k]&&<Card key={k} accent={c} style={{padding:"13px 14px",marginBottom:10}}>
                <div style={{fontSize:9,color:c,textTransform:"uppercase",letterSpacing:1.5,marginBottom:7,
                  fontWeight:700,textShadow:`0 0 8px ${c}60`}}>{label}</div>
                <div style={{fontSize:13,color:"#bbb",lineHeight:1.65}}>{aiResult[k]}</div>
              </Card>)}

            {aiResult.quickNote&&<Card style={{padding:"13px 14px",marginBottom:10,border:`1px solid ${T.blue}20`}}>
              <div style={{fontSize:9,color:T.blue,textTransform:"uppercase",letterSpacing:1.5,marginBottom:7,fontWeight:700}}>Adapt Note</div>
              <div style={{fontSize:13,color:"#bbb",lineHeight:1.65}}>{aiResult.quickNote}</div>
            </Card>}

            {aiResult.focusProposal&&<Card style={{padding:"13px 14px",marginBottom:10,border:`1px solid ${T.pink}20`}}>
              <div style={{fontSize:9,color:T.pink,textTransform:"uppercase",letterSpacing:1.5,
                marginBottom:12,fontWeight:700,textShadow:`0 0 8px ${T.pink}60`}}>
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
                      <div style={{width:5,height:5,borderRadius:"50%",flexShrink:0,
                        background:current?T.surface3:T.green,
                        boxShadow:!current?`0 0 6px ${T.green}60`:"none"}}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,fontWeight:600}}>{item.id} — {item.name}</div>
                        <div style={{fontSize:9,color:T.textDim,marginTop:1}}>
                          {item.genre} · {p.percentComplete}% · {realHoursRemaining(item,p).toFixed(1)}h real left
                        </div>
                      </div>
                      {!current&&<span style={{fontSize:9,color:T.green,fontWeight:700,letterSpacing:0.5}}>NEW</span>}
                    </div>:null;
                  })}
                </div>
              ))}
              {aiResult.focusProposal.reasoning&&<div style={{fontSize:11,color:T.textMid,marginBottom:14,
                lineHeight:1.6,fontStyle:"italic"}}>{aiResult.focusProposal.reasoning}</div>}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setAiResult(r=>({...r,focusProposal:null}))}
                  style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                    color:T.textMid,borderRadius:10,padding:12,fontSize:13,cursor:"pointer"}}>
                  Keep Current
                </button>
                <button onClick={()=>applyFocusProposal(aiResult.focusProposal)}
                  style={{flex:2,background:"#0a180a",border:`1px solid ${T.green}30`,color:T.green,
                    borderRadius:10,padding:12,fontSize:13,fontWeight:800,cursor:"pointer",
                    boxShadow:`0 0 16px ${T.green}15`}}>
                  Apply New Focus ✓
                </button>
              </div>
            </Card>}
          </div>}
        </div>}

        {view==="arc"&&<div>
          <Card style={{marginBottom:16,padding:16}}>
            <div style={{fontSize:9,fontWeight:700,color:T.textDim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:14}}>
              Curriculum Overview
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
              {[[doneItems,"Completed",T.green],
                [CURRICULUM.filter(i=>getP(i.id).percentComplete>0&&getP(i.id).percentComplete<100).length,"In Progress",T.blue],
                [CURRICULUM.filter(i=>getP(i.id).percentComplete===0).length,"Untouched",T.textDim],
                [totalItems,"Total Items",T.textMid]].map(([v,l,c])=>(
                <div key={l} style={{background:T.surface0,borderRadius:12,padding:"12px 14px",
                  border:`1px solid ${T.border}`,boxShadow:shadow.card}}>
                  <div style={{fontSize:24,fontWeight:900,color:c,letterSpacing:-1,
                    textShadow:c!==T.textDim&&c!==T.textMid?`0 0 12px ${c}40`:"none"}}>{v}</div>
                  <div style={{fontSize:10,color:T.textDim,marginTop:2,letterSpacing:0.3}}>{l}</div>
                </div>
              ))}
            </div>

            <div style={{background:T.surface0,borderRadius:12,padding:"12px 14px",marginBottom:12,
              border:`1px solid ${T.border}`}}>
              <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:700}}>
                Personal Bests
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[[bestWeek.toFixed(1)+"h","Best Week",T.blue],
                  [currentStreak+"wk","Current Streak",currentStreak>0?T.green:T.textDim],
                  [longestStreak+"wk","Longest Streak",T.yellow]].map(([v,l,c])=>(
                  <div key={l} style={{textAlign:"center"}}>
                    <div style={{fontSize:18,fontWeight:900,color:c,textShadow:c!==T.textDim?`0 0 10px ${c}40`:"none"}}>{v}</div>
                    <div style={{fontSize:9,color:T.textDim,marginTop:2}}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{background:T.surface0,borderRadius:12,padding:"12px 14px",marginBottom:12,
              border:`1px solid ${T.border}`}}>
              <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:700}}>
                12-Week Hours
              </div>
              <div style={{display:"flex",alignItems:"flex-end",gap:3,height:56}}>
                {chartWeeks.map((w,i)=>{
                  const pct=w.h/chartMax;
                  const isTarget=w.h>=WEEKLY_TARGET;
                  const isCurrent=i===11;
                  return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <div style={{width:"100%",background:isTarget?T.green:isCurrent?T.blue:T.surface3,
                      height:`${Math.max(pct*44,w.h>0?4:1)}px`,borderRadius:"3px 3px 0 0",
                      boxShadow:isTarget?`0 0 6px ${T.green}60`:isCurrent?`0 0 6px ${T.blue}60`:"none",
                      transition:"height 0.3s ease"}}/>
                    <div style={{fontSize:7,color:isCurrent?T.blue:T.textFaint,letterSpacing:-0.3}}>{w.label.slice(3)}</div>
                  </div>;
                })}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:T.textDim,marginTop:6}}>
                <span>12 weeks ago</span>
                <span style={{color:T.blue}}>This week: {weekH.toFixed(1)}h</span>
              </div>
            </div>

            {genreBalance.length>0&&<div style={{background:T.surface0,borderRadius:12,padding:"12px 14px",marginBottom:12,
              border:`1px solid ${T.border}`}}>
              <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:700}}>
                Genre Balance (real hrs)
              </div>
              {genreBalance.map(([genre,h])=>{
                const c=gc(genre);
                const pct=h/genreBalance[0][1]*100;
                return <div key={genre} style={{marginBottom:7}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}>
                    <span style={{color:c,fontWeight:600}}>{genre}</span>
                    <span style={{color:T.textDim}}>{h.toFixed(1)}h</span>
                  </div>
                  <Bar pct={pct} color={c} height={3}/>
                </div>;
              })}
            </div>}

            <div style={{background:T.surface0,borderRadius:12,padding:"12px 14px",marginBottom:12,
              border:`1px solid ${T.border}`,boxShadow:shadow.card}}>
              <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>
                Real Study Hours Logged
              </div>
              <div style={{fontSize:28,fontWeight:900,color:T.blue,letterSpacing:-1,textShadow:shadow.glow(T.blue)}}>
                {totalSpentRealH.toFixed(1)}<span style={{fontSize:12,color:T.textDim,fontWeight:400}}> hrs</span>
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.textDim,marginBottom:5}}>
                <span>Items completed</span>
                <span style={{color:T.textMid,fontWeight:600}}>{doneItems} of {totalItems}</span>
              </div>
              <Bar pct={(doneItems/totalItems)*100} color={T.green} height={5} glow/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,
              paddingTop:10,borderTop:`1px solid ${T.surface2}`}}>
              <span style={{color:T.textDim}}>Est. completion at 20h/week</span>
              <span style={{color:T.yellow,fontWeight:700,textShadow:shadow.glow(T.yellow)}}>{estDate}</span>
            </div>
          </Card>

          {SECTIONS.map(sec=>(
            <SectionBlock key={sec.label} sec={sec} focusIds={focusIds} getP={getP} setLogging={setLogging}
              onReset={item=>{
                if(!window.confirm(`Reset "${item.name}" to 0%?`)) return;
                const sessions=getP(item.id).sessions||[];
                const mon=new Date(getMonday()),sun=new Date(mon);sun.setDate(mon.getDate()+6);
                const thisWeekH=sessions.filter(s=>{const d=new Date(s.date);return d>=mon&&d<=sun;})
                  .reduce((s,x)=>s+(x.studyHours||0),0);
                setProgress(prev=>{const copy={...prev};delete copy[item.id];return copy;});
                if(thisWeekH>0) setWeek(w=>({...w,hoursLogged:Math.max(0,(w.hoursLogged||0)-thisWeekH)}));
                setCompletionBanner(b=>b.filter(id=>id!==item.id));
              }}
            />
          ))}

          <Card style={{padding:"14px 16px",marginTop:8}}>
            <div style={{fontSize:9,fontWeight:700,color:T.textDim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:12}}>
              Data Backup
            </div>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <button onClick={()=>{
                const data={progress,week,focus,weekLogs,profile,weekPlan,weeklyHours};
                const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
                const url=URL.createObjectURL(blob);
                const a=document.createElement("a");a.href=url;
                a.download=`the-preparation-${getTodayISO()}.json`;a.click();URL.revokeObjectURL(url);
                localStorage.setItem("tp_last_export",String(Date.now()));
                toast_("✓ Data exported");
              }} style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                color:T.textMid,borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                Export JSON
              </button>
              <button onClick={()=>{
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
                      if(d.weekLogs) setWeekLogs(d.weekLogs);
                      if(d.profile) setProfile(d.profile);
                      if(d.weekPlan) setWeekPlan(d.weekPlan);
                      if(d.weeklyHours) setWeeklyHours(d.weeklyHours);
                      toast_("✓ Data imported");
                    }catch{toast_("Import failed");}
                  };reader.readAsText(file);
                };inp.click();
              }} style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                color:T.textMid,borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                Import JSON
              </button>
            </div>
            <button onClick={()=>{
              if(!window.confirm("Clear ALL data? Export first if you want a backup.")) return;
              if(!window.confirm("Are you sure? This cannot be undone.")) return;
              [SK_P,SK_W,SK_F,SK_LOG,SK_PROFILE,SK_PLAN,SK_QUEUE,SK_WEEKLY_HOURS,"tp_bonus1","tp_monday_seed","tp_last_export"]
                .forEach(k=>localStorage.removeItem(k));
              setProgress({});
              setWeek({weekStart:getMonday(),hoursLogged:0});
              setFocus({courses:["A1"],books:["B99","B34"]});
              setWeekLogs([]);
              setProfile(DEFAULT_PROFILE);
              setWeekPlan(null);
              setWeeklyHours([]);
              setBonusItems([]);
              setOfflineQueue([]);
              setWeeklySummary(null);
              toast_("✓ All data cleared");
            }} style={{width:"100%",background:"#180a0a",border:`1px solid ${T.red}20`,
              color:T.red,borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              Clear All Data
            </button>
          </Card>
        </div>}
      </div>

      {markCompleteConfirm&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",
        display:"flex",alignItems:"flex-end",zIndex:100,backdropFilter:"blur(4px)"}}>
        <div style={{background:T.surface1,borderRadius:"18px 18px 0 0",padding:24,width:"100%",
          boxSizing:"border-box",borderTop:`3px solid ${T.green}`,boxShadow:shadow.raised}}>
          <div style={{fontSize:16,fontWeight:800,marginBottom:6}}>Mark Complete?</div>
          <div style={{fontSize:12,color:T.textMid,marginBottom:6}}>{markCompleteConfirm.name}</div>
          <div style={{fontSize:11,color:T.textDim,marginBottom:20,lineHeight:1.5}}>
            This will log remaining content hours, mark it 100%, and adapt the plan.
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setMarkCompleteConfirm(null)}
              style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                color:T.textMid,borderRadius:10,padding:12,fontSize:13,cursor:"pointer"}}>Cancel</button>
            <button onClick={()=>markItemComplete(markCompleteConfirm)}
              style={{flex:2,background:"#0a180a",border:`1px solid ${T.green}30`,color:T.green,
                borderRadius:10,padding:12,fontSize:13,fontWeight:800,cursor:"pointer",
                boxShadow:`0 0 16px ${T.green}15`}}>
              Complete &amp; Adapt ✓
            </button>
          </div>
        </div>
      </div>}

      {editSession&&(()=>{
        const{itemId,sessionIdx}=editSession;
        const item=CURRICULUM.find(i=>i.id===itemId);
        return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",
          display:"flex",alignItems:"flex-end",zIndex:100,backdropFilter:"blur(4px)"}}>
          <div style={{background:T.surface1,borderRadius:"18px 18px 0 0",
            padding:24,width:"100%",boxSizing:"border-box",
            borderTop:`3px solid ${T.blue}`,boxShadow:shadow.raised}}>
            <div style={{fontSize:16,fontWeight:800,letterSpacing:-0.3,marginBottom:3}}>Edit Session</div>
            <div style={{fontSize:11,color:T.textDim,marginBottom:20}}>{item?.name} · session {sessionIdx+1}</div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>Real study hours</label>
              <input type="number" min="0.25" max="12" step="0.25" value={editSessionForm.hours}
                onChange={e=>setEditSessionForm(f=>({...f,hours:e.target.value}))} style={inputSt}/>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>
                Content hours {item?.type==="course"?"(real÷2)":"(= real for books)"}
              </label>
              <input type="number" min="0.1" max={item?.hours} step="0.1" value={editSessionForm.courseHours}
                onChange={e=>setEditSessionForm(f=>({...f,courseHours:e.target.value}))} style={inputSt}/>
            </div>
            <div style={{marginBottom:20}}>
              <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>Note</label>
              <input value={editSessionForm.note}
                onChange={e=>setEditSessionForm(f=>({...f,note:e.target.value}))}
                style={inputSt} placeholder="What did you cover?"/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={deleteSession}
                style={{flex:1,background:"#180a0a",border:`1px solid ${T.red}30`,color:T.red,
                  borderRadius:10,padding:12,fontSize:13,fontWeight:700,cursor:"pointer"}}>Delete</button>
              <button onClick={()=>setEditSession(null)}
                style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                  color:T.textMid,borderRadius:10,padding:12,fontSize:13,cursor:"pointer"}}>Cancel</button>
              <button onClick={saveEditSession}
                style={{flex:2,background:"#0a1220",border:`1px solid ${T.blue}30`,color:T.blue,
                  borderRadius:10,padding:12,fontSize:13,fontWeight:800,cursor:"pointer",
                  boxShadow:`0 0 16px ${T.blue}15`}}>Save ✓</button>
            </div>
          </div>
        </div>;
      })()}

      {logging&&(()=>{
        const p=getP(logging.id);
        const contentDone=p.courseHoursComplete||0;
        const contentLeft=Math.max(0,(logging.hours||0)-contentDone);
        const realH=parseFloat(logForm.hours||0);
        const previewPct=realH>0?targetPctAfterSession(logging,p,realH):null;
        return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",
          display:"flex",alignItems:"flex-end",zIndex:100,backdropFilter:"blur(4px)"}}>
          <div style={{background:T.surface1,borderRadius:"18px 18px 0 0",
            padding:24,width:"100%",boxSizing:"border-box",
            borderTop:`3px solid ${gc(logging.genre)}`,boxShadow:shadow.raised}}>
            <div style={{fontSize:16,fontWeight:800,letterSpacing:-0.3,marginBottom:3}}>{logging.name}</div>
            <div style={{fontSize:11,color:T.textDim,marginBottom:4,letterSpacing:0.3}}>
              {logging.id} · {logging.type==="course"?"Course (1h content = 2h real)":"Book (1:1)"}
            </div>
            <div style={{fontSize:11,color:T.textDim,marginBottom:16}}>
              {contentDone.toFixed(2)}h / {logging.hours}h content · {p.percentComplete}% · {contentLeft.toFixed(2)}h content left
            </div>

            {confirmLog?(
              <div>
                <div style={{background:T.surface0,borderRadius:12,padding:14,marginBottom:16,
                  border:`1px solid ${T.surface3}`,boxShadow:shadow.card}}>
                  <div style={{fontSize:11,color:T.textDim,marginBottom:6}}>Confirm session</div>
                  <div style={{fontSize:15,fontWeight:700}}>
                    {logForm.hours}h real study
                    <span style={{color:T.blue}}> · {parseFloat(realToContent(logging,parseFloat(logForm.hours||0)).toFixed(3))}h content</span>
                  </div>
                  {previewPct&&<div style={{fontSize:12,color:gc(logging.genre),marginTop:5,fontWeight:600}}>
                    {p.percentComplete}% → {previewPct}%
                  </div>}
                  {logForm.note&&<div style={{fontSize:11,color:T.textMid,marginTop:5}}>{logForm.note}</div>}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setConfirmLog(false)}
                    style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                      color:T.textMid,borderRadius:10,padding:12,fontSize:14,cursor:"pointer"}}>Edit</button>
                  <button onClick={()=>submitLog()}
                    style={{flex:2,background:"#0a1220",border:`1px solid ${T.blue}30`,color:T.blue,
                      borderRadius:10,padding:12,fontSize:14,fontWeight:800,cursor:"pointer",
                      boxShadow:`0 0 20px ${T.blue}15`}}>Confirm ✓</button>
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
                      ⚠ Previous week — won't count toward this week's 20h
                    </div>:null;
                  })()}
                </div>
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>
                    Real study hours {logging.type==="course"?"(max 1.5h/session)":"(max 2h/session)"}
                  </label>
                  <input type="number" min="0.25" max={maxRealPerSession(logging)} step="0.25"
                    value={logForm.hours}
                    onChange={e=>{
                      const rh=e.target.value;
                      setLogForm(f=>({...f,hours:rh,
                        courseHours:f._contentManuallySet?f.courseHours:
                          rh?parseFloat(realToContent(logging,parseFloat(rh)).toFixed(3)).toString():""
                      }));
                    }}
                    style={inputSt} placeholder={logging.type==="course"?"e.g. 1.5":"e.g. 1.0"}/>
                  {realH>0&&<div style={{fontSize:11,color:T.blue,marginTop:5}}>
                    = {realToContent(logging,realH).toFixed(3)}h content at standard ratio
                    {previewPct?` → ${p.percentComplete}% → ${previewPct}%`:""}
                  </div>}
                </div>

                {logging.type==="course"&&<div style={{marginBottom:14}}>
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>
                    Content hours logged
                    <span style={{color:T.textDim,fontWeight:400}}> — adjust if ratio wasn't 1:2</span>
                  </label>
                  <input type="number" min="0.1" max={logging.hours} step="0.05"
                    value={logForm.courseHours}
                    onChange={e=>setLogForm(f=>({...f,courseHours:e.target.value,_contentManuallySet:true}))}
                    onFocus={()=>{
                      if(!logForm.courseHours&&logForm.hours){
                        setLogForm(f=>({...f,
                          courseHours:parseFloat(realToContent(logging,parseFloat(logForm.hours)).toFixed(3)).toString(),
                          _contentManuallySet:false
                        }));
                      }
                    }}
                    style={{...inputSt,border:`1px solid ${logForm._contentManuallySet?T.yellow+"60":T.surface3}`}}
                    placeholder={realH>0?`Standard: ${realToContent(logging,realH).toFixed(3)}h`:"Enter real hours first"}/>
                  {logForm._contentManuallySet&&logForm.courseHours&&logForm.hours&&<div style={{fontSize:11,color:T.yellow,marginTop:5}}>
                    ⚡ Custom ratio — {logForm.hours}h real → {logForm.courseHours}h content
                    {(()=>{
                      const ch=parseFloat(logForm.courseHours);
                      const tot=logging.hours||1;
                      const newPct=Math.round((Math.min((p.courseHoursComplete||0)+ch,tot)/tot)*100);
                      return ` → ${p.percentComplete}% → ${newPct}%`;
                    })()}
                  </div>}
                </div>}

                <div style={{marginBottom:20}}>
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6}}>Note (optional)</label>
                  <input value={logForm.note}
                    onChange={e=>setLogForm(f=>({...f,note:e.target.value}))}
                    style={inputSt} placeholder="What did you cover?"/>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{setLogging(null);setLogForm({hours:"",courseHours:"",note:"",date:new Date().toLocaleDateString(),_contentManuallySet:false});setConfirmLog(false);}}
                    style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                      color:T.textMid,borderRadius:10,padding:12,fontSize:14,cursor:"pointer"}}>Cancel</button>
                  <button onClick={()=>submitLog()}
                    style={{flex:2,background:"#0a1220",border:`1px solid ${T.blue}30`,color:T.blue,
                      borderRadius:10,padding:12,fontSize:14,fontWeight:800,cursor:"pointer",
                      boxShadow:`0 0 20px ${T.blue}15`}}>Review →</button>
                </div>
              </div>
            )}
          </div>
        </div>;
      })()}
    </div>
  );
}

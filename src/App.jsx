import { useState, useEffect, useRef } from "react";

const WEEKLY_TARGET = 20; // real study hours

// ── Time math helpers ─────────────────────────────────────────────
// Courses: 1h content = 2h real study (1:2 ratio)
// Books:   1h content = 1h real study (1:1 ratio)
const contentToReal = (item, contentH) =>
  item.type === "course" ? contentH * 2 : contentH;
const realToContent = (item, realH) =>
  item.type === "course" ? realH / 2 : realH;
// Max real hours per session
const maxRealPerSession = (item) => item.type === "course" ? 1.5 : 2.0;
// Max content progress per session
const maxContentPerSession = (item) =>
  realToContent(item, maxRealPerSession(item)); // course: 0.75h content, book: 2h
// Real hours remaining for an item
const realHoursRemaining = (item, p) => {
  const contentDone = p.courseHoursComplete || 0;
  const contentLeft = Math.max(0, (item.hours || 0) - contentDone);
  return contentToReal(item, contentLeft);
};
// Target % after a session of given real hours
const targetPctAfterSession = (item, p, sessionRealH) => {
  const contentDone = p.courseHoursComplete || 0;
  const contentGain = realToContent(item, sessionRealH);
  const newContent = Math.min(contentDone + contentGain, item.hours || 1);
  return Math.round((newContent / (item.hours || 1)) * 100);
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

const SK_P="tp_p4",SK_W="tp_w4",SK_F="tp_f4",SK_LOG="tp_wlog3",SK_PROFILE="tp_profile2";
const SK_PLAN="tp_plan2";
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
  blue:"#60a5fa",green:"#4ade80",pink:"#f472b6",yellow:"#facc15",red:"#ef4444",
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

function SectionBlock({sec,focusIds,getP,setLogging}){
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
          <div style={{flexShrink:0,textAlign:"right"}}>
            {isTouched&&<div style={{fontSize:11,fontWeight:700,color:c,textShadow:`0 0 8px ${c}40`}}>{p.percentComplete}%</div>}
            {isDone&&<div style={{fontSize:13,color:T.green}}>✓</div>}
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

// ── Build AI context string (shared by all AI calls) ──────────────
function buildItemContext(item, p) {
  const contentDone = p.courseHoursComplete || 0;
  const contentLeft = Math.max(0, (item.hours || 0) - contentDone);
  const realLeft = contentToReal(item, contentLeft);
  const realSpent = p.hoursSpent || 0;
  return `${item.id} "${item.name}" (${item.type}, ${item.section}, ${item.genre}): `
    + `totalContent=${item.hours}h | contentDone=${contentDone.toFixed(2)}h | pct=${p.percentComplete}% | `
    + `contentLeft=${contentLeft.toFixed(2)}h | realHoursLeft=${realLeft.toFixed(2)}h | realSpent=${realSpent.toFixed(2)}h`;
}

// ── App ───────────────────────────────────────────────────────────
export default function App(){
  const [progress,setProgress]=useState(()=>load(SK_P,{}));
  const [week,setWeek]=useState(()=>{
    const w=load(SK_W,{weekStart:getMonday(),hoursLogged:0}),mon=getMonday();
    return w.weekStart!==mon?{weekStart:mon,hoursLogged:0}:w;
  });
  const [focus,setFocus]=useState(()=>{
    const f=load(SK_F,{courses:["A1"],books:["B99","B34"]});
    if(f.primary!==undefined) return{courses:[f.primary,f.secondary].filter(Boolean),books:f.books||[]};
    return f;
  });
  const [weekPlan,setWeekPlan]=useState(()=>load(SK_PLAN,null));
  const [view,setView]=useState("today");
  const [logging,setLogging]=useState(null);
  const [logForm,setLogForm]=useState({hours:"",courseHours:"",note:"",date:new Date().toLocaleDateString()});
  const [confirmLog,setConfirmLog]=useState(false);
  const [toast,setToast]=useState(null);
  const [aiLoading,setAiLoading]=useState(false);
  const [adaptLoading,setAdaptLoading]=useState(false);
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
  const prevProgressRef=useRef({});

  useEffect(()=>save(SK_P,progress),[progress]);
  useEffect(()=>save(SK_W,week),[week]);
  useEffect(()=>save(SK_F,focus),[focus]);
  useEffect(()=>save(SK_LOG,weekLogs),[weekLogs]);
  useEffect(()=>save(SK_PLAN,weekPlan),[weekPlan]);
  useEffect(()=>localStorage.setItem(SK_PROFILE,profile),[profile]);

  useEffect(()=>{
    const check=()=>{
      const mon=getMonday();
      setWeek(w=>w.weekStart!==mon?{weekStart:mon,hoursLogged:0}:w);
    };
    check();const t=setInterval(check,60000);return()=>clearInterval(t);
  },[]);

  // Auto-generate on Monday ≥7am if no plan yet
  useEffect(()=>{
    requestNotificationPermission();
    if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
    const now=new Date();
    const isMonday=now.getDay()===1;
    const isAfter7=now.getHours()>=7;
    const planExistsThisWeek=weekPlan&&weekPlan.weekStart===getMonday();
    if(isMonday&&isAfter7&&!planExistsThisWeek){
      setTimeout(()=>runFullCheckin(true),1500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Missed day detection
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Today's items from plan
  const todayItems=()=>{
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
          return{...item,
            allocRealH:realH,
            contentGain:parseFloat(contentGain.toFixed(2)),
            targetPct,
            contentDone:parseFloat(contentDone.toFixed(2)),
            contentTotal:item.hours,
            contentLeft:parseFloat(contentLeft.toFixed(2)),
            planNote:it.focus||null};
        }).filter(Boolean);
      }
    }
    // Fallback
    if(weekH>=WEEKLY_TARGET) return[];
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

  // Build full progress context for AI
  const buildAIContext=()=>{
    const recentHistory=weekLogs.slice(0,4).map((l,i)=>
      `WEEK ${i+1} AGO (${l.date}): ${(l.hoursLogged||0).toFixed(1)}h real. Note:"${l.note||"none"}". Assessment:"${l.assessment||""}". Focus:${l.focusBefore?.join(", ")||""}.`
    ).join("\n");

    // All touched + focus items with full math context
    const touchedAndFocus=CURRICULUM
      .filter(i=>getP(i.id).percentComplete>0||focusIds.includes(i.id))
      .map(i=>buildItemContext(i,getP(i.id)))
      .join("\n");

    // Next untouched Core items (for planning new additions)
    const nextCore=CURRICULUM
      .filter(i=>i.section==="Core"&&getP(i.id).percentComplete===0&&!focusIds.includes(i.id))
      .slice(0,12)
      .map(i=>{
        const realH=contentToReal(i,i.hours||0);
        return `${i.id} "${i.name}" (${i.type}, ${i.genre}): ${i.hours}h content = ${realH}h real`;
      })
      .join("\n");

    return{recentHistory,touchedAndFocus,nextCore};
  };

  const runFullCheckin=async(auto=false)=>{
    setAiLoading(true);setAiResult(null);
    const{recentHistory,touchedAndFocus,nextCore}=buildAIContext();

    const prompt=`You are a precision learning coach. You MUST follow the time math rules exactly.

═══ TIME MATH RULES ═══
- COURSES: 1h content = 2h real study. Max 1.5h real per session = 0.75h content progress.
- BOOKS: 1h content = 1h real study. Max 2h real per session = 2h content progress.
- Weekly budget: 20 real study hours across 7 days.
- "realHoursLeft" in the item data = exact real hours still needed to finish that item.
- NEVER use hoursSpent as a proxy for content progress — they are tracked separately.
- Session target%: (contentDone + sessionContentGain) / totalContent × 100

═══ LEARNER PROFILE ═══
${profile}

═══ PAST WEEKS ═══
${recentHistory||"No previous check-ins."}

═══ TODAY ═══
${getDayName()}, ${new Date().toLocaleDateString()}
Real hours logged this week so far: ${weekH.toFixed(2)}h / ${WEEKLY_TARGET}h
Remaining budget: ${wkRem.toFixed(2)}h real over ${dLeft} day(s)

═══ CURRENT FOCUS ═══
${focusIds.join(", ")}
LEARNER NOTE: "${weekNote||"none"}"

═══ ACTIVE / IN-PROGRESS ITEMS (with full math) ═══
${touchedAndFocus||"None yet."}

═══ NEXT UNTOUCHED CORE ITEMS AVAILABLE ═══
${nextCore}

═══ PLANNING INSTRUCTIONS ═══
1. Build a 7-day plan (Mon–Sun) totalling exactly ${WEEKLY_TARGET}h real study.
2. Each day: 2-4 sessions, no single day over 4h real, vary genres.
3. For each session specify:
   - realHours: real study hours (course max 1.5, book max 2.0)
   - contentHours: content progress = realHours÷2 for courses, realHours÷1 for books
   - targetPct: (contentDone + contentHours) / totalContent × 100 — show this as the goal
   - focus: specific instruction (e.g. "Continue from 38% — target nervous system section, reach 47%")
4. Select items from current focus + next logical Core items. Use ALL 20h.
5. If an item will finish this week, include the final sessions and add its logical successor.
6. Suggest updated focusProposal reflecting items active in the plan.

Respond ONLY with valid JSON, no markdown:
{
  "assessment": "...",
  "insight": "...",
  "nextMilestone": "...",
  "focusProposal": {"courses": ["A1"], "books": ["B34","B99"], "reasoning": "..."},
  "days": [
    {
      "day": "Mon",
      "totalDayRealH": 2.5,
      "items": [
        {
          "id": "A1",
          "realHours": 1.5,
          "contentHours": 0.75,
          "targetPct": 44,
          "focus": "Continue from 38% — nervous system basics, reach ~44%"
        }
      ]
    }
  ],
  "totalPlannedHours": 20
}`;

    try{
      const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:3000,messages:[{role:"user",content:prompt}]})});
      const d=await r.json();
      const txt=d.content.map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(txt);
      const plan={weekStart:getMonday(),generatedAt:new Date().toISOString(),
        days:parsed.days,totalPlannedHours:parsed.totalPlannedHours,isBaseplan:true};
      setWeekPlan(plan);
      setAiResult(parsed);
      saveWeekLog(parsed);
      if(auto) showPlanReadyNotification();
    }catch(e){toast_("Couldn't generate — try again");}
    setAiLoading(false);
  };

  const runAdaptPlan=async(contextNote="")=>{
    setAdaptLoading(true);
    const{touchedAndFocus,nextCore}=buildAIContext();
    const remainingDays=DAY_NAMES.slice(getDayIdx());
    const pastDays=(weekPlan?.days||[]).filter(d=>!remainingDays.includes(d.day));
    const pastRealH=pastDays.reduce((s,d)=>s+(d.totalDayRealH||d.items?.reduce((ss,i)=>ss+(i.realHours||i.hours||0),0)||0),0);
    const existingRemaining=(weekPlan?.days||[]).filter(d=>remainingDays.includes(d.day));

    const prompt=`You are a precision learning coach adapting an existing week plan mid-week.

═══ TIME MATH RULES ═══
- COURSES: 1h content = 2h real. Max 1.5h real per session = 0.75h content.
- BOOKS: 1h content = 1h real. Max 2h real per session = 2h content.
- targetPct = (contentDone + sessionContentGain) / totalContent × 100

═══ ADAPTATION CONTEXT ═══
Today: ${getDayName()}. Remaining days: ${remainingDays.join(", ")}.
Real hours logged this week: ${weekH.toFixed(2)}h. Still needed: ${wkRem.toFixed(2)}h real.
${contextNote?`Reason for adapt: ${contextNote}`:"Learner requested mid-week adaptation."}

═══ CURRENT FOCUS ═══
${focusIds.join(", ")}

═══ CURRENT ITEM STATUS ═══
${touchedAndFocus||"None."}

═══ NEXT UNTOUCHED CORE ITEMS ═══
${nextCore}

═══ EXISTING REMAINING PLAN (days not yet passed) ═══
${JSON.stringify(existingRemaining,null,1)}

═══ INSTRUCTIONS ═══
1. Keep the spirit of the Monday base plan — same items unless one is now complete or clearly stalled.
2. Swap out any item that hit 100% since Monday. Pull in its logical curriculum successor.
3. Redistribute ${wkRem.toFixed(2)}h real across: ${remainingDays.join(", ")}.
4. Use correct time math for every session. Show targetPct for each session.
5. Total planned hours for remaining days must equal exactly ${wkRem.toFixed(2)}h.

Respond ONLY with valid JSON, no markdown:
{
  "days": [{"day":"${getDayName()}","totalDayRealH":2.5,"items":[{"id":"A1","realHours":1.5,"contentHours":0.75,"targetPct":44,"focus":"..."}]}],
  "totalPlannedHours": ${wkRem.toFixed(2)},
  "note": "one sentence on what changed",
  "focusProposal": {"courses":["A1"],"books":["B34","B99"],"reasoning":"..."}
}`;

    try{
      const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:2000,messages:[{role:"user",content:prompt}]})});
      const d=await r.json();
      const txt=d.content.map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(txt);
      // Merge: keep past days intact, replace remaining days with adapted plan
      const keptDays=(weekPlan?.days||[]).filter(d=>!remainingDays.includes(d.day));
      const newPlan={
        ...weekPlan,
        days:[...keptDays,...(parsed.days||[])],
        totalPlannedHours:parseFloat((pastRealH+(parsed.totalPlannedHours||0)).toFixed(2)),
        lastAdapted:new Date().toISOString()
      };
      setWeekPlan(newPlan);
      if(parsed.focusProposal){
        setAiResult(r=>({...r,focusProposal:parsed.focusProposal,quickNote:parsed.note}));
      } else {
        toast_(`✓ Plan adapted — ${parsed.note||"remaining days updated"}`);
      }
    }catch(e){toast_("Couldn't adapt — try again");}
    setAdaptLoading(false);
  };

  const saveWeekLog=result=>{
    const entry={weekStart:week.weekStart,date:new Date().toLocaleDateString(),
      note:weekNote,hoursLogged:weekH,assessment:result.assessment||"",
      insight:result.insight||"",nextMilestone:result.nextMilestone||"",
      focusBefore:[...(focus.courses||[]),...(focus.books||[])]};
    setWeekLogs(logs=>[entry,...logs.filter(l=>l.weekStart!==week.weekStart)].slice(0,MAX_WEEK_LOGS));
  };

  const submitLog=()=>{
    if(!logForm.hours) return;
    if(!confirmLog){setConfirmLog(true);return;}
    const realH=parseFloat(logForm.hours);
    const contentH=logForm.courseHours?parseFloat(logForm.courseHours):realToContent(logging,realH);
    const id=logging.id,tot=logging.hours||1;
    const prevContent=progress[id]?.courseHoursComplete||0;
    const newContent=Math.min(prevContent+contentH,tot);
    const newPct=Math.round((newContent/tot)*100);
    const sessionDate=new Date(logForm.date);
    const monDate=new Date(getMonday());
    const sunDate=new Date(monDate);sunDate.setDate(monDate.getDate()+6);
    const isThisWeek=sessionDate>=monDate&&sessionDate<=sunDate;
    setProgress(p=>({...p,[id]:{
      hoursSpent:(p[id]?.hoursSpent||0)+realH,
      courseHoursComplete:newContent,percentComplete:newPct,
      sessions:[...(p[id]?.sessions||[]),
        {date:logForm.date,studyHours:realH,courseHours:parseFloat(contentH.toFixed(3)),note:logForm.note}]
    }}));
    if(isThisWeek) setWeek(w=>({...w,hoursLogged:(w.hoursLogged||0)+realH}));
    setLogging(null);
    setLogForm({hours:"",courseHours:"",note:"",date:new Date().toLocaleDateString()});
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
    setFocus({courses:proposal.courses,books:proposal.books});
    setAiResult(r=>({...r,focusProposal:null}));
    toast_("✓ Focus updated");
  };

  // Year arc stats — use content hours for completion %
  const totalItems=CURRICULUM.length;
  const doneItems=CURRICULUM.filter(i=>getP(i.id).percentComplete>=100).length;
  const totalSpentRealH=CURRICULUM.reduce((s,i)=>s+(getP(i.id).hoursSpent||0),0);
  // Est completion: remaining real hours / weekly target
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

  return(
    <div style={{background:T.bg,minHeight:"100dvh",color:T.text,fontFamily:T.fontUI,paddingBottom:88}}>

      {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",
        background:T.green,color:"#000",padding:"10px 20px",borderRadius:99,fontWeight:700,
        zIndex:999,fontSize:12,letterSpacing:0.3,boxShadow:`0 4px 24px ${T.green}50`,whiteSpace:"nowrap"}}>
        {toast}</div>}

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
        <button onClick={()=>{setView("ai");setCompletionBanner([]);}}
          style={{background:T.green,border:"none",color:"#000",borderRadius:8,padding:"6px 12px",
            fontSize:11,fontWeight:800,cursor:"pointer",boxShadow:`0 0 16px ${T.green}40`}}>
          Check-In →
        </button>
      </div>}

      {missedDayBanner&&<div style={{background:"#1a1200",borderBottom:`1px solid #3a2a00`,
        padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:T.yellow,letterSpacing:0.5}}>⚠ Missed session yesterday</div>
          <div style={{fontSize:10,color:"#5a4a00",marginTop:2}}>Redistribute those hours across remaining days?</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setMissedDayBanner(false)}
            style={{background:"none",border:`1px solid ${T.surface3}`,color:T.textDim,
              borderRadius:7,padding:"5px 10px",fontSize:10,cursor:"pointer"}}>Skip</button>
          <button onClick={()=>{setMissedDayBanner(false);runAdaptPlan("Missed yesterday — redistribute those hours across remaining days.");}}
            style={{background:T.yellow,border:"none",color:"#000",borderRadius:7,
              padding:"5px 10px",fontSize:10,fontWeight:800,cursor:"pointer"}}>Adapt →</button>
        </div>
      </div>}

      {/* ── Header ── */}
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
                  onClick={()=>setFocus(f=>({...f,[key]:on?(f[key]||[]).filter(x=>x!==i.id):[...(f[key]||[]),i.id]}))}
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

        {/* ── TODAY ── */}
        {view==="today"&&<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:11,color:T.textDim,letterSpacing:0.3}}>
              {weekH>=WEEKLY_TARGET?"Target hit — any session is a bonus"
                :planIsFromThisWeek?`Plan · ${getDayName()}`:"No plan yet — estimated"}
            </div>
            {planIsFromThisWeek&&<button onClick={()=>runAdaptPlan()} disabled={adaptLoading}
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
            return <Card key={item.id} accent={c} glow style={{marginBottom:10,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div style={{flex:1,paddingRight:10}}>
                  <div style={{fontSize:9,color:T.textDim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>
                    {item.type==="course"?"Course":"Book"}
                  </div>
                  <div style={{fontSize:14,fontWeight:700,letterSpacing:-0.2,lineHeight:1.3}}>{item.name}</div>
                  <div style={{marginTop:7}}><Pill color={c} label={item.genre||item.id}/></div>
                  {item.planNote&&<div style={{fontSize:10,color:T.textDim,marginTop:7,lineHeight:1.4,fontStyle:"italic"}}>
                    {item.planNote}
                  </div>}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:22,fontWeight:900,color:T.blue,letterSpacing:-1,textShadow:shadow.glow(T.blue)}}>
                    {item.allocRealH}h
                  </div>
                  <div style={{fontSize:10,color:T.textDim,marginTop:2}}>real study</div>
                  {item.type==="course"&&<div style={{fontSize:10,color:T.textDim,marginTop:1}}>
                    {item.contentGain}h content
                  </div>}
                </div>
              </div>

              {/* Progress + target */}
              <div style={{background:T.surface0,borderRadius:10,padding:"10px 12px",marginBottom:12,
                border:`1px solid ${T.surface3}`}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:6}}>
                  <span style={{color:T.textDim}}>
                    {item.contentDone.toFixed(2)}h / {item.contentTotal}h content
                  </span>
                  <span style={{color:T.textDim}}>
                    {item.contentLeft.toFixed(2)}h left
                  </span>
                </div>
                <Bar pct={p.percentComplete} color={c} height={4} glow/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginTop:5}}>
                  <span style={{color:T.textMid,fontWeight:600}}>Now: {p.percentComplete}%</span>
                  <span style={{color:c,fontWeight:700,textShadow:`0 0 8px ${c}40`}}>
                    Target: {item.targetPct}% after session
                  </span>
                </div>
              </div>

              <button onClick={()=>setLogging(item)}
                style={{width:"100%",background:T.surface2,border:`1px solid ${T.surface3}`,
                  color:T.blue,borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,
                  cursor:"pointer",boxShadow:`0 0 12px ${T.blue}10`}}>
                + Log Session
              </button>
            </Card>;
          })}

          {weekH>=WEEKLY_TARGET&&<div style={{textAlign:"center",color:T.green,padding:48,
            fontSize:15,fontWeight:700,letterSpacing:0.3,textShadow:shadow.glow(T.green)}}>
            🎯 {WEEKLY_TARGET}h hit. Week complete.
          </div>}
        </div>}

        {/* ── WEEK ── */}
        {view==="week"&&<div>
          <div style={{fontSize:11,color:T.textDim,marginBottom:16,letterSpacing:0.3}}>
            {planIsFromThisWeek?"This week's plan":"Active focus"} · {weekH.toFixed(1)}h logged
          </div>

          {planIsFromThisWeek&&weekPlan.days&&<Card style={{padding:"13px 14px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700}}>
                  Week Schedule
                </div>
                {weekPlan.lastAdapted&&<div style={{fontSize:9,color:T.textDim,marginTop:2}}>
                  Adapted {new Date(weekPlan.lastAdapted).toLocaleDateString()}
                </div>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:13,fontWeight:900,color:T.green,textShadow:shadow.glow(T.green)}}>
                  {weekPlan.totalPlannedHours}h
                </div>
                <button onClick={()=>runAdaptPlan()} disabled={adaptLoading}
                  style={{background:"none",border:`1px solid ${T.surface3}`,
                    color:adaptLoading?T.textDim:T.blue,borderRadius:7,
                    padding:"3px 10px",fontSize:10,cursor:"pointer",fontWeight:700}}>
                  {adaptLoading?"…":"⚡ Adapt"}
                </button>
              </div>
            </div>
            {weekPlan.days.map(day=>{
              const isPast=DAY_NAMES.indexOf(day.day)<getDayIdx();
              const isToday=day.day===getDayName();
              const dayRealH=day.totalDayRealH||day.items?.reduce((s,i)=>s+(i.realHours||i.hours||0),0)||0;
              return <div key={day.day} style={{marginBottom:14,opacity:isPast?0.4:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontSize:11,fontWeight:800,
                    color:isToday?T.blue:isPast?T.textDim:T.text,
                    textShadow:isToday?shadow.glow(T.blue):"none"}}>
                    {day.day}{isToday?" — Today":""}
                  </div>
                  <div style={{fontSize:10,color:T.textDim}}>{dayRealH.toFixed(1)}h real</div>
                </div>
                {day.items?.map(it=>{
                  const f=CURRICULUM.find(i=>i.id===it.id);
                  const c=gc(f?.genre);
                  const p=getP(it.id);
                  return <div key={it.id} style={{background:T.surface0,borderRadius:10,
                    padding:"8px 12px",marginBottom:5,borderLeft:`2px solid ${c}`,boxShadow:shadow.card}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{fontSize:12,fontWeight:600,flex:1,paddingRight:8,lineHeight:1.3}}>
                        {f?.name||it.id}
                      </div>
                      <div style={{flexShrink:0,textAlign:"right"}}>
                        <div style={{fontSize:13,fontWeight:800,color:T.blue,textShadow:shadow.glow(T.blue)}}>
                          {it.realHours}h
                        </div>
                        {it.contentHours&&f?.type==="course"&&<div style={{fontSize:9,color:T.textDim}}>
                          {it.contentHours}h content
                        </div>}
                      </div>
                    </div>
                    {it.focus&&<div style={{fontSize:10,color:T.textDim,marginTop:3,lineHeight:1.4}}>{it.focus}</div>}
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,marginTop:5,color:T.textDim}}>
                      <span>Now: {p.percentComplete}%</span>
                      {it.targetPct&&<span style={{color:c,fontWeight:700}}>→ target {it.targetPct}%</span>}
                    </div>
                    <div style={{marginTop:4}}><Bar pct={p.percentComplete} color={c} height={2}/></div>
                  </div>;
                })}
              </div>;
            })}
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
                    {item.id} · {(p.courseHoursComplete||0).toFixed(2)}h/{item.hours}h content · {realLeft.toFixed(1)}h real left
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

        {/* ── CHECK-IN ── */}
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
            <button onClick={()=>runAdaptPlan()} disabled={adaptLoading}
              style={{background:"none",border:`1px solid ${T.blue}30`,color:T.blue,
                borderRadius:8,padding:"5px 12px",fontSize:11,cursor:"pointer",fontWeight:700}}>
              {adaptLoading?"…":"⚡ Adapt"}
            </button>
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

        {/* ── YEAR ARC ── */}
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
            <SectionBlock key={sec.label} sec={sec} focusIds={focusIds} getP={getP} setLogging={setLogging}/>
          ))}

          <Card style={{padding:"14px 16px",marginTop:8}}>
            <div style={{fontSize:9,fontWeight:700,color:T.textDim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:12}}>
              Data Backup
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{
                const data={progress,week,focus,weekLogs,profile,weekPlan};
                const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
                const url=URL.createObjectURL(blob);
                const a=document.createElement("a");
                a.href=url;a.download=`the-preparation-${getTodayISO()}.json`;
                a.click();URL.revokeObjectURL(url);toast_("✓ Data exported");
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
                      toast_("✓ Data imported");
                    }catch{toast_("Import failed");}
                  };reader.readAsText(file);
                };inp.click();
              }} style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                color:T.textMid,borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                Import JSON
              </button>
            </div>
            <div style={{fontSize:10,color:T.textDim,marginTop:10,lineHeight:1.5}}>
              Export before updating the app or clearing browser data.
            </div>
          </Card>
        </div>}
      </div>

      {/* ── EDIT SESSION MODAL ── */}
      {editSession&&(()=>{
        const{itemId,sessionIdx}=editSession;
        const item=CURRICULUM.find(i=>i.id===itemId);
        return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",
          display:"flex",alignItems:"flex-end",zIndex:100,backdropFilter:"blur(4px)"}}>
          <div className="slide-up" style={{background:T.surface1,borderRadius:"18px 18px 0 0",
            padding:24,width:"100%",boxSizing:"border-box",
            borderTop:`3px solid ${T.blue}`,boxShadow:shadow.raised}}>
            <div style={{fontSize:16,fontWeight:800,letterSpacing:-0.3,marginBottom:3}}>Edit Session</div>
            <div style={{fontSize:11,color:T.textDim,marginBottom:20}}>{item?.name} · session {sessionIdx+1}</div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6,letterSpacing:0.3}}>
                Real study hours
              </label>
              <input type="number" min="0.25" max="12" step="0.25" value={editSessionForm.hours}
                onChange={e=>setEditSessionForm(f=>({...f,hours:e.target.value}))} style={inputSt}/>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6,letterSpacing:0.3}}>
                Content hours {item?.type==="course"?"(real÷2)":"(= real for books)"}
              </label>
              <input type="number" min="0.1" max={item?.hours} step="0.1" value={editSessionForm.courseHours}
                onChange={e=>setEditSessionForm(f=>({...f,courseHours:e.target.value}))} style={inputSt}/>
            </div>
            <div style={{marginBottom:20}}>
              <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6,letterSpacing:0.3}}>Note</label>
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

      {/* ── LOG MODAL ── */}
      {logging&&(()=>{
        const p=getP(logging.id);
        const contentDone=p.courseHoursComplete||0;
        const contentLeft=Math.max(0,(logging.hours||0)-contentDone);
        const realH=parseFloat(logForm.hours||0);
        const contentGain=logForm.courseHours
          ?parseFloat(logForm.courseHours)
          :realToContent(logging,realH);
        const previewPct=realH>0?targetPctAfterSession(logging,p,realH):null;
        return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",
          display:"flex",alignItems:"flex-end",zIndex:100,backdropFilter:"blur(4px)"}}>
          <div className="slide-up" style={{background:T.surface1,borderRadius:"18px 18px 0 0",
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
                  <div style={{fontSize:11,color:T.textDim,marginBottom:6,letterSpacing:0.3}}>Confirm session</div>
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
                  <button onClick={submitLog}
                    style={{flex:2,background:"#0a1220",border:`1px solid ${T.blue}30`,color:T.blue,
                      borderRadius:10,padding:12,fontSize:14,fontWeight:800,cursor:"pointer",
                      boxShadow:`0 0 20px ${T.blue}15`}}>Confirm ✓</button>
                </div>
              </div>
            ):(
              <div>
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6,letterSpacing:0.3}}>Session date</label>
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
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6,letterSpacing:0.3}}>
                    Real study hours {logging.type==="course"?"(max 1.5h/session)":"(max 2h/session)"}
                  </label>
                  <input type="number" min="0.25" max={maxRealPerSession(logging)} step="0.25"
                    value={logForm.hours}
                    onChange={e=>setLogForm(f=>({...f,hours:e.target.value}))}
                    style={inputSt} placeholder={logging.type==="course"?"e.g. 1.5":"e.g. 1.0"}/>
                  {realH>0&&<div style={{fontSize:11,color:T.blue,marginTop:5}}>
                    = {realToContent(logging,realH).toFixed(3)}h content progress
                    {previewPct?` → ${p.percentComplete}% → ${previewPct}%`:""}
                  </div>}
                </div>

                {logging.type==="course"&&<div style={{marginBottom:14}}>
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6,letterSpacing:0.3}}>
                    Override content hours <span style={{color:T.textDim,fontWeight:400}}>(optional — leave blank to auto-calculate)</span>
                  </label>
                  <input type="number" min="0.1" max={logging.hours} step="0.05"
                    value={logForm.courseHours}
                    onChange={e=>setLogForm(f=>({...f,courseHours:e.target.value}))}
                    style={inputSt} placeholder={`Auto: ${realToContent(logging,realH||0).toFixed(2)}h`}/>
                </div>}

                <div style={{marginBottom:20}}>
                  <label style={{fontSize:11,color:T.textMid,display:"block",marginBottom:6,letterSpacing:0.3}}>Note (optional)</label>
                  <input value={logForm.note}
                    onChange={e=>setLogForm(f=>({...f,note:e.target.value}))}
                    style={inputSt} placeholder="What did you cover?"/>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{setLogging(null);setLogForm({hours:"",courseHours:"",note:"",date:new Date().toLocaleDateString()});setConfirmLog(false);}}
                    style={{flex:1,background:T.surface2,border:`1px solid ${T.surface3}`,
                      color:T.textMid,borderRadius:10,padding:12,fontSize:14,cursor:"pointer"}}>Cancel</button>
                  <button onClick={submitLog}
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

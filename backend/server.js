
//  store files, give back their SHA-256 hash, keep verifier applications.


const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// Folders and files
const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATA_DIR = path.join(__dirname, "data");
const INDEX_FILE = path.join(UPLOAD_DIR, "index.json");        // hash -> name and type
const APPLICANTS_FILE = path.join(DATA_DIR, "applicants.json"); // verifier applications

// create the folders and empty json files if they don't exist yet
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, "{}");
if (!fs.existsSync(APPLICANTS_FILE)) fs.writeFileSync(APPLICANTS_FILE, "[]");

// small helpers to read and write json files
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// every error in this project looks the same: HTTP 400 + { error: "message" }
function fail(res, message) {
  return res.status(400).json({ error: message });
}

// Middleware 
app.use(express.json()); // lets us read JSON bodies (for /apply)

// multer keeps the uploaded file in memory so we can hash the raw bytes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB is plenty for photos
});

//  upload a file 
// form-data field name must be "file"
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return fail(res, "No file uploaded (use form field 'file')");

  // SHA-256 of the raw bytes, as 64 lowercase hex characters (no 0x)
  const hash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

  // the file is saved under its own hash, so same file = same name
  fs.writeFileSync(path.join(UPLOAD_DIR, hash), req.file.buffer);

  // remember the original name and type so we can send it back properly later
  const index = readJson(INDEX_FILE);
  index[hash] = { name: req.file.originalname, type: req.file.mimetype };
  writeJson(INDEX_FILE, index);

  res.json({
    hash: hash,
    name: req.file.originalname,
    type: req.file.mimetype,
    size: req.file.size
  });
});

// download a file by its hash 
app.get("/files/:hash", (req, res) => {
  const hash = req.params.hash;

  // only accept real SHA-256 hashes; this also stops path tricks like ../
  if (!/^[a-f0-9]{64}$/.test(hash)) return fail(res, "Invalid hash");

  const index = readJson(INDEX_FILE);
  const filePath = path.join(UPLOAD_DIR, hash);
  if (!index[hash] || !fs.existsSync(filePath)) return fail(res, "File not found");

  // send it with its original content type
  res.type(index[hash].type);
  res.sendFile(filePath);
});

//  a citizen applies to become a verifier 
app.post("/apply", (req, res) => {
  const { wallet, name, age, idNumber } = req.body || {};

  // wallet must look like an Ethereum address: 0x + 40 hex characters
  if (typeof wallet !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return fail(res, "Invalid wallet address");
  }
  if (typeof name !== "string" || name.trim() === "") {
    return fail(res, "Name is required");
  }
  // must be a whole number and 18 or more
  if (!Number.isInteger(Number(age)) || Number(age) < 18) {
    return fail(res, "You must be 18 or older");
  }
  // ID number must be exactly 12 digits
  if (!/^\d{12}$/.test(String(idNumber))) {
    return fail(res, "ID number must be 12 digits");
  }

  const applicants = readJson(APPLICANTS_FILE);

  // the same ID cannot be used twice
  if (applicants.some((a) => a.idNumber === String(idNumber))) {
    return fail(res, "This ID number was already used");
  }
  // one application per wallet
  if (applicants.some((a) => a.wallet === wallet.toLowerCase())) {
    return fail(res, "This wallet has already applied");
  }

  // the full ID is stored here only (off-chain), never on the blockchain
  applicants.push({
    wallet: wallet.toLowerCase(),
    name: name.trim(),
    age: Number(age),
    idNumber: String(idNumber),
    status: "pending"
  });
  writeJson(APPLICANTS_FILE, applicants);

  res.json({ status: "pending" });
});

//  list all applicants for the govt page
app.get("/applicants", (req, res) => {
  const applicants = readJson(APPLICANTS_FILE);

  // we hide the full ID and only show the last 4 digits
  const safeList = applicants.map((a) => ({
    wallet: a.wallet,
    name: a.name,
    age: a.age,
    idLast4: a.idNumber.slice(-4),
    status: a.status
  }));

  res.json(safeList);
});

// government approves an applicant 
// The frontend calls this only AFTER registerVerifier succeeds on-chain.
app.post("/applicants/:wallet/approve", (req, res) => {
  const wallet = req.params.wallet.toLowerCase();
  const applicants = readJson(APPLICANTS_FILE);

  const person = applicants.find((a) => a.wallet === wallet);
  if (!person) return fail(res, "Applicant not found");

  person.status = "approved";
  writeJson(APPLICANTS_FILE, applicants);

  res.json({ status: "approved" });
});

// Serve the frontend after the api routes
app.use(express.static(path.join(__dirname, "..", "frontend")));

//  Catch errors (e.g. file too big) and keep the same format 
app.use((err, req, res, next) => {
  fail(res, err.message || "Something went wrong");
});

app.listen(PORT, () => {
  console.log("Jan Pramaan backend running at http://localhost:" + PORT);
});

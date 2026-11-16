const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATA_DIR = path.join(__dirname, "data");
const INDEX_FILE = path.join(UPLOAD_DIR, "index.json");
const APPLICANTS_FILE = path.join(DATA_DIR, "applicants.json");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, "{}");
if (!fs.existsSync(APPLICANTS_FILE)) fs.writeFileSync(APPLICANTS_FILE, "[]");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function fail(res, message) {
  return res.status(400).json({ error: message });
}

app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return fail(res, "No file uploaded (use form field 'file')");

  const hash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

  fs.writeFileSync(path.join(UPLOAD_DIR, hash), req.file.buffer);

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

app.get("/files/:hash", (req, res) => {
  const hash = req.params.hash;

  if (!/^[a-f0-9]{64}$/.test(hash)) return fail(res, "Invalid hash");

  const index = readJson(INDEX_FILE);
  const filePath = path.join(UPLOAD_DIR, hash);
  if (!index[hash] || !fs.existsSync(filePath)) return fail(res, "File not found");

  res.type(index[hash].type);
  res.sendFile(filePath);
});

app.post("/apply", (req, res) => {
  const { wallet, name, age, idNumber } = req.body || {};

  if (typeof wallet !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return fail(res, "Invalid wallet address");
  }
  if (typeof name !== "string" || name.trim() === "") {
    return fail(res, "Name is required");
  }
  if (!Number.isInteger(Number(age)) || Number(age) < 18) {
    return fail(res, "You must be 18 or older");
  }
  if (!/^\d{12}$/.test(String(idNumber))) {
    return fail(res, "ID number must be 12 digits");
  }

  const applicants = readJson(APPLICANTS_FILE);

  if (applicants.some((a) => a.idNumber === String(idNumber))) {
    return fail(res, "This ID number was already used");
  }
  if (applicants.some((a) => a.wallet === wallet.toLowerCase())) {
    return fail(res, "This wallet has already applied");
  }

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

app.get("/applicants", (req, res) => {
  const applicants = readJson(APPLICANTS_FILE);

  const safeList = applicants.map((a) => ({
    wallet: a.wallet,
    name: a.name,
    age: a.age,
    idLast4: a.idNumber.slice(-4),
    status: a.status
  }));

  res.json(safeList);
});

app.post("/applicants/:wallet/approve", (req, res) => {
  const wallet = req.params.wallet.toLowerCase();
  const applicants = readJson(APPLICANTS_FILE);

  const person = applicants.find((a) => a.wallet === wallet);
  if (!person) return fail(res, "Applicant not found");

  person.status = "approved";
  writeJson(APPLICANTS_FILE, applicants);

  res.json({ status: "approved" });
});

app.use(express.static(path.join(__dirname, "..", "frontend")));

app.use((err, req, res, next) => {
  fail(res, err.message || "Something went wrong");
});

app.listen(PORT, () => {
  console.log("Jan Pramaan backend running at http://localhost:" + PORT);
});

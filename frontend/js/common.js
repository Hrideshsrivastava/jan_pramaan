// common.js - helpers shared by every page.
// Needs web3.js 1.10 (CDN) and config.js to be loaded first.

// Status names in the same order as the Solidity enum Status (0..6).
const STATUS_NAMES = ["Created", "CompletionClaimed", "Commit", "Reveal", "Verified", "Failed", "Paid"];

let web3 = null;      // Web3 instance using MetaMask
let account = null;   // connected account (lowercase)
let contract = null;  // JanPramaan contract object

// Sets up web3 without asking MetaMask for permission.
// If the site was already connected before, the account is filled in too.
async function initWeb3() {
  if (!window.ethereum) {
    showError("MetaMask not found. Please install it and reload.");
    return false;
  }
  if (!web3) {
    web3 = new Web3(window.ethereum);
    // Reload the page when the user switches account or network in MetaMask.
    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged", () => window.location.reload());
  }
  const accounts = await web3.eth.getAccounts();
  if (accounts.length > 0) setAccount(accounts[0]);
  return true;
}

// False (and an error) if config.js still has the placeholder address.
function contractReady() {
  if (CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    showError("Paste the deployed contract address into frontend/js/config.js");
    return false;
  }
  return true;
}

// Asks MetaMask to connect and remembers the chosen account.
async function connectWallet() {
  if (!window.ethereum) {
    showError("MetaMask not found. Please install it and reload.");
    return null;
  }
  await initWeb3();
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  setAccount(accounts[0]);
  return account;
}

// Saves the account and shows it in the header.
function setAccount(addr) {
  account = addr.toLowerCase();
  const el = document.getElementById("account");
  if (el) el.textContent = account;
  const btn = document.getElementById("connectBtn");
  if (btn) btn.textContent = "Connected";
}

// Returns the JanPramaan contract object (made once).
function getContract() {
  if (!contract) contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
  return contract;
}

// Wei (string or number) -> "24.5 ETH"
function toEth(wei) {
  return web3.utils.fromWei(String(wei), "ether") + " ETH";
}

// Sends a file to the backend. Returns the SHA-256 hash (64 hex chars).
async function uploadFile(file) {
  if (!file) throw new Error("Please choose a file first");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.hash;
}

// Downloads a file and returns its SHA-256 as 64 lowercase hex chars.
async function sha256OfUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("File not found on the backend");
  const bytes = await res.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Shows an error in the red box. For failed transactions it shows
// only the require(...) message, e.g. "Upload evidence first".
function showError(err) {
  let msg = typeof err === "string" ? err : (err && err.message) || String(err);
  const text = msg + " " + JSON.stringify(err && err.data ? err.data : "");
  const patterns = [
    /revert ([^"\\\n]+)/,                  // Ganache: "...transaction: revert Upload evidence first"
    /reverted with reason string '([^']+)'/,
    /execution reverted: ([^"\\\n]+)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) { msg = m[1].trim(); break; }
  }
  if (err && err.code === 4001) msg = "Transaction cancelled in MetaMask";
  const box = document.getElementById("error");
  if (box) {
    box.textContent = msg;
    box.style.display = "block";
  }
  console.error(err);
}

// Shows a green success message.
function showMessage(msg) {
  const box = document.getElementById("message");
  if (box) {
    box.textContent = msg;
    box.style.display = "block";
  }
}

// Hides both message boxes.
function clearMessages() {
  for (const id of ["error", "message"]) {
    const box = document.getElementById(id);
    if (box) box.style.display = "none";
  }
}

// Runs an async button action: disables the button, clears old messages,
// and shows any error. Usage: run(btn, async () => { ... })
async function run(button, action) {
  clearMessages();
  if (button) button.disabled = true;
  try {
    await action();
  } catch (err) {
    showError(err);
  } finally {
    if (button) button.disabled = false;
  }
}

// True if two addresses are the same (ignores upper/lower case).
function sameAddr(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

// Makes text safe to put inside innerHTML.
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Fetches a stored file, hashes it in the browser and shows match/mismatch
// in the element `out`.
async function verifyFile(hash, out) {
  out.textContent = "checking...";
  out.className = "result";
  try {
    const actual = await sha256OfUrl("/files/" + hash);
    if (actual === hash) {
      out.textContent = "MATCH - file is unchanged";
      out.className = "result ok";
    } else {
      out.textContent = "MISMATCH - file was changed (got " + actual.slice(0, 12) + "...)";
      out.className = "result bad";
    }
  } catch (err) {
    out.textContent = err.message;
    out.className = "result bad";
  }
}

// Every page calls this once. It wires up the Connect button and calls
// `load()` now (if possible) and again after connecting.
function startPage(load) {
  const btn = document.getElementById("connectBtn");
  if (btn) {
    btn.onclick = () => run(btn, async () => {
      await connectWallet();
      if (contractReady()) await load();
    });
  }
  window.addEventListener("load", () => run(null, async () => {
    if ((await initWeb3()) && contractReady()) await load();
  }));
}

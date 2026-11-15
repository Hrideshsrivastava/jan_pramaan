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

// Checks that MetaMask is on Ganache and that a contract really exists at
// CONTRACT_ADDRESS. Shows a clear error and returns false if not.
async function contractReady() {
  if (CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    showError("Paste the deployed contract address into frontend/js/config.js");
    return false;
  }
  const chainId = Number(await web3.eth.getChainId());
  if (chainId !== 1337) {
    showError("MetaMask is on chain " + chainId + ". Approve the switch to Ganache (chain ID 1337) in MetaMask.");
    await switchToGanache(); // MetaMask fires "chainChanged" and the page reloads
    return false;
  }
  const code = await web3.eth.getCode(CONTRACT_ADDRESS);
  if (code === "0x") {
    showError("No contract found at " + CONTRACT_ADDRESS + " on Ganache. Deploy JanPramaan in Remix " +
      "and paste the address of the SUCCESSFUL deploy (status 1) into frontend/js/config.js.");
    return false;
  }
  return true;
}

// Asks MetaMask to switch this site to Ganache (chain 1337 = 0x539).
// If MetaMask does not know the network yet, it is added first.
async function switchToGanache() {
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x539" }] });
  } catch (err) {
    if (err.code !== 4902) return; // 4902 = unknown network; anything else (e.g. user said no) we leave
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x539",
        chainName: "Ganache",
        rpcUrls: ["http://127.0.0.1:7545"],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      }],
    });
  }
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

// Sends a transaction, but first runs it as a free dry run (.call) with the
// same sender and value. If a require() would fail, the dry run throws with
// the contract's message (e.g. "Not a contractor") and nothing is sent.
// Without this, some MetaMask versions send the failing transaction anyway
// and web3 only says "Transaction has been reverted by the EVM".
async function sendTx(tx, options) {
  await tx.call(options);
  return tx.send(options);
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
// only the contract's require(...) message, e.g. "Upload evidence first".
function showError(err) {
  const box = document.getElementById("error");
  if (box) {
    box.textContent = errorText(err);
    box.style.display = "block";
  }
  console.error(err);
}

// Turns any error (MetaMask, web3, backend, our own) into one short sentence.
function errorText(err) {
  if (typeof err === "string") return err;
  const msg = (err && err.message) || String(err);
  // MetaMask and web3 hide the real reason in different places, so search them all.
  let text = msg;
  try { text += "\n" + JSON.stringify([err.data, err.error, err.cause]); } catch (e) { /* ignore */ }

  // 1. The require() message as text, in the forms Ganache and MetaMask use.
  const patterns = [
    /revert ([^"\\\n]+)/,                  // "...transaction: revert Upload evidence first"
    /reverted with reason string '([^']+)'/,
    /execution reverted: ([^"\\\n]+)/,
    /"reason":"([^"]+)"/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  // 2. The require() message still ABI-encoded as Error(string): 0x08c379a0 + data.
  const encoded = text.match(/0x08c379a0([0-9a-fA-F]+)/);
  if (encoded && web3) {
    try { return web3.eth.abi.decodeParameter("string", "0x" + encoded[1]); } catch (e) { /* ignore */ }
  }
  // 3. Common wallet and network problems.
  if ((err && err.code === 4001) || /User denied|rejected/i.test(msg)) return "Transaction cancelled in MetaMask";
  if (/insufficient funds/i.test(text)) return "Not enough ETH in this account for the amount plus gas";
  if (/nonce/i.test(text)) return "MetaMask nonce is out of date (Ganache was reset). MetaMask -> Settings -> Advanced -> Clear activity tab data";
  if (/Returned values aren't valid/.test(msg)) return "Could not read the contract. Check CONTRACT_ADDRESS in config.js and that MetaMask is on Ganache";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Cannot reach the backend. Is node server.js running?";
  if (/reverted by the EVM/.test(msg)) return "Transaction failed on the blockchain (no reason given). Check you are on the right account and step";
  // 4. Anything else: first line only, never a JSON dump.
  return msg.split("\n")[0].slice(0, 200);
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
      if (await contractReady()) await load();
    });
  }
  window.addEventListener("load", () => run(null, async () => {
    if ((await initWeb3()) && (await contractReady())) await load();
  }));
}

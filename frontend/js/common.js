const STATUS_NAMES = ["Created", "CompletionClaimed", "Commit", "Reveal", "Verified", "Failed", "Paid"];

let web3 = null;
let account = null;
let contract = null;

async function initWeb3() {
  if (!window.ethereum) {
    showError("MetaMask not found. Please install it and reload.");
    return false;
  }
  if (!web3) {
    web3 = new Web3(window.ethereum);
    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged", () => window.location.reload());
  }
  const accounts = await web3.eth.getAccounts();
  if (accounts.length > 0) setAccount(accounts[0]);
  return true;
}

async function contractReady() {
  if (CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    showError("Paste the deployed contract address into frontend/js/config.js");
    return false;
  }
  const chainId = Number(await web3.eth.getChainId());
  if (chainId !== 1337) {
    showError("MetaMask is on chain " + chainId + ". Approve the switch to Ganache (chain ID 1337) in MetaMask.");
    await switchToGanache();
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

async function switchToGanache() {
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x539" }] });
  } catch (err) {
    if (err.code !== 4902) return;
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

function setAccount(addr) {
  account = addr.toLowerCase();
  const el = document.getElementById("account");
  if (el) el.textContent = account;
  const btn = document.getElementById("connectBtn");
  if (btn) btn.textContent = "Connected";
}

function getContract() {
  if (!contract) contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
  return contract;
}

async function sendTx(tx, options) {
  await tx.call(options);
  return tx.send(options);
}

function toEth(wei) {
  return web3.utils.fromWei(String(wei), "ether") + " ETH";
}

async function uploadFile(file) {
  if (!file) throw new Error("Please choose a file first");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.hash;
}

async function sha256OfUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("File not found on the backend");
  const bytes = await res.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function showError(err) {
  const box = document.getElementById("error");
  if (box) {
    box.textContent = errorText(err);
    box.style.display = "block";
  }
  console.error(err);
}

function errorText(err) {
  if (typeof err === "string") return err;
  const msg = (err && err.message) || String(err);
  let text = msg;
  try { text += "\n" + JSON.stringify([err.data, err.error, err.cause]); } catch (e) {  }

  const patterns = [
    /revert ([^"\\\n]+)/,
    /reverted with reason string '([^']+)'/,
    /execution reverted: ([^"\\\n]+)/,
    /"reason":"([^"]+)"/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  const encoded = text.match(/0x08c379a0([0-9a-fA-F]+)/);
  if (encoded && web3) {
    try { return web3.eth.abi.decodeParameter("string", "0x" + encoded[1]); } catch (e) {  }
  }
  if ((err && err.code === 4001) || /User denied|rejected/i.test(msg)) return "Transaction cancelled in MetaMask";
  if (/insufficient funds/i.test(text)) return "Not enough ETH in this account for the amount plus gas";
  if (/nonce/i.test(text)) return "MetaMask nonce is out of date (Ganache was reset). MetaMask -> Settings -> Advanced -> Clear activity tab data";
  if (/Returned values aren't valid/.test(msg)) return "Could not read the contract. Check CONTRACT_ADDRESS in config.js and that MetaMask is on Ganache";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Cannot reach the backend. Is node server.js running?";
  if (/reverted by the EVM/.test(msg)) return "Transaction failed on the blockchain (no reason given). Check you are on the right account and step";
  return msg.split("\n")[0].slice(0, 200);
}

function showMessage(msg) {
  const box = document.getElementById("message");
  if (box) {
    box.textContent = msg;
    box.style.display = "block";
  }
}

function clearMessages() {
  for (const id of ["error", "message"]) {
    const box = document.getElementById(id);
    if (box) box.style.display = "none";
  }
}

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

function sameAddr(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

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

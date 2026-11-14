// apply.js - a citizen applies to become a verifier.
// This page only talks to the backend (POST /apply). Nothing goes on-chain here.

async function submitApplication(event) {
  event.preventDefault(); // stop the normal form reload
  const btn = document.getElementById("applyBtn");
  await run(btn, async () => {
    const body = {
      wallet: document.getElementById("wallet").value.trim(),
      name: document.getElementById("name").value.trim(),
      age: Number(document.getElementById("age").value),
      idNumber: document.getElementById("idNumber").value.trim(),
    };
    const res = await fetch("/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Application failed");
    showMessage("Application sent. Status: " + data.status + ". Wait for the government to approve it.");
    document.getElementById("applyForm").reset();
  });
}

document.getElementById("applyForm").addEventListener("submit", submitApplication);

// Fill the wallet box with the connected MetaMask account.
async function fillWallet() {
  if (account) document.getElementById("wallet").value = account;
}

// This page does not need the contract, so it does not use startPage().
document.getElementById("connectBtn").onclick = (e) =>
  run(e.target, async () => {
    await connectWallet();
    await fillWallet();
  });

window.addEventListener("load", () => run(null, async () => {
  if (await initWeb3()) await fillWallet();
}));

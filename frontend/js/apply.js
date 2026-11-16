async function submitApplication(event) {
  event.preventDefault();
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

async function fillWallet() {
  if (account) document.getElementById("wallet").value = account;
}

document.getElementById("connectBtn").onclick = (e) =>
  run(e.target, async () => {
    await connectWallet();
    await fillWallet();
  });

window.addEventListener("load", () => run(null, async () => {
  if (await initWeb3()) await fillWallet();
}));

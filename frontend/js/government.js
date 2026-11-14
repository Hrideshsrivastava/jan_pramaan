// government.js - account #0 (admin) runs the whole process from here.

// Loads everything on the page.
async function loadGovernment() {
  const c = getContract();
  const admin = await c.methods.admin().call();
  const info = document.getElementById("adminInfo");
  if (account && sameAddr(account, admin)) {
    info.textContent = "Connected as the government (admin).";
  } else {
    info.textContent = "Warning: you are not the government account. Switch MetaMask to account #0 (" + admin + ").";
  }
  const bal = await web3.eth.getBalance(CONTRACT_ADDRESS);
  document.getElementById("contractBalance").textContent = toEth(bal);

  await loadApplicants();
  await loadVerifiers();
  await loadProjects();
  await loadReports();
  updatePreview();
}

// ---------- Contractors ----------
const addContractorBtn = document.getElementById("addContractorBtn");
addContractorBtn.onclick = () => run(addContractorBtn, async () => {
  const addr = document.getElementById("contractorAddr").value.trim();
  await getContract().methods.addContractor(addr).send({ from: account });
  showMessage("Contractor added: " + addr);
  document.getElementById("pContractor").value = addr; // handy for "Create project"
});

// ---------- Verifier applications ----------
async function loadApplicants() {
  const res = await fetch("/applicants");
  const list = await res.json();
  if (!res.ok) throw new Error(list.error || "Could not load applicants");
  const rows = list.map((a) => `<tr>
    <td class="mono">${esc(a.wallet)}</td><td>${esc(a.name)}</td><td>${esc(a.age)}</td>
    <td>${esc(a.idLast4)}</td><td>${esc(a.status)}</td>
    <td>${a.status === "pending"
      ? `<button onclick="approve(this, '${esc(a.wallet)}')">Approve</button>` : ""}</td></tr>`);
  document.getElementById("applicantRows").innerHTML =
    rows.join("") || '<tr><td colspan="6" class="muted">No applications</td></tr>';
}

// Approve = register on-chain first, then mark approved on the backend.
async function approve(btn, wallet) {
  await run(btn, async () => {
    await getContract().methods.registerVerifier(wallet).send({ from: account });
    const res = await fetch("/applicants/" + wallet + "/approve", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Backend approve failed");
    showMessage("Verifier registered: " + wallet);
    await loadApplicants();
    await loadVerifiers();
  });
}

async function loadVerifiers() {
  const c = getContract();
  const list = await c.methods.getVerifierList().call();
  const rows = [];
  for (const v of list) {
    const info = await c.methods.verifiers(v).call();
    rows.push(`<tr><td class="mono">${v}</td><td>${info.reputation}</td>
      <td>${info.tasksDone}</td><td>${info.penalties}</td></tr>`);
  }
  document.getElementById("verifierRows").innerHTML =
    rows.join("") || '<tr><td colspan="4" class="muted">No verifiers yet</td></tr>';
}

// ---------- Create project ----------
// Shows N and the contractor amount before sending (same maths as the contract).
function updatePreview() {
  const budget = Number(document.getElementById("pBudget").value);
  const reward = Number(document.getElementById("pReward").value);
  const out = document.getElementById("pPreview");
  if (!budget || !reward) { out.textContent = ""; return; }
  const n = Math.floor((budget * 2 / 100) / reward);
  out.textContent = `This gives ${n} verifiers per round and ${Number((budget - n * reward).toFixed(6))} ETH for the contractor.`;
}
document.getElementById("pBudget").oninput = updatePreview;
document.getElementById("pReward").oninput = updatePreview;

const createBtn = document.getElementById("createBtn");
createBtn.onclick = () => run(createBtn, async () => {
  const name = document.getElementById("pName").value.trim();
  const location = document.getElementById("pLocation").value.trim();
  const contractor = document.getElementById("pContractor").value.trim();
  const budget = document.getElementById("pBudget").value;
  const reward = document.getElementById("pReward").value;
  // 1. upload the details file to get its hash
  const detailsHash = await uploadFile(document.getElementById("pDetails").files[0]);
  // 2. create the project and lock the budget in the contract
  await getContract().methods
    .createProject(name, location, detailsHash, contractor, web3.utils.toWei(reward, "ether"))
    .send({ from: account, value: web3.utils.toWei(budget, "ether") });
  showMessage("Project created: " + name);
  await loadGovernment();
});

// ---------- Projects and phase buttons ----------
async function loadProjects() {
  const c = getContract();
  const count = Number(await c.methods.projectCount().call());
  const rows = [];
  for (let id = 1; id <= count; id++) {
    const p = await c.methods.getProject(id).call();
    const open = await c.methods.openReports(id).call();
    const s = Number(p.status);
    // Only the button for the next step is shown.
    let actions = "";
    if (s === 1) actions = `<button onclick="phase(this, 'startVerification', ${id})">Start verification</button>`;
    if (s === 2) {
      const committers = await c.methods.getCommitters(id, p.round).call();
      actions = `<button onclick="phase(this, 'closeCommitPhase', ${id})">Close commit phase</button>
        <span class="muted">${committers.length} of ${p.verifierCount} committed</span>`;
    }
    if (s === 3) actions = `<button onclick="phase(this, 'finalizeRound', ${id})">Finalize round</button>`;
    if (s === 4) actions = `<button onclick="phase(this, 'releasePayment', ${id})">Release payment</button>`;
    if (s === 0 || s === 5) actions = '<span class="muted">waiting for contractor</span>';
    rows.push(`<tr><td>${id}</td><td>${esc(p.name)}</td>
      <td><span class="badge s${s}">${STATUS_NAMES[s]}</span></td><td>${p.round}</td>
      <td>${toEth(p.contractorAmount)}</td><td>${open}</td><td>${actions}</td></tr>`);
  }
  document.getElementById("projectRows").innerHTML =
    rows.join("") || '<tr><td colspan="7" class="muted">No projects yet</td></tr>';
}

// Calls one of the phase functions: startVerification, closeCommitPhase,
// finalizeRound or releasePayment. All take just the project id.
async function phase(btn, method, id) {
  await run(btn, async () => {
    await getContract().methods[method](id).send({ from: account });
    showMessage(method + " done for project " + id);
    await loadGovernment();
  });
}

// ---------- Reports ----------
async function loadReports() {
  const c = getContract();
  const count = Number(await c.methods.reportCount().call());
  const rows = [];
  for (let i = 1; i <= count; i++) {
    const r = await c.methods.getReport(i).call();
    const result = r.resolved ? (r.upheld ? "upheld" : "rejected") : "open";
    rows.push(`<tr><td>${i}</td><td>${r.projectId} / ${r.round}</td>
      <td class="mono">${r.reporter}</td><td class="mono">${r.accused}</td>
      <td>${r.upholdVotes} / ${r.rejectVotes}</td><td>${result}</td>
      <td>${r.resolved ? "" : `<button onclick="resolveReport(this, ${i})">Resolve report</button>`}</td></tr>`);
  }
  document.getElementById("reportRows").innerHTML =
    rows.join("") || '<tr><td colspan="7" class="muted">No reports</td></tr>';
}

async function resolveReport(btn, id) {
  await run(btn, async () => {
    await getContract().methods.resolveReport(id).send({ from: account });
    showMessage("Report " + id + " resolved");
    await loadGovernment();
  });
}

startPage(loadGovernment);

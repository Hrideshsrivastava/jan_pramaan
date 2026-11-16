async function loadContractor() {
  const c = getContract();
  if (!account) {
    document.getElementById("contractorInfo").textContent = "Connect MetaMask to see your projects.";
    return;
  }
  const isContractor = await c.methods.isContractor(account).call();
  document.getElementById("contractorInfo").textContent = isContractor
    ? "You are a registered contractor."
    : "This account is not a registered contractor. Switch MetaMask to account #1.";
  document.getElementById("myBalance").textContent = toEth(await web3.eth.getBalance(account));

  const count = Number(await c.methods.projectCount().call());
  let html = "";
  for (let id = 1; id <= count; id++) {
    const p = await c.methods.getProject(id).call();
    if (!sameAddr(p.contractor, account)) continue;
    const s = Number(p.status);
    html += `<div class="card">
      <h3>Project ${id}: ${esc(p.name)} <span class="badge s${s}">${STATUS_NAMES[s]}</span></h3>
      <p>Location: ${esc(p.location)} | Round: ${p.round} | You will get: <b>${toEth(p.contractorAmount)}</b></p>`;
    if (s === 0 || s === 5) {
      if (s === 5) {
        const cost = BigInt(p.verifierCount) * BigInt(p.rewardPerVerifier);
        html += `<p class="muted">The last round failed. Fix the work and resubmit.
          The next round's verifier fees (${toEth(cost)}) come out of your amount.</p>`;
      }
      html += `<div class="row">
        <input type="file" id="file-${id}">
        <button onclick="submitCompletion(this, ${id})">Submit completion</button>
      </div>`;
    } else if (s === 6) {
      html += "<p>Paid. Project closed.</p>";
    } else {
      html += '<p class="muted">Verification in progress. Nothing to do right now.</p>';
    }
    html += "</div>";
  }
  document.getElementById("myProjects").innerHTML = html || '<p class="muted">No projects for this account.</p>';
}

async function submitCompletion(btn, id) {
  await run(btn, async () => {
    const hash = await uploadFile(document.getElementById("file-" + id).files[0]);
    await sendTx(getContract().methods.submitCompletion(id, hash), { from: account });
    showMessage("Completion submitted for project " + id);
    await loadContractor();
  });
}

startPage(loadContractor);

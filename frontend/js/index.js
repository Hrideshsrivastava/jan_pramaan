// index.js - public list of projects. Anyone can view and verify files.

const VOTE_NAMES = ["-", "PASS", "FAIL"]; // enum Vote { None, Pass, Fail }

// Builds a hash cell with a "Verify file" button.
function hashCell(hash) {
  if (!hash) return '<span class="muted">none</span>';
  return `<span class="hash">${esc(hash)}</span><br>
    <button class="secondary" onclick="verifyFile('${esc(hash)}', this.nextElementSibling)">Verify file</button><span></span>
    <a href="/files/${esc(hash)}" target="_blank">open</a>`;
}

// Loads every project (ids 1..projectCount) into the table.
async function loadProjects() {
  const c = getContract();
  const count = Number(await c.methods.projectCount().call());
  document.getElementById("countInfo").textContent = "(" + count + ")";
  const rows = [];
  for (let id = 1; id <= count; id++) {
    const p = await c.methods.getProject(id).call();
    rows.push(`<tr class="clickable" onclick="showProject(${id})">
      <td>${id}</td><td>${esc(p.name)}</td><td>${esc(p.location)}</td>
      <td><span class="badge s${p.status}">${STATUS_NAMES[p.status]}</span></td>
      <td>${toEth(p.budget)}</td><td>${p.round}</td></tr>`);
  }
  document.getElementById("projectRows").innerHTML =
    rows.join("") || '<tr><td colspan="6" class="muted">No projects yet</td></tr>';
}

// Shows full details of one project: every round, then its reports.
async function showProject(id) {
  await run(null, async () => {
    const c = getContract();
    const p = await c.methods.getProject(id).call();
    document.getElementById("detailTitle").textContent = "Project " + id + ": " + p.name;

    let html = `<table>
      <tr><th>Status</th><td><span class="badge s${p.status}">${STATUS_NAMES[p.status]}</span></td></tr>
      <tr><th>Location</th><td>${esc(p.location)}</td></tr>
      <tr><th>Contractor</th><td class="mono">${p.contractor}</td></tr>
      <tr><th>Budget</th><td>${toEth(p.budget)}</td></tr>
      <tr><th>Contractor will get</th><td>${toEth(p.contractorAmount)}</td></tr>
      <tr><th>Verifiers per round</th><td>${p.verifierCount} (reward ${toEth(p.rewardPerVerifier)} each)</td></tr>
      <tr><th>Details file</th><td>${hashCell(p.detailsHash)}</td></tr>
      <tr><th>Latest completion file</th><td>${hashCell(p.completionHash)}</td></tr>
    </table>`;

    // One section per round, newest first.
    for (let r = Number(p.round); r >= 1; r--) {
      const assigned = await c.methods.getAssigned(id, r).call();
      const panel = await c.methods.getPanel(id, r).call();
      const finalized = await c.methods.roundFinalized(id, r).call();
      html += `<h3>Round ${r} ${finalized ? "(finalized)" : ""}</h3>`;
      if (assigned.length === 0) {
        html += '<p class="muted">Verifiers not assigned yet.</p>';
        continue;
      }
      html += `<p>Panel: ${panel.length ? panel.map((a) => `<span class="mono">${a}</span>`).join(", ")
        : '<span class="muted">chosen after the commit phase closes</span>'}</p>`;
      html += `<table><tr><th>Verifier</th><th>Evidence</th><th>Vote committed</th><th>On panel</th><th>Revealed vote</th></tr>`;
      for (const v of assigned) {
        const rec = await c.methods.getRecord(id, r, v).call();
        const committed = rec.commitment !== "0x" + "0".repeat(64);
        // The vote stays hidden until the verifier reveals it.
        const vote = rec.revealed ? `<b>${VOTE_NAMES[rec.vote]}</b>` : (committed ? "hidden" : "-");
        html += `<tr><td class="mono">${v}</td><td>${hashCell(rec.evidenceHash)}</td>
          <td>${committed ? "yes" : "no"}</td><td>${rec.onPanel ? "yes" : "no"}</td><td>${vote}</td></tr>`;
      }
      html += "</table>";
    }

    // Reports filed about this project.
    const reportCount = Number(await c.methods.reportCount().call());
    let reportHtml = "";
    for (let i = 1; i <= reportCount; i++) {
      const rep = await c.methods.getReport(i).call();
      if (Number(rep.projectId) !== id) continue;
      const result = rep.resolved ? (rep.upheld ? "upheld" : "rejected") : "open";
      reportHtml += `<tr><td>${i}</td><td>${rep.round}</td><td class="mono">${rep.reporter}</td>
        <td class="mono">${rep.accused}</td><td>${hashCell(rep.reasonHash)}</td>
        <td>${rep.upholdVotes} / ${rep.rejectVotes}</td><td>${result}</td></tr>`;
    }
    if (reportHtml) {
      html += `<h3>Reports</h3><table><tr><th>ID</th><th>Round</th><th>Reporter</th><th>Accused</th>
        <th>Reason file</th><th>Uphold / Reject</th><th>Result</th></tr>${reportHtml}</table>`;
    }

    document.getElementById("detail").innerHTML = html;
    document.getElementById("detailCard").style.display = "block";
  });
}

startPage(loadProjects);

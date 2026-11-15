// verifier.js - accounts #2..#9: evidence, secret votes, rewards and reports.

const ZERO_HASH = "0x" + "0".repeat(64);
const VOTE_NAMES = ["-", "PASS", "FAIL"];

// localStorage key for a secret vote: jp-<projectId>-<round>-<address>
function voteKey(id, round) {
  return `jp-${id}-${round}-${account}`;
}
function loadSavedVote(id, round) {
  const saved = localStorage.getItem(voteKey(id, round));
  return saved ? JSON.parse(saved) : null;
}

async function loadVerifier() {
  const c = getContract();
  const infoEl = document.getElementById("verifierInfo");
  if (!account) {
    infoEl.textContent = "Connect MetaMask to see your assignments.";
    return;
  }
  const me = await c.methods.verifiers(account).call();
  if (!me.registered) {
    infoEl.innerHTML = "This account is not a registered verifier. Apply on the <a href='apply.html'>Apply</a> page.";
  } else {
    infoEl.innerHTML = `Reputation: <b>${me.reputation}</b> | Tasks done: ${me.tasksDone} |
      Penalties: ${me.penalties} ${Number(me.reputation) < 50 ? "| <b>Below 50: you will not be picked</b>" : ""}`;
  }
  await loadAssignments();
  await loadReviews();
}

// ---------- My assignments ----------
// Loops every project and every round and keeps the ones where I am assigned.
async function loadAssignments() {
  const c = getContract();
  const count = Number(await c.methods.projectCount().call());
  let html = "";
  for (let id = 1; id <= count; id++) {
    const p = await c.methods.getProject(id).call();
    for (let r = Number(p.round); r >= 1; r--) {
      const rec = await c.methods.getRecord(id, r, account).call();
      if (rec.assigned) html += await assignmentCard(id, r, p, rec);
    }
  }
  document.getElementById("assignments").innerHTML = html || '<p class="muted">No assignments yet.</p>';
}

// Builds the box for one project + round, showing only the buttons that fit.
async function assignmentCard(id, r, p, rec) {
  const c = getContract();
  const s = Number(p.status);
  const current = r === Number(p.round);
  const committed = rec.commitment !== ZERO_HASH;
  const finalized = await c.methods.roundFinalized(id, r).call();
  const saved = loadSavedVote(id, r);

  let html = `<div class="card">
    <h3>Project ${id}: ${esc(p.name)} - round ${r}
      <span class="badge s${s}">${current ? STATUS_NAMES[s] : "old round"}</span>
      ${rec.onPanel ? '<span class="badge s4">on panel</span>' : ""}</h3>
    <p class="muted">Completion file: <span class="hash">${esc(p.completionHash)}</span>
      <button class="secondary" onclick="verifyFile('${esc(p.completionHash)}', this.nextElementSibling)">Verify file</button><span></span></p>`;

  // Evidence
  if (rec.evidenceHash) {
    html += `<p>Evidence sent: <span class="hash">${esc(rec.evidenceHash)}</span></p>`;
  } else if (current && s === 2) {
    html += `<div class="row">Site photo: <input type="file" id="ev-${id}">
      <button onclick="sendEvidence(this, ${id})">Upload evidence</button></div>`;
  }

  // Commit phase: choose PASS/FAIL and a secret word
  if (current && s === 2 && !committed) {
    html += `<div class="row">
      <select id="vote-${id}"><option value="1">PASS</option><option value="2">FAIL</option></select>
      <input id="secret-${id}" placeholder="secret word">
      <button onclick="commit(this, ${id}, ${r})">Commit vote</button></div>`;
  }
  if (committed && !rec.revealed) {
    html += "<p>Vote locked (hidden).</p>";
    if (saved) html += `<div class="secret-box">Your saved vote: ${VOTE_NAMES[saved.vote]} | secret: ${esc(saved.secret)}
      <br>Write this down. You need it to reveal.</div>`;
  }

  // Reveal phase
  if (current && s === 3 && committed && !rec.revealed) {
    html += `<p>${rec.onPanel ? "You are on the panel: your vote counts." : "You are not on the panel, but you must still reveal to finish your task."}</p>
      <div class="row">
      <select id="rvote-${id}">
        <option value="1" ${saved && saved.vote == 1 ? "selected" : ""}>PASS</option>
        <option value="2" ${saved && saved.vote == 2 ? "selected" : ""}>FAIL</option></select>
      <input id="rsecret-${id}" value="${saved ? esc(saved.secret) : ""}" placeholder="secret word">
      <button onclick="reveal(this, ${id})">Reveal</button></div>`;
  }
  if (rec.revealed) html += `<p>Revealed vote: <b>${VOTE_NAMES[rec.vote]}</b></p>`;

  // After the round is finalized: reward and reports
  if (finalized) {
    if (rec.rewardClaimed) {
      html += "<p>Reward claimed.</p>";
    } else {
      html += `<button onclick="claim(this, ${id}, ${r})">Claim reward (${toEth(p.rewardPerVerifier)})</button>`;
    }
    if (s !== 6) {
      const others = (await c.methods.getAssigned(id, r).call()).filter((a) => !sameAddr(a, account));
      html += `<div class="row">Report a verifier:
        <select id="acc-${id}-${r}">${others.map((a) => `<option>${a}</option>`).join("")}</select>
        reason file: <input type="file" id="reason-${id}-${r}">
        <button class="danger" onclick="report(this, ${id}, ${r})">Report</button></div>`;
    }
  }
  return html + "</div>";
}

// Upload a site photo, then save its hash on-chain.
async function sendEvidence(btn, id) {
  await run(btn, async () => {
    const hash = await uploadFile(document.getElementById("ev-" + id).files[0]);
    await sendTx(getContract().methods.submitEvidence(id, hash), { from: account });
    showMessage("Evidence submitted for project " + id);
    await loadVerifier();
  });
}

// Secret vote: commitment = makeCommitment(vote, secret, me), computed by the
// contract itself so JavaScript and Solidity always agree.
async function commit(btn, id, round) {
  await run(btn, async () => {
    const vote = Number(document.getElementById("vote-" + id).value);
    const secret = document.getElementById("secret-" + id).value;
    if (!secret) throw new Error("Type a secret word first");
    const c = getContract();
    const commitment = await c.methods.makeCommitment(vote, secret, account).call();
    // Save first, so the secret is never lost even if the page closes.
    localStorage.setItem(voteKey(id, round), JSON.stringify({ vote, secret }));
    try {
      await sendTx(c.methods.commitVote(id, commitment), { from: account });
    } catch (err) {
      localStorage.removeItem(voteKey(id, round)); // commit failed, forget it
      throw err;
    }
    showMessage(`Vote committed. Your secret is "${secret}". Write it down!`);
    await loadVerifier();
  });
}

async function reveal(btn, id) {
  await run(btn, async () => {
    const vote = Number(document.getElementById("rvote-" + id).value);
    const secret = document.getElementById("rsecret-" + id).value;
    await sendTx(getContract().methods.revealVote(id, vote, secret), { from: account });
    showMessage("Vote revealed: " + VOTE_NAMES[vote]);
    await loadVerifier();
  });
}

async function claim(btn, id, round) {
  await run(btn, async () => {
    await sendTx(getContract().methods.claimReward(id, round), { from: account });
    showMessage("Reward claimed for project " + id + ", round " + round);
    await loadVerifier();
  });
}

// Upload the reason file, then file the report on-chain.
async function report(btn, id, round) {
  await run(btn, async () => {
    const accused = document.getElementById(`acc-${id}-${round}`).value;
    const hash = await uploadFile(document.getElementById(`reason-${id}-${round}`).files[0]);
    await sendTx(getContract().methods.fileReport(id, round, accused, hash), { from: account });
    showMessage("Report filed against " + accused);
    await loadVerifier();
  });
}

// ---------- Reports I review ----------
async function loadReviews() {
  const c = getContract();
  const count = Number(await c.methods.reportCount().call());
  let html = "";
  for (let i = 1; i <= count; i++) {
    const reviewers = await c.methods.getReviewers(i).call();
    if (!reviewers.some((a) => sameAddr(a, account))) continue;
    const r = await c.methods.getReport(i).call();
    const voted = await c.methods.hasReviewed(i, account).call();
    const total = Number(r.upholdVotes) + Number(r.rejectVotes);
    html += `<div class="card"><h3>Report ${i} (project ${r.projectId}, round ${r.round})</h3>
      <p>Accused: <span class="mono">${r.accused}</span><br>
      Reason file: <span class="hash">${esc(r.reasonHash)}</span>
      <button class="secondary" onclick="verifyFile('${esc(r.reasonHash)}', this.nextElementSibling)">Verify file</button><span></span>
      <a href="/files/${esc(r.reasonHash)}" target="_blank">open</a><br>
      Votes: ${r.upholdVotes} uphold / ${r.rejectVotes} reject</p>`;
    if (r.resolved) {
      html += `<p>Resolved: <b>${r.upheld ? "upheld" : "rejected"}</b></p>`;
    } else {
      if (!voted) {
        html += `<button onclick="voteReport(this, ${i}, true)">Uphold</button>
          <button class="secondary" onclick="voteReport(this, ${i}, false)">Reject</button>`;
      } else {
        html += "<p>You voted.</p>";
      }
      if (total === reviewers.length) {
        html += `<button onclick="resolve(this, ${i})">Resolve report</button>`;
      }
    }
    html += "</div>";
  }
  document.getElementById("reviews").innerHTML = html || '<p class="muted">No reports to review.</p>';
}

async function voteReport(btn, id, uphold) {
  await run(btn, async () => {
    await sendTx(getContract().methods.voteOnReport(id, uphold), { from: account });
    showMessage("Your review vote is saved");
    await loadVerifier();
  });
}

async function resolve(btn, id) {
  await run(btn, async () => {
    await sendTx(getContract().methods.resolveReport(id), { from: account });
    showMessage("Report " + id + " resolved");
    await loadVerifier();
  });
}

startPage(loadVerifier);

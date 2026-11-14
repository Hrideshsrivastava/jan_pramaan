# Jan Pramaan - Demo Script (about 15 minutes)

Exact order of clicks and MetaMask account switches for the demo in section 8 of the spec.

Accounts: **#0** = Government, **#1** = Contractor, **#2-#9** = Verifiers.
"Switch to #N" means: open MetaMask, pick account #N. The page reloads by itself.

Demo numbers: budget **25 ETH**, reward **0.1 ETH** -> **5 verifiers**, panel of **3**,
**2 PASS** needed, contractor gets **24.5 ETH**.

---

## Before the audience arrives (setup)

1. Ganache GUI open on the saved workspace (RPC `http://127.0.0.1:7545`, chain ID `1337`).
2. Remix: compile `JanPramaan.sol` (0.8.19, optimization 200), deploy with
   "Injected Provider - MetaMask" on account **#0**.
3. Paste the deployed address into `CONTRACT_ADDRESS` and the ABI into
   `CONTRACT_ABI` in `frontend/js/config.js`.
4. Terminal: `cd backend`, `npm install`, `node server.js`.
5. Browser: open `http://localhost:3000`, click **Connect MetaMask**. The Projects page shows `(0)`.
6. Register 6 of the 8 verifiers in advance (accounts **#2-#7**), so only 2 sign-ups are shown live:
   - For each of #2..#7: switch to that account -> **Apply** page -> wallet is filled in ->
     name, age 25, a different 12-digit ID -> **Submit application**.
   - Switch to **#0** -> **Government** page -> **Approve** each one -> confirm in MetaMask.
7. Have these files ready on the desktop: `details.pdf`, `completion.jpg`, a few `site-photo.jpg`, `reason.txt`.
8. Clear MetaMask activity data if Ganache was reset (avoids nonce errors).

---

## Live demo

### 1. Citizens apply, government approves (#8, #9, #0)

1. Switch to **#8** -> **Apply** -> fill name, age, 12-digit ID -> **Submit application**.
   Point out: "Name and ID stay on the backend. Nothing personal goes on-chain."
2. Switch to **#9** -> **Apply** -> same with a different ID -> **Submit application**.
3. Switch to **#0** -> **Government**.
   - In *Verifier applications* both show `pending` and only the **last 4 digits** of the ID.
   - Click **Approve** for #8 -> confirm in MetaMask. Then **Approve** for #9 -> confirm.
   - *Registered verifiers* now lists 8 accounts, each with reputation **100**.
4. Still on **#0**: paste account #1's address in *Add contractor* -> **Add contractor** -> confirm.

### 2. Government creates the 25 ETH project (#0)

1. *Create project*: name, location, choose `details.pdf`, contractor = #1's address
   (already filled after step 1.4), budget **25**, reward **0.1**.
2. Point at the line "This gives 5 verifiers per round and 24.5 ETH for the contractor."
3. **Create project** -> confirm in MetaMask (25 ETH leaves account #0).
4. Show *Contract balance: 25 ETH* on the page, and the contract balance in Ganache.

### 3. Contractor submits completion (#1)

1. Switch to **#1** -> **Contractor** page.
2. Under the project: choose `completion.jpg` -> **Submit completion** -> confirm.
   Status becomes `CompletionClaimed`.

### 4. Government starts verification (#0)

1. Switch to **#0** -> **Government** -> **Start verification** -> confirm.
2. Go to **Projects** page -> click the project -> *Round 1* shows the **5 randomly assigned** accounts.
   Write down which accounts they are.

### 5. Each assigned verifier: evidence + secret vote (5 x verifier accounts)

For **each** of the 5 assigned accounts:

1. Switch to that account -> **Verifier** page.
2. *(First verifier only - failure demo)*: type a secret and click **Commit vote** before uploading
   evidence -> red box: **"Upload evidence first"**.
3. Choose a site photo -> **Upload evidence** -> confirm.
4. Pick **PASS** (or **FAIL** for one of them), type a secret word -> **Commit vote** -> confirm.
5. The yellow box shows the saved vote and secret. Say: "Write this down - it is also saved in the browser."

Then open **Projects** -> click the project: every vote shows **"hidden"**. Nobody can see the votes yet.

### 6. Government closes the commit phase (#0)

1. Switch to **#0** -> **Government**. The row shows "5 of 5 committed".
2. **Close commit phase** -> confirm.
3. **Projects** page -> click the project: the **Panel** line now shows **3 accounts**, chosen only now,
   after every vote was locked.

### 7. Verifiers reveal (5 x verifier accounts)

For each of the 5 assigned accounts: switch -> **Verifier** page.

1. *(First one only - failure demo)*: change the secret box to a wrong word -> **Reveal**
   -> red box: **"Vote does not match"**. Put the right secret back.
2. **Reveal** -> confirm. (The vote and secret are pre-filled from the browser.)

Every assigned verifier reveals, even if not on the panel - otherwise they lose 20 reputation.

### 8. Government finalizes (#0)

1. Switch to **#0** -> **Government** -> **Finalize round** -> confirm.
2. Status becomes **Verified**. In *Registered verifiers*, the 5 assigned accounts went **100 -> 110**.

### 9. Anyone verifies a file (any account)

1. **Projects** page -> click the project -> next to *Latest completion file* click **Verify file**
   -> **"MATCH - file is unchanged"**.
2. In a file explorer, open `backend/uploads/<that hash>` and change/replace its contents. Save.
3. Click **Verify file** again -> **"MISMATCH - file was changed"**.
4. Put the original file back (so later steps still match).

### 10. Optional: a report (verifier accounts)

1. Switch to one assigned verifier -> **Verifier** page -> in *Report a verifier* pick another
   assigned account, choose `reason.txt` -> **Report** -> confirm.
2. Switch to **#0** -> **Government** -> **Release payment** -> red box: **"Open reports"**
   (payment is blocked while a report is open).
3. **Government** -> *Reports* table: note the report. Find the 3 reviewers on
   **Projects** -> project -> Reports, or in each verifier's *Reports I review* box.
4. For each of the 3 reviewers: switch -> **Verifier** -> **Uphold** -> confirm.
5. The last reviewer clicks **Resolve report** -> confirm (or #0 clicks **Resolve report** on Government).
6. Show the accused's reputation drop by **50** and penalties = 1 on the Government page.

### 11. Payment and rewards (#0, two verifiers)

1. Note account #1's balance in Ganache.
2. Switch to **#0** -> **Government** -> **Release payment** -> confirm. Status `Paid`.
3. Ganache: account #1 is up by **24.5 ETH**.
4. Switch to two assigned verifiers in turn -> **Verifier** -> **Claim reward (0.1 ETH)** -> confirm.
   Each gets 0.1 ETH once. (A penalized verifier gets **"Penalized"** if they try.)

---

## Backup: failed round (if asked)

1. Create a second project (step 2). Contractor submits (step 3). Start verification (step 4).
2. Every assigned verifier votes **FAIL** (steps 5-7). Finalize -> status **Failed**.
3. Switch to **#1** -> **Contractor**: the note says the next round's fee (0.5 ETH) comes out of the pay.
4. Choose a new photo -> **Submit completion**: "You will get" drops from **24.5 ETH to 24 ETH**, round 2.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| Red box "Paste the deployed contract address..." | Fill in `frontend/js/config.js` and reload |
| MetaMask "nonce too high" after a Ganache reset | MetaMask -> Settings -> Advanced -> Clear activity tab data |
| Page shows old data | Reload the page (it also reloads on every account switch) |
| "Only government" | You are not on account #0 |
| Lost the secret | It is in the browser's localStorage under `jp-<projectId>-<round>-<address>` |

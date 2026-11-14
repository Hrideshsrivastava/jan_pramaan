// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./JPStorage.sol";

///  verifier registry, reputation and reports.
/// We inherit JPStorage, so all the mappings and helpers are already here.
contract VerifierRegistry is JPStorage {

    
    //  Register a verifier (only government, after the off-chain check)
   
    function registerVerifier(address v) external onlyAdmin {
        // a person can only be registered once
        require(!verifiers[v].registered, "Already registered");
        // a contractor must never judge work (conflict of interest)
        require(!isContractor[v], "Is a contractor");
        // the government itself cannot be a verifier
        require(v != admin, "Admin cannot be verifier");

        // give them a fresh profile with starting reputation (100)
        verifiers[v].registered = true;
        verifiers[v].reputation = START_REPUTATION;

        // add to the list so we can pick them randomly later
        verifierList.push(v);

        emit VerifierRegistered(v);
    }

    
    //  A verifier reports another verifier from the same round
  
    function fileReport(
        uint projectId,
        uint round,
        address accused,
        string memory reasonHash
    ) external projectExists(projectId) returns (uint) {
        // reports are only allowed after the round is over
        require(roundFinalized[projectId][round], "Round not finalized");

        // both people must have actually worked in that round
        require(records[projectId][round][msg.sender].assigned, "You were not assigned");
        require(records[projectId][round][accused].assigned, "Accused was not assigned");

        // cannot report yourself
        require(msg.sender != accused, "Cannot report yourself");

        // once the contractor is paid the project is closed
        require(projects[projectId].status != Status.Paid, "Project already paid");

        // only one open report per accused person per round
        require(!underReport[projectId][round][accused], "Already under report");

        // pick 3 random reviewers, leaving out the reporter and the accused
        address[] memory chosen = _pickRandom(
            _eligibleVerifiers(msg.sender, accused),
            REVIEWERS_PER_REPORT,
            reportCount + 1
        );

        // new report id (ids start from 1)
        reportCount++;
        uint id = reportCount;

        // save the report; votes start at 0, not resolved, not upheld
        reports[id] = Report(
            id,
            projectId,
            round,
            msg.sender,
            accused,
            reasonHash,
            0,
            0,
            false,
            false
        );
        reviewers[id] = chosen;

        // this open report will block releasePayment until it is resolved
        openReports[projectId]++;
        // and it freezes the accused's reward for now
        underReport[projectId][round][accused] = true;

        emit ReportFiled(id, projectId, round, accused, chosen);
        return id;
    }

    
    //  One of the 3 chosen reviewers votes
    
    function voteOnReport(uint reportId, bool uphold) external {
        require(reportId > 0 && reportId <= reportCount, "No such report");

        Report storage r = reports[reportId];
        require(!r.resolved, "Already resolved");

        // check that the caller is really one of the reviewers
        bool isReviewer = false;
        address[] storage list = reviewers[reportId];
        for (uint i = 0; i < list.length; i++) {
            if (list[i] == msg.sender) {
                isReviewer = true;
                break;
            }
        }
        require(isReviewer, "Not a reviewer");

        // one vote per reviewer
        require(!hasReviewed[reportId][msg.sender], "Already voted");

        // count the vote
        if (uphold) {
            r.upholdVotes++;
        } else {
            r.rejectVotes++;
        }
        hasReviewed[reportId][msg.sender] = true;
    }

    
    //  Close the report and change reputations
    //    Anyone can call it once all 3 voted; government can call any time
    
    function resolveReport(uint reportId) external {
        require(reportId > 0 && reportId <= reportCount, "No such report");

        Report storage r = reports[reportId];
        require(!r.resolved, "Already resolved");

        // normal people must wait for all 3 votes; the government can skip this
        if (msg.sender != admin) {
            require(
                r.upholdVotes + r.rejectVotes == REVIEWERS_PER_REPORT,
                "Not all reviewers voted"
            );
        }

        // majority rule: 2 out of 3 is enough to uphold
        bool upheld = r.upholdVotes >= 2;
        r.upheld = upheld;
        r.resolved = true;

        if (upheld) {
            // accused was guilty: -50 reputation, a penalty mark, reward blocked
            _changeReputation(r.accused, -50);
            verifiers[r.accused].penalties++;
            penalized[r.projectId][r.round][r.accused] = true;
        } else {
            // false report: the reporter loses 10 reputation
            _changeReputation(r.reporter, -10);
        }

        // reviewers who actually voted get +5 for their effort
        address[] storage list = reviewers[reportId];
        for (uint i = 0; i < list.length; i++) {
            if (hasReviewed[reportId][list[i]]) {
                _changeReputation(list[i], 5);
            }
        }

        // report is closed, so it no longer blocks payment
        openReports[r.projectId]--;
        underReport[r.projectId][r.round][r.accused] = false;

        emit ReportResolved(reportId, upheld);
    }
}

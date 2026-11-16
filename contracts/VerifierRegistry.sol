// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./JPStorage.sol";

contract VerifierRegistry is JPStorage {
    function registerVerifier(address v) external onlyAdmin {
        require(!verifiers[v].registered, "Already registered");
        require(!isContractor[v], "Is a contractor");
        require(v != admin, "Admin cannot be verifier");

        verifiers[v].registered = true;
        verifiers[v].reputation = START_REPUTATION;

        verifierList.push(v);

        emit VerifierRegistered(v);
    }

    function fileReport(
        uint projectId,
        uint round,
        address accused,
        string memory reasonHash
    ) external projectExists(projectId) returns (uint) {
        require(roundFinalized[projectId][round], "Round not finalized");

        require(records[projectId][round][msg.sender].assigned, "You were not assigned");
        require(records[projectId][round][accused].assigned, "Accused was not assigned");

        require(msg.sender != accused, "Cannot report yourself");

        require(projects[projectId].status != Status.Paid, "Project already paid");

        require(!underReport[projectId][round][accused], "Already under report");

        address[] memory chosen = _pickRandom(
            _eligibleVerifiers(msg.sender, accused),
            REVIEWERS_PER_REPORT,
            reportCount + 1
        );

        reportCount++;
        uint id = reportCount;

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

        openReports[projectId]++;
        underReport[projectId][round][accused] = true;

        emit ReportFiled(id, projectId, round, accused, chosen);
        return id;
    }

    function voteOnReport(uint reportId, bool uphold) external {
        require(reportId > 0 && reportId <= reportCount, "No such report");

        Report storage r = reports[reportId];
        require(!r.resolved, "Already resolved");

        bool isReviewer = false;
        address[] storage list = reviewers[reportId];
        for (uint i = 0; i < list.length; i++) {
            if (list[i] == msg.sender) {
                isReviewer = true;
                break;
            }
        }
        require(isReviewer, "Not a reviewer");

        require(!hasReviewed[reportId][msg.sender], "Already voted");

        if (uphold) {
            r.upholdVotes++;
        } else {
            r.rejectVotes++;
        }
        hasReviewed[reportId][msg.sender] = true;
    }

    function resolveReport(uint reportId) external {
        require(reportId > 0 && reportId <= reportCount, "No such report");

        Report storage r = reports[reportId];
        require(!r.resolved, "Already resolved");

        if (msg.sender != admin) {
            require(
                r.upholdVotes + r.rejectVotes == REVIEWERS_PER_REPORT,
                "Not all reviewers voted"
            );
        }

        bool upheld = r.upholdVotes >= 2;
        r.upheld = upheld;
        r.resolved = true;

        if (upheld) {
            _changeReputation(r.accused, -50);
            verifiers[r.accused].penalties++;
            penalized[r.projectId][r.round][r.accused] = true;
        } else {
            _changeReputation(r.reporter, -10);
        }

        address[] storage list = reviewers[reportId];
        for (uint i = 0; i < list.length; i++) {
            if (hasReviewed[reportId][list[i]]) {
                _changeReputation(list[i], 5);
            }
        }

        openReports[r.projectId]--;
        underReport[r.projectId][r.round][r.accused] = false;

        emit ReportResolved(reportId, upheld);
    }
}

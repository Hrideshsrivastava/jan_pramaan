// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./JPStorage.sol";

/// @notice Runs the verifier commit/reveal process for project completion.
contract VerificationManager is JPStorage {
    /// @notice Assign eligible verifiers to the current verification round.
    function startVerification(uint projectId) external onlyAdmin projectExists(projectId) {
        Project storage p = projects[projectId];
        require(p.status == Status.CompletionClaimed, "Project not ready");

        uint round = p.round;
        address[] memory pool = _eligibleVerifiers(address(0), address(0));
        address[] memory chosen = _pickRandom(
            pool,
            p.verifierCount,
            projectId * 1000 + round
        );

        // Save the assignment both in each verifier's record and the round list.
        for (uint i = 0; i < chosen.length; i++) {
            records[projectId][round][chosen[i]].assigned = true;
            assigned[projectId][round].push(chosen[i]);
        }

        p.status = Status.Commit;
        emit VerifiersAssigned(projectId, round, chosen);
    }

    /// @notice Store a verifier's evidence hash during the commit phase.
    function submitEvidence(uint projectId, string memory evidenceHash)
        external
        projectExists(projectId)
    {
        Project storage p = projects[projectId];
        require(p.status == Status.Commit, "Not in commit phase");

        uint round = p.round;
        Record storage r = records[projectId][round][msg.sender];
        require(r.assigned, "Not assigned");
        require(bytes(r.evidenceHash).length == 0, "Evidence already submitted");
        require(bytes(evidenceHash).length > 0, "Evidence hash is empty");

        r.evidenceHash = evidenceHash;
        emit EvidenceSubmitted(projectId, round, msg.sender, evidenceHash);
    }

    /// @notice Lock a verifier's hidden vote commitment during the commit phase.
    function commitVote(uint projectId, bytes32 commitment)
        external
        projectExists(projectId)
    {
        Project storage p = projects[projectId];
        require(p.status == Status.Commit, "Not in commit phase");

        uint round = p.round;
        Record storage r = records[projectId][round][msg.sender];
        require(r.assigned, "Not assigned");
        require(bytes(r.evidenceHash).length > 0, "Upload evidence first");

        // Check the list so even a zero-valued commitment cannot be submitted twice.
        address[] storage list = committers[projectId][round];
        for (uint i = 0; i < list.length; i++) {
            require(list[i] != msg.sender, "Already committed");
        }

        r.commitment = commitment;
        list.push(msg.sender);
        emit VoteCommitted(projectId, round, msg.sender);
    }

    /// @notice Select a random deciding panel from verifiers who committed.
    function closeCommitPhase(uint projectId) external onlyAdmin projectExists(projectId) {
        Project storage p = projects[projectId];
        require(p.status == Status.Commit, "Not in commit phase");

        uint round = p.round;
        address[] storage storedCommitters = committers[projectId][round];
        uint committerCount = storedCommitters.length;
        require(committerCount > 0, "No committed votes");

        uint panelSize = committerCount < PANEL_SIZE ? committerCount : PANEL_SIZE;

        // _pickRandom reorders its input, so pass it a fresh memory copy.
        address[] memory copy = new address[](committerCount);
        for (uint i = 0; i < committerCount; i++) {
            copy[i] = storedCommitters[i];
        }
        address[] memory chosen = _pickRandom(
            copy,
            panelSize,
            projectId * 1000 + round + 7
        );

        for (uint i = 0; i < chosen.length; i++) {
            records[projectId][round][chosen[i]].onPanel = true;
            panel[projectId][round].push(chosen[i]);
        }

        p.status = Status.Reveal;
        emit PanelSelected(projectId, round, chosen);
    }

    /// @notice Reveal a committed vote and verify it matches its commitment.
    function revealVote(uint projectId, uint8 vote, string memory secret)
        external
        projectExists(projectId)
    {
        Project storage p = projects[projectId];
        require(p.status == Status.Reveal, "Not in reveal phase");

        uint round = p.round;
        Record storage r = records[projectId][round][msg.sender];

        bool committed = false;
        address[] storage list = committers[projectId][round];
        for (uint i = 0; i < list.length; i++) {
            if (list[i] == msg.sender) {
                committed = true;
                break;
            }
        }
        require(committed, "No committed vote");
        require(!r.revealed, "Already revealed");
        require(vote == 1 || vote == 2, "Vote must be 1 or 2");
        require(
            makeCommitment(vote, secret, msg.sender) == r.commitment,
            "Vote does not match"
        );

        r.vote = Vote(vote);
        r.revealed = true;
        emit VoteRevealed(projectId, round, msg.sender, vote);
    }

    /// @notice Decide the round and update reputation for every assigned verifier.
    function finalizeRound(uint projectId) external onlyAdmin projectExists(projectId) {
        Project storage p = projects[projectId];
        require(p.status == Status.Reveal, "Not in reveal phase");

        uint round = p.round;
        uint passVotes = 0;
        address[] storage selectedPanel = panel[projectId][round];
        for (uint i = 0; i < selectedPanel.length; i++) {
            Record storage r = records[projectId][round][selectedPanel[i]];
            if (r.revealed && r.vote == Vote.Pass) {
                passVotes++;
            }
        }

        bool passed = passVotes >= PASS_NEEDED;
        p.status = passed ? Status.Verified : Status.Failed;

        address[] storage roundAssignees = assigned[projectId][round];
        for (uint i = 0; i < roundAssignees.length; i++) {
            address verifier = roundAssignees[i];
            if (_completed(projectId, round, verifier)) {
                _changeReputation(verifier, 10);
                verifiers[verifier].tasksDone++;
            } else {
                _changeReputation(verifier, -20);
            }
        }

        roundFinalized[projectId][round] = true;
        emit RoundFinalized(projectId, round, passed, passVotes);
    }
}

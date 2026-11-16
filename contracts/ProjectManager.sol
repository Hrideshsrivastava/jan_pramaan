// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./JPStorage.sol";

contract ProjectManager is JPStorage {
    function addContractor(address c) external onlyAdmin {
        require(c != admin, "Admin cannot be contractor");
        require(!verifiers[c].registered, "Already a verifier");
        isContractor[c] = true;
    }

    function createProject(
        string memory name,
        string memory location,
        string memory detailsHash,
        address contractor,
        uint rewardPerVerifier
    ) external payable onlyAdmin returns (uint) {
        require(isContractor[contractor], "Not a contractor");
        require(msg.value > 0, "Budget must be above 0");
        require(rewardPerVerifier > 0, "Reward must be above 0");

        uint n = (msg.value * VERIFICATION_PERCENT / 100) / rewardPerVerifier;
        require(n >= PANEL_SIZE, "Budget too small for a panel");
        require(n <= _eligibleVerifiers(address(0), address(0)).length, "Not enough verifiers");

        projectCount++;
        Project storage p = projects[projectCount];
        p.id = projectCount;
        p.name = name;
        p.location = location;
        p.detailsHash = detailsHash;
        p.contractor = contractor;
        p.budget = msg.value;
        p.contractorAmount = msg.value - n * rewardPerVerifier;
        p.rewardPerVerifier = rewardPerVerifier;
        p.verifierCount = n;
        p.round = 0;
        p.status = Status.Created;

        emit ProjectCreated(p.id, p.name, p.contractor, p.budget, p.verifierCount);
        return p.id;
    }

    function submitCompletion(uint projectId, string memory completionHash)
        external projectExists(projectId)
    {
        Project storage p = projects[projectId];
        require(msg.sender == p.contractor, "Only project contractor");
        require(p.status == Status.Created || p.status == Status.Failed, "Cannot submit now");

        if (p.round >= 1) {
            uint fee = p.verifierCount * p.rewardPerVerifier;
            require(p.contractorAmount >= fee, "Not enough left for verifier fees");
            p.contractorAmount -= fee;
        }

        p.round++;
        p.completionHash = completionHash;
        p.status = Status.CompletionClaimed;

        emit CompletionSubmitted(projectId, p.round, completionHash);
    }

    function releasePayment(uint projectId) external onlyAdmin projectExists(projectId) {
        Project storage p = projects[projectId];
        require(p.status == Status.Verified, "Project not verified");
        require(openReports[projectId] == 0, "Open reports pending");

        p.status = Status.Paid;
        uint amount = p.contractorAmount;
        payable(p.contractor).transfer(amount);

        emit PaymentReleased(projectId, p.contractor, amount);
    }

    function claimReward(uint projectId, uint round) external projectExists(projectId) {
        require(roundFinalized[projectId][round], "Round not finalized");
        require(_completed(projectId, round, msg.sender), "You did not finish all steps");
        require(!underReport[projectId][round][msg.sender], "Report pending against you");
        require(!penalized[projectId][round][msg.sender], "You were penalized");

        Record storage r = records[projectId][round][msg.sender];
        require(!r.rewardClaimed, "Reward already claimed");

        r.rewardClaimed = true;
        uint amount = projects[projectId].rewardPerVerifier;
        payable(msg.sender).transfer(amount);

        emit RewardClaimed(projectId, round, msg.sender, amount);
    }
}

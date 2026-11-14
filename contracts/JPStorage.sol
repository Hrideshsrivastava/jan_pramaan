// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// Shared base for Jan Pramaan. FROZEN: change only if all four agree.
contract JPStorage {
    // ---------- Settings ----------
    uint public constant VERIFICATION_PERCENT = 2;   // 2% of budget pays verifiers
    uint public constant PANEL_SIZE = 3;             // deciding subset (demo size)
    uint public constant PASS_NEEDED = 2;            // PASS votes needed from the panel
    uint public constant REVIEWERS_PER_REPORT = 3;
    uint public constant START_REPUTATION = 100;
    uint public constant MIN_REPUTATION = 50;        // below this, never picked

    // ---------- Types ----------
    enum Status { Created, CompletionClaimed, Commit, Reveal, Verified, Failed, Paid }
    enum Vote { None, Pass, Fail }

    struct Project {
        uint id;
        string name;
        string location;
        string detailsHash;        // SHA-256 hex of the details file
        address contractor;
        uint budget;               // wei locked at creation
        uint contractorAmount;     // wei the contractor will receive
        uint rewardPerVerifier;    // wei
        uint verifierCount;        // N per round
        uint round;                // 0 until the first completion claim
        Status status;
        string completionHash;     // SHA-256 hex of the latest completion file
    }

    struct Record {                // one verifier in one round
        bool assigned;
        string evidenceHash;
        bytes32 commitment;
        Vote vote;
        bool revealed;
        bool onPanel;
        bool rewardClaimed;
    }

    struct Verifier {
        bool registered;
        uint reputation;
        uint tasksDone;
        uint penalties;
    }

    struct Report {
        uint id;
        uint projectId;
        uint round;
        address reporter;
        address accused;
        string reasonHash;
        uint upholdVotes;
        uint rejectVotes;
        bool resolved;
        bool upheld;
    }

    // ---------- State ----------
    address public admin;                              // government = deployer
    mapping(address => bool) public isContractor;

    uint public projectCount;                          // project ids start at 1
    mapping(uint => Project) internal projects;

    // projectId => round => ...
    mapping(uint => mapping(uint => address[])) internal assigned;
    mapping(uint => mapping(uint => address[])) internal committers;
    mapping(uint => mapping(uint => address[])) internal panel;
    mapping(uint => mapping(uint => mapping(address => Record))) internal records;
    mapping(uint => mapping(uint => bool)) public roundFinalized;

    mapping(address => Verifier) public verifiers;
    address[] internal verifierList;

    uint public reportCount;                           // report ids start at 1
    mapping(uint => Report) internal reports;
    mapping(uint => address[]) internal reviewers;     // reportId => reviewers
    mapping(uint => mapping(address => bool)) public hasReviewed;
    mapping(uint => uint) public openReports;          // projectId => unresolved reports
    mapping(uint => mapping(uint => mapping(address => bool))) public underReport; // project => round => verifier
    mapping(uint => mapping(uint => mapping(address => bool))) public penalized;

    // ---------- Events ----------
    event ProjectCreated(uint projectId, string name, address contractor, uint budget, uint verifierCount);
    event CompletionSubmitted(uint projectId, uint round, string completionHash);
    event VerifiersAssigned(uint projectId, uint round, address[] verifiers);
    event EvidenceSubmitted(uint projectId, uint round, address verifier, string evidenceHash);
    event VoteCommitted(uint projectId, uint round, address verifier);
    event PanelSelected(uint projectId, uint round, address[] panel);
    event VoteRevealed(uint projectId, uint round, address verifier, uint8 vote);
    event RoundFinalized(uint projectId, uint round, bool passed, uint passVotes);
    event PaymentReleased(uint projectId, address contractor, uint amount);
    event RewardClaimed(uint projectId, uint round, address verifier, uint amount);
    event VerifierRegistered(address verifier);
    event ReputationChanged(address verifier, uint newReputation);
    event ReportFiled(uint reportId, uint projectId, uint round, address accused, address[] reviewers);
    event ReportResolved(uint reportId, bool upheld);

    // ---------- Modifiers ----------
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only government");
        _;
    }

    modifier projectExists(uint projectId) {
        require(projectId > 0 && projectId <= projectCount, "No such project");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ---------- Shared helpers ----------
    function _random(uint salt) internal view returns (uint) {
        return uint(keccak256(abi.encodePacked(block.timestamp, blockhash(block.number - 1), salt)));
    }

    // Picks `count` different addresses from `pool` at random.
    // Note: this reorders `pool`, so always pass a freshly built array.
    function _pickRandom(address[] memory pool, uint count, uint salt)
        internal view returns (address[] memory picked)
    {
        require(count <= pool.length, "Not enough people to pick from");
        picked = new address[](count);
        uint remaining = pool.length;
        for (uint i = 0; i < count; i++) {
            uint j = _random(salt + i) % remaining;
            picked[i] = pool[j];
            pool[j] = pool[remaining - 1];   // move the last one into the gap
            remaining--;
        }
    }

    // Registered verifiers with reputation >= MIN_REPUTATION, except skip1 and skip2.
    function _eligibleVerifiers(address skip1, address skip2) internal view returns (address[] memory) {
        uint n = 0;
        for (uint i = 0; i < verifierList.length; i++) {
            address v = verifierList[i];
            if (verifiers[v].reputation >= MIN_REPUTATION && v != skip1 && v != skip2) n++;
        }
        address[] memory list = new address[](n);
        uint k = 0;
        for (uint i = 0; i < verifierList.length; i++) {
            address v = verifierList[i];
            if (verifiers[v].reputation >= MIN_REPUTATION && v != skip1 && v != skip2) {
                list[k] = v;
                k++;
            }
        }
        return list;
    }

    // Adds or subtracts reputation, never below 0.
    function _changeReputation(address v, int change) internal {
        int updated = int(verifiers[v].reputation) + change;
        verifiers[v].reputation = updated < 0 ? 0 : uint(updated);
        emit ReputationChanged(v, verifiers[v].reputation);
    }

    // True if the verifier did every step: evidence, commit and reveal.
    function _completed(uint projectId, uint round, address v) internal view returns (bool) {
        Record storage r = records[projectId][round][v];
        return r.assigned && bytes(r.evidenceHash).length > 0 && r.commitment != bytes32(0) && r.revealed;
    }

    // ---------- Read functions for the frontend ----------
    function makeCommitment(uint8 vote, string memory secret, address voter) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(vote, secret, voter));
    }

    function getProject(uint projectId) external view returns (Project memory) {
        return projects[projectId];
    }

    function getRecord(uint projectId, uint round, address v) external view returns (Record memory) {
        return records[projectId][round][v];
    }

    function getReport(uint reportId) external view returns (Report memory) {
        return reports[reportId];
    }

    function getAssigned(uint projectId, uint round) external view returns (address[] memory) {
        return assigned[projectId][round];
    }

    function getCommitters(uint projectId, uint round) external view returns (address[] memory) {
        return committers[projectId][round];
    }

    function getPanel(uint projectId, uint round) external view returns (address[] memory) {
        return panel[projectId][round];
    }

    function getVerifierList() external view returns (address[] memory) {
        return verifierList;
    }

    function getReviewers(uint reportId) external view returns (address[] memory) {
        return reviewers[reportId];
    }
}

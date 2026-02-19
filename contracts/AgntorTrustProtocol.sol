// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgntorTrustProtocol
 * @author Natnael Getenew Zeleke (@Garinmckayl)
 * @notice Onchain trust layer for autonomous AI agent economies.
 *         Part of the Agntor Trust Protocol — security infrastructure
 *         for OpenClaw-style AI agents operating on BNB Chain.
 *
 * Three modules in one contract:
 *   1. Agent Registry   — register agents with audit levels, constraints, metadata
 *   2. Ticket Anchor    — anchor JWT audit ticket hashes onchain for verifiable trust
 *   3. Settlement Escrow — risk-gated escrow for agent-to-agent x402 payments
 */
contract AgntorTrustProtocol {

    // ─────────────────────────────────────────────────────────────────────────
    // ENUMS
    // ─────────────────────────────────────────────────────────────────────────

    enum AuditLevel { Bronze, Silver, Gold, Platinum }

    enum EscrowState { Created, Funded, Released, Disputed, Refunded }

    // ─────────────────────────────────────────────────────────────────────────
    // STRUCTS
    // ─────────────────────────────────────────────────────────────────────────

    struct AgentProfile {
        address owner;              // wallet that controls this agent
        string agentId;             // off-chain agent identifier (e.g., "trading-bot-001")
        AuditLevel auditLevel;      // Bronze / Silver / Gold / Platinum
        uint256 maxOpValue;         // max operation value in wei
        uint256 maxOpsPerHour;      // rate limit
        bool killSwitchActive;      // emergency stop
        bool requiresX402;          // whether agent requires x402 payment verification
        uint256 reputationScore;    // 0-10000 (basis points, so 8500 = 85.00%)
        uint256 registeredAt;       // block.timestamp of registration
        uint256 updatedAt;          // last update timestamp
        bool active;                // is this agent active?
        bytes32 constraintsHash;    // keccak256 of full off-chain constraints JSON
    }

    struct AnchoredTicket {
        bytes32 ticketHash;         // keccak256 of the JWT token string
        address issuer;             // who anchored this ticket
        string agentId;             // which agent this ticket is for
        AuditLevel auditLevel;      // audit level at time of issuance
        uint256 expiresAt;          // ticket expiry (unix timestamp)
        uint256 anchoredAt;         // when it was anchored onchain
        bool revoked;               // has this ticket been revoked?
    }

    struct Escrow {
        uint256 id;
        address payer;              // agent/wallet paying for service
        address payee;              // agent/wallet providing service
        uint256 amount;             // escrowed amount in wei
        string serviceDescription;  // what the payment is for
        uint256 riskScore;          // 0-10000 (basis points) from settlement guard
        EscrowState state;
        uint256 createdAt;
        uint256 releasedAt;
        bytes32 settlementHash;     // hash of off-chain settlement analysis
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────────────────────────────────

    // Protocol admin
    address public admin;

    // Agent Registry
    mapping(string => AgentProfile) public agents;         // agentId => profile
    mapping(address => string[]) public ownerAgents;       // owner => list of agentIds
    string[] public allAgentIds;                           // for enumeration
    uint256 public totalAgents;

    // Ticket Anchoring
    mapping(bytes32 => AnchoredTicket) public tickets;     // ticketHash => ticket
    mapping(string => bytes32[]) public agentTickets;      // agentId => list of ticket hashes
    uint256 public totalTickets;

    // Settlement Escrow
    mapping(uint256 => Escrow) public escrows;             // escrowId => escrow
    uint256 public nextEscrowId;
    uint256 public totalEscrowVolume;                      // total wei ever escrowed

    // Risk thresholds
    uint256 public constant HIGH_RISK_THRESHOLD = 7000;    // 70% risk = auto-hold
    uint256 public constant MAX_RISK_FOR_AUTO_RELEASE = 3000; // 30% risk = can auto-release
    uint256 public constant MIN_REPUTATION_FOR_ESCROW = 2000; // 20% min reputation

    // ─────────────────────────────────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────────────────────────────────

    // Registry events
    event AgentRegistered(
        string indexed agentId,
        address indexed owner,
        AuditLevel auditLevel,
        uint256 reputationScore,
        uint256 timestamp
    );

    event AgentUpdated(
        string indexed agentId,
        AuditLevel auditLevel,
        uint256 reputationScore,
        bool killSwitchActive,
        uint256 timestamp
    );

    event AgentDeactivated(string indexed agentId, uint256 timestamp);

    event KillSwitchToggled(string indexed agentId, bool active, uint256 timestamp);

    // Ticket events
    event TicketAnchored(
        bytes32 indexed ticketHash,
        string indexed agentId,
        address issuer,
        AuditLevel auditLevel,
        uint256 expiresAt,
        uint256 timestamp
    );

    event TicketRevoked(bytes32 indexed ticketHash, uint256 timestamp);

    // Escrow events
    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed payer,
        address indexed payee,
        uint256 amount,
        uint256 riskScore,
        string serviceDescription
    );

    event EscrowFunded(uint256 indexed escrowId, uint256 amount, uint256 timestamp);

    event EscrowReleased(uint256 indexed escrowId, uint256 amount, uint256 timestamp);

    event EscrowDisputed(uint256 indexed escrowId, uint256 timestamp);

    event EscrowRefunded(uint256 indexed escrowId, uint256 amount, uint256 timestamp);

    // ─────────────────────────────────────────────────────────────────────────
    // MODIFIERS
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        require(msg.sender == admin, "AgntorTrust: caller is not admin");
        _;
    }

    modifier onlyAgentOwner(string memory agentId) {
        require(agents[agentId].owner == msg.sender, "AgntorTrust: not agent owner");
        _;
    }

    modifier agentExists(string memory agentId) {
        require(agents[agentId].registeredAt != 0, "AgntorTrust: agent not found");
        _;
    }

    modifier agentActive(string memory agentId) {
        require(agents[agentId].active, "AgntorTrust: agent not active");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────────────────

    constructor() {
        admin = msg.sender;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MODULE 1: AGENT REGISTRY
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @notice Register a new AI agent with its trust parameters
     * @param agentId Unique identifier for the agent
     * @param auditLevel Bronze(0), Silver(1), Gold(2), Platinum(3)
     * @param maxOpValue Maximum operation value in wei
     * @param maxOpsPerHour Rate limit for operations
     * @param requiresX402 Whether this agent uses x402 payment protocol
     * @param reputationScore Initial reputation (0-10000 basis points)
     * @param constraintsHash keccak256 of the full off-chain constraints JSON
     */
    function registerAgent(
        string memory agentId,
        AuditLevel auditLevel,
        uint256 maxOpValue,
        uint256 maxOpsPerHour,
        bool requiresX402,
        uint256 reputationScore,
        bytes32 constraintsHash
    ) external {
        require(agents[agentId].registeredAt == 0, "AgntorTrust: agent already registered");
        require(bytes(agentId).length > 0, "AgntorTrust: empty agent ID");
        require(reputationScore <= 10000, "AgntorTrust: reputation must be <= 10000");

        agents[agentId] = AgentProfile({
            owner: msg.sender,
            agentId: agentId,
            auditLevel: auditLevel,
            maxOpValue: maxOpValue,
            maxOpsPerHour: maxOpsPerHour,
            killSwitchActive: false,
            requiresX402: requiresX402,
            reputationScore: reputationScore,
            registeredAt: block.timestamp,
            updatedAt: block.timestamp,
            active: true,
            constraintsHash: constraintsHash
        });

        ownerAgents[msg.sender].push(agentId);
        allAgentIds.push(agentId);
        totalAgents++;

        emit AgentRegistered(agentId, msg.sender, auditLevel, reputationScore, block.timestamp);
    }

    /**
     * @notice Update agent trust parameters
     */
    function updateAgent(
        string memory agentId,
        AuditLevel auditLevel,
        uint256 maxOpValue,
        uint256 maxOpsPerHour,
        uint256 reputationScore,
        bytes32 constraintsHash
    ) external onlyAgentOwner(agentId) agentExists(agentId) {
        require(reputationScore <= 10000, "AgntorTrust: reputation must be <= 10000");

        AgentProfile storage agent = agents[agentId];
        agent.auditLevel = auditLevel;
        agent.maxOpValue = maxOpValue;
        agent.maxOpsPerHour = maxOpsPerHour;
        agent.reputationScore = reputationScore;
        agent.constraintsHash = constraintsHash;
        agent.updatedAt = block.timestamp;

        emit AgentUpdated(agentId, auditLevel, reputationScore, agent.killSwitchActive, block.timestamp);
    }

    /**
     * @notice Toggle kill switch for an agent (emergency stop)
     */
    function toggleKillSwitch(string memory agentId, bool active)
        external
        onlyAgentOwner(agentId)
        agentExists(agentId)
    {
        agents[agentId].killSwitchActive = active;
        agents[agentId].updatedAt = block.timestamp;
        emit KillSwitchToggled(agentId, active, block.timestamp);
    }

    /**
     * @notice Deactivate an agent permanently
     */
    function deactivateAgent(string memory agentId)
        external
        onlyAgentOwner(agentId)
        agentExists(agentId)
    {
        agents[agentId].active = false;
        agents[agentId].updatedAt = block.timestamp;
        emit AgentDeactivated(agentId, block.timestamp);
    }

    /**
     * @notice Get agent profile (view)
     */
    function getAgent(string memory agentId) external view returns (AgentProfile memory) {
        require(agents[agentId].registeredAt != 0, "AgntorTrust: agent not found");
        return agents[agentId];
    }

    /**
     * @notice Verify agent meets minimum trust requirements for an operation
     * @param agentId The agent to verify
     * @param operationValue The value of the operation in wei
     * @return trusted Whether the agent meets the requirements
     * @return reason Human-readable reason if not trusted
     */
    function verifyAgentTrust(string memory agentId, uint256 operationValue)
        external
        view
        returns (bool trusted, string memory reason)
    {
        AgentProfile memory agent = agents[agentId];

        if (agent.registeredAt == 0) return (false, "Agent not registered");
        if (!agent.active) return (false, "Agent deactivated");
        if (agent.killSwitchActive) return (false, "Kill switch active");
        if (operationValue > agent.maxOpValue) return (false, "Operation exceeds max value");
        if (agent.reputationScore < MIN_REPUTATION_FOR_ESCROW) return (false, "Reputation too low");

        return (true, "Agent trusted");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MODULE 2: TICKET ANCHORING
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @notice Anchor a JWT audit ticket hash onchain
     * @param ticketHash keccak256 of the JWT token string
     * @param agentId Which agent this ticket was issued for
     * @param auditLevel Audit level encoded in the ticket
     * @param expiresAt Unix timestamp when the ticket expires
     */
    function anchorTicket(
        bytes32 ticketHash,
        string memory agentId,
        AuditLevel auditLevel,
        uint256 expiresAt
    ) external {
        require(tickets[ticketHash].anchoredAt == 0, "AgntorTrust: ticket already anchored");
        require(expiresAt > block.timestamp, "AgntorTrust: ticket already expired");

        tickets[ticketHash] = AnchoredTicket({
            ticketHash: ticketHash,
            issuer: msg.sender,
            agentId: agentId,
            auditLevel: auditLevel,
            expiresAt: expiresAt,
            anchoredAt: block.timestamp,
            revoked: false
        });

        agentTickets[agentId].push(ticketHash);
        totalTickets++;

        emit TicketAnchored(ticketHash, agentId, msg.sender, auditLevel, expiresAt, block.timestamp);
    }

    /**
     * @notice Verify a ticket hash is valid onchain
     * @param ticketHash The ticket hash to verify
     * @return valid Whether the ticket is anchored, not expired, and not revoked
     * @return ticket The full ticket data
     */
    function verifyTicket(bytes32 ticketHash)
        external
        view
        returns (bool valid, AnchoredTicket memory ticket)
    {
        ticket = tickets[ticketHash];
        if (ticket.anchoredAt == 0) return (false, ticket);
        if (ticket.revoked) return (false, ticket);
        if (block.timestamp > ticket.expiresAt) return (false, ticket);
        return (true, ticket);
    }

    /**
     * @notice Revoke a previously anchored ticket
     */
    function revokeTicket(bytes32 ticketHash) external {
        AnchoredTicket storage ticket = tickets[ticketHash];
        require(ticket.anchoredAt != 0, "AgntorTrust: ticket not found");
        require(ticket.issuer == msg.sender || msg.sender == admin, "AgntorTrust: not authorized");
        require(!ticket.revoked, "AgntorTrust: already revoked");

        ticket.revoked = true;
        emit TicketRevoked(ticketHash, block.timestamp);
    }

    /**
     * @notice Get all ticket hashes for an agent
     */
    function getAgentTickets(string memory agentId) external view returns (bytes32[] memory) {
        return agentTickets[agentId];
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MODULE 3: SETTLEMENT ESCROW
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @notice Create and fund an escrow for agent-to-agent payment
     * @param payee The recipient agent/wallet
     * @param serviceDescription What the payment is for
     * @param riskScore Risk score from settlement guard (0-10000 basis points)
     * @param settlementHash Hash of the off-chain settlement analysis
     */
    function createEscrow(
        address payee,
        string memory serviceDescription,
        uint256 riskScore,
        bytes32 settlementHash
    ) external payable returns (uint256 escrowId) {
        require(msg.value > 0, "AgntorTrust: escrow amount must be > 0");
        require(payee != address(0), "AgntorTrust: payee cannot be zero address");
        require(payee != msg.sender, "AgntorTrust: cannot escrow to self");
        require(riskScore <= 10000, "AgntorTrust: invalid risk score");

        escrowId = nextEscrowId++;

        escrows[escrowId] = Escrow({
            id: escrowId,
            payer: msg.sender,
            payee: payee,
            amount: msg.value,
            serviceDescription: serviceDescription,
            riskScore: riskScore,
            state: EscrowState.Funded,
            createdAt: block.timestamp,
            releasedAt: 0,
            settlementHash: settlementHash
        });

        totalEscrowVolume += msg.value;

        emit EscrowCreated(escrowId, msg.sender, payee, msg.value, riskScore, serviceDescription);
        emit EscrowFunded(escrowId, msg.value, block.timestamp);

        return escrowId;
    }

    /**
     * @notice Release escrowed funds to the payee
     *         - Low risk (< 30%): payer or admin can release
     *         - Medium risk (30-70%): only admin can release
     *         - High risk (> 70%): only admin can release after dispute resolution
     */
    function releaseEscrow(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.state == EscrowState.Funded, "AgntorTrust: escrow not in funded state");

        if (escrow.riskScore <= MAX_RISK_FOR_AUTO_RELEASE) {
            // Low risk: payer can release
            require(
                msg.sender == escrow.payer || msg.sender == admin,
                "AgntorTrust: not authorized to release"
            );
        } else {
            // Medium/High risk: only admin
            require(msg.sender == admin, "AgntorTrust: high-risk escrow requires admin release");
        }

        escrow.state = EscrowState.Released;
        escrow.releasedAt = block.timestamp;

        (bool sent, ) = escrow.payee.call{value: escrow.amount}("");
        require(sent, "AgntorTrust: transfer failed");

        emit EscrowReleased(escrowId, escrow.amount, block.timestamp);
    }

    /**
     * @notice Dispute an escrow (freezes funds, requires admin resolution)
     */
    function disputeEscrow(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.state == EscrowState.Funded, "AgntorTrust: escrow not in funded state");
        require(
            msg.sender == escrow.payer || msg.sender == admin,
            "AgntorTrust: not authorized to dispute"
        );

        escrow.state = EscrowState.Disputed;
        emit EscrowDisputed(escrowId, block.timestamp);
    }

    /**
     * @notice Refund escrowed funds to the payer (admin only for disputed, payer for high-risk auto-hold)
     */
    function refundEscrow(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(
            escrow.state == EscrowState.Funded || escrow.state == EscrowState.Disputed,
            "AgntorTrust: escrow not refundable"
        );

        if (escrow.state == EscrowState.Disputed) {
            require(msg.sender == admin, "AgntorTrust: disputed escrow requires admin refund");
        } else {
            // Funded state: payer can refund if high risk, otherwise admin
            if (escrow.riskScore >= HIGH_RISK_THRESHOLD) {
                require(
                    msg.sender == escrow.payer || msg.sender == admin,
                    "AgntorTrust: not authorized"
                );
            } else {
                require(msg.sender == admin, "AgntorTrust: only admin can refund low-risk escrow");
            }
        }

        escrow.state = EscrowState.Refunded;

        (bool sent, ) = escrow.payer.call{value: escrow.amount}("");
        require(sent, "AgntorTrust: refund transfer failed");

        emit EscrowRefunded(escrowId, escrow.amount, block.timestamp);
    }

    /**
     * @notice Get escrow details
     */
    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        require(escrows[escrowId].createdAt != 0, "AgntorTrust: escrow not found");
        return escrows[escrowId];
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @notice Transfer admin role
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "AgntorTrust: zero address");
        admin = newAdmin;
    }

    /**
     * @notice Admin can update agent reputation (e.g., based on dispute outcomes)
     */
    function adminUpdateReputation(string memory agentId, uint256 newScore)
        external
        onlyAdmin
        agentExists(agentId)
    {
        require(newScore <= 10000, "AgntorTrust: reputation must be <= 10000");
        agents[agentId].reputationScore = newScore;
        agents[agentId].updatedAt = block.timestamp;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // VIEW HELPERS
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get protocol stats
     */
    function getProtocolStats()
        external
        view
        returns (
            uint256 _totalAgents,
            uint256 _totalTickets,
            uint256 _totalEscrows,
            uint256 _totalEscrowVolume
        )
    {
        return (totalAgents, totalTickets, nextEscrowId, totalEscrowVolume);
    }

    /**
     * @notice Get all agent IDs owned by an address
     */
    function getOwnerAgents(address owner) external view returns (string[] memory) {
        return ownerAgents[owner];
    }

    /**
     * @notice Check if an agent is registered and active
     */
    function isAgentActive(string memory agentId) external view returns (bool) {
        return agents[agentId].active && agents[agentId].registeredAt != 0;
    }
}

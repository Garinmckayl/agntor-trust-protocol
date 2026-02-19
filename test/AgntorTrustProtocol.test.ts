import { expect } from "chai";
import { ethers } from "hardhat";
import { AgntorTrustProtocol } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AgntorTrustProtocol", function () {
  let protocol: AgntorTrustProtocol;
  let admin: SignerWithAddress;
  let agent1Owner: SignerWithAddress;
  let agent2Owner: SignerWithAddress;
  let payee: SignerWithAddress;

  beforeEach(async function () {
    [admin, agent1Owner, agent2Owner, payee] = await ethers.getSigners();
    const AgntorTrustProtocol = await ethers.getContractFactory("AgntorTrustProtocol");
    protocol = await AgntorTrustProtocol.deploy();
    await protocol.waitForDeployment();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 1: AGENT REGISTRY
  // ═══════════════════════════════════════════════════════════════════════

  describe("Agent Registry", function () {
    const agentId = "trading-bot-001";
    const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes('{"max_op_value": 1000}'));

    it("should register a new agent", async function () {
      await expect(
        protocol.connect(agent1Owner).registerAgent(
          agentId,
          2, // Gold
          ethers.parseEther("10"),
          100,
          true,
          8500,
          constraintsHash
        )
      ).to.emit(protocol, "AgentRegistered");

      const agent = await protocol.getAgent(agentId);
      expect(agent.owner).to.equal(agent1Owner.address);
      expect(agent.agentId).to.equal(agentId);
      expect(agent.auditLevel).to.equal(2); // Gold
      expect(agent.reputationScore).to.equal(8500);
      expect(agent.active).to.be.true;
      expect(agent.killSwitchActive).to.be.false;
    });

    it("should reject duplicate agent registration", async function () {
      await protocol.connect(agent1Owner).registerAgent(
        agentId, 1, ethers.parseEther("1"), 50, false, 5000, constraintsHash
      );

      await expect(
        protocol.connect(agent2Owner).registerAgent(
          agentId, 1, ethers.parseEther("1"), 50, false, 5000, constraintsHash
        )
      ).to.be.revertedWith("AgntorTrust: agent already registered");
    });

    it("should reject empty agent ID", async function () {
      await expect(
        protocol.connect(agent1Owner).registerAgent(
          "", 1, ethers.parseEther("1"), 50, false, 5000, constraintsHash
        )
      ).to.be.revertedWith("AgntorTrust: empty agent ID");
    });

    it("should reject reputation > 10000", async function () {
      await expect(
        protocol.connect(agent1Owner).registerAgent(
          agentId, 1, ethers.parseEther("1"), 50, false, 10001, constraintsHash
        )
      ).to.be.revertedWith("AgntorTrust: reputation must be <= 10000");
    });

    it("should update agent parameters", async function () {
      await protocol.connect(agent1Owner).registerAgent(
        agentId, 1, ethers.parseEther("1"), 50, false, 5000, constraintsHash
      );

      const newHash = ethers.keccak256(ethers.toUtf8Bytes('{"max_op_value": 5000}'));
      await protocol.connect(agent1Owner).updateAgent(
        agentId, 2, ethers.parseEther("5"), 200, 9000, newHash
      );

      const agent = await protocol.getAgent(agentId);
      expect(agent.auditLevel).to.equal(2); // Gold
      expect(agent.maxOpValue).to.equal(ethers.parseEther("5"));
      expect(agent.reputationScore).to.equal(9000);
    });

    it("should toggle kill switch", async function () {
      await protocol.connect(agent1Owner).registerAgent(
        agentId, 2, ethers.parseEther("10"), 100, true, 8500, constraintsHash
      );

      await protocol.connect(agent1Owner).toggleKillSwitch(agentId, true);
      let agent = await protocol.getAgent(agentId);
      expect(agent.killSwitchActive).to.be.true;

      await protocol.connect(agent1Owner).toggleKillSwitch(agentId, false);
      agent = await protocol.getAgent(agentId);
      expect(agent.killSwitchActive).to.be.false;
    });

    it("should verify agent trust", async function () {
      await protocol.connect(agent1Owner).registerAgent(
        agentId, 2, ethers.parseEther("10"), 100, true, 8500, constraintsHash
      );

      // Should be trusted
      let [trusted, reason] = await protocol.verifyAgentTrust(agentId, ethers.parseEther("5"));
      expect(trusted).to.be.true;
      expect(reason).to.equal("Agent trusted");

      // Should fail: operation too large
      [trusted, reason] = await protocol.verifyAgentTrust(agentId, ethers.parseEther("100"));
      expect(trusted).to.be.false;
      expect(reason).to.equal("Operation exceeds max value");

      // Should fail: kill switch
      await protocol.connect(agent1Owner).toggleKillSwitch(agentId, true);
      [trusted, reason] = await protocol.verifyAgentTrust(agentId, ethers.parseEther("1"));
      expect(trusted).to.be.false;
      expect(reason).to.equal("Kill switch active");
    });

    it("should deactivate agent", async function () {
      await protocol.connect(agent1Owner).registerAgent(
        agentId, 1, ethers.parseEther("1"), 50, false, 5000, constraintsHash
      );

      await protocol.connect(agent1Owner).deactivateAgent(agentId);
      const [trusted, reason] = await protocol.verifyAgentTrust(agentId, ethers.parseEther("0.1"));
      expect(trusted).to.be.false;
      expect(reason).to.equal("Agent deactivated");
    });

    it("should reject non-owner updates", async function () {
      await protocol.connect(agent1Owner).registerAgent(
        agentId, 1, ethers.parseEther("1"), 50, false, 5000, constraintsHash
      );

      await expect(
        protocol.connect(agent2Owner).updateAgent(
          agentId, 2, ethers.parseEther("5"), 200, 9000, constraintsHash
        )
      ).to.be.revertedWith("AgntorTrust: not agent owner");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 2: TICKET ANCHORING
  // ═══════════════════════════════════════════════════════════════════════

  describe("Ticket Anchoring", function () {
    const agentId = "agent-007";
    const ticketHash = ethers.keccak256(ethers.toUtf8Bytes("eyJhbGciOiJIUzI1NiIs..."));

    it("should anchor a ticket", async function () {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        protocol.connect(agent1Owner).anchorTicket(
          ticketHash, agentId, 2, expiresAt
        )
      ).to.emit(protocol, "TicketAnchored");

      const [valid, ticket] = await protocol.verifyTicket(ticketHash);
      expect(valid).to.be.true;
      expect(ticket.agentId).to.equal(agentId);
      expect(ticket.auditLevel).to.equal(2);
      expect(ticket.issuer).to.equal(agent1Owner.address);
    });

    it("should reject duplicate ticket anchoring", async function () {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      await protocol.connect(agent1Owner).anchorTicket(ticketHash, agentId, 2, expiresAt);

      await expect(
        protocol.connect(agent1Owner).anchorTicket(ticketHash, agentId, 2, expiresAt)
      ).to.be.revertedWith("AgntorTrust: ticket already anchored");
    });

    it("should reject expired ticket", async function () {
      const expiresAt = Math.floor(Date.now() / 1000) - 100; // already expired

      await expect(
        protocol.connect(agent1Owner).anchorTicket(ticketHash, agentId, 2, expiresAt)
      ).to.be.revertedWith("AgntorTrust: ticket already expired");
    });

    it("should revoke a ticket", async function () {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      await protocol.connect(agent1Owner).anchorTicket(ticketHash, agentId, 2, expiresAt);

      await protocol.connect(agent1Owner).revokeTicket(ticketHash);
      const [valid] = await protocol.verifyTicket(ticketHash);
      expect(valid).to.be.false;
    });

    it("should track agent tickets", async function () {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const ticketHash2 = ethers.keccak256(ethers.toUtf8Bytes("second-ticket"));

      await protocol.connect(agent1Owner).anchorTicket(ticketHash, agentId, 2, expiresAt);
      await protocol.connect(agent1Owner).anchorTicket(ticketHash2, agentId, 3, expiresAt);

      const tickets = await protocol.getAgentTickets(agentId);
      expect(tickets.length).to.equal(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE 3: SETTLEMENT ESCROW
  // ═══════════════════════════════════════════════════════════════════════

  describe("Settlement Escrow", function () {
    const settlementHash = ethers.keccak256(ethers.toUtf8Bytes('{"riskScore": 0.15}'));

    it("should create and fund an escrow", async function () {
      const amount = ethers.parseEther("1.0");

      await expect(
        protocol.connect(agent1Owner).createEscrow(
          payee.address,
          "Code review service",
          1500, // 15% risk
          settlementHash,
          { value: amount }
        )
      ).to.emit(protocol, "EscrowCreated");

      const escrow = await protocol.getEscrow(0);
      expect(escrow.payer).to.equal(agent1Owner.address);
      expect(escrow.payee).to.equal(payee.address);
      expect(escrow.amount).to.equal(amount);
      expect(escrow.riskScore).to.equal(1500);
      expect(escrow.state).to.equal(1); // Funded
    });

    it("should reject zero-address payee", async function () {
      await expect(
        protocol.connect(agent1Owner).createEscrow(
          ethers.ZeroAddress,
          "Service",
          1500,
          settlementHash,
          { value: ethers.parseEther("1") }
        )
      ).to.be.revertedWith("AgntorTrust: payee cannot be zero address");
    });

    it("should reject self-escrow", async function () {
      await expect(
        protocol.connect(agent1Owner).createEscrow(
          agent1Owner.address,
          "Service",
          1500,
          settlementHash,
          { value: ethers.parseEther("1") }
        )
      ).to.be.revertedWith("AgntorTrust: cannot escrow to self");
    });

    it("should release low-risk escrow (payer)", async function () {
      const amount = ethers.parseEther("1.0");
      await protocol.connect(agent1Owner).createEscrow(
        payee.address, "Service", 2000, settlementHash, { value: amount }
      );

      const balanceBefore = await ethers.provider.getBalance(payee.address);
      await protocol.connect(agent1Owner).releaseEscrow(0);
      const balanceAfter = await ethers.provider.getBalance(payee.address);

      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("should block payer from releasing high-risk escrow", async function () {
      await protocol.connect(agent1Owner).createEscrow(
        payee.address, "Suspicious service", 8000, settlementHash, { value: ethers.parseEther("1") }
      );

      await expect(
        protocol.connect(agent1Owner).releaseEscrow(0)
      ).to.be.revertedWith("AgntorTrust: high-risk escrow requires admin release");
    });

    it("should allow admin to release high-risk escrow", async function () {
      const amount = ethers.parseEther("1.0");
      await protocol.connect(agent1Owner).createEscrow(
        payee.address, "Suspicious service", 8000, settlementHash, { value: amount }
      );

      const balanceBefore = await ethers.provider.getBalance(payee.address);
      await protocol.connect(admin).releaseEscrow(0);
      const balanceAfter = await ethers.provider.getBalance(payee.address);

      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("should dispute and refund escrow", async function () {
      const amount = ethers.parseEther("1.0");
      await protocol.connect(agent1Owner).createEscrow(
        payee.address, "Service", 5000, settlementHash, { value: amount }
      );

      await protocol.connect(agent1Owner).disputeEscrow(0);
      const escrow = await protocol.getEscrow(0);
      expect(escrow.state).to.equal(3); // Disputed

      const balanceBefore = await ethers.provider.getBalance(agent1Owner.address);
      await protocol.connect(admin).refundEscrow(0);
      const balanceAfter = await ethers.provider.getBalance(agent1Owner.address);

      // Balance should increase (minus gas for admin, but refund goes to agent1Owner)
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("should track protocol stats", async function () {
      await protocol.connect(agent1Owner).createEscrow(
        payee.address, "Service 1", 1000, settlementHash, { value: ethers.parseEther("1") }
      );
      await protocol.connect(agent1Owner).createEscrow(
        payee.address, "Service 2", 2000, settlementHash, { value: ethers.parseEther("2") }
      );

      const stats = await protocol.getProtocolStats();
      expect(stats[2]).to.equal(2); // totalEscrows
      expect(stats[3]).to.equal(ethers.parseEther("3")); // totalVolume
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ADMIN
  // ═══════════════════════════════════════════════════════════════════════

  describe("Admin Functions", function () {
    it("should transfer admin", async function () {
      await protocol.connect(admin).transferAdmin(agent1Owner.address);
      expect(await protocol.admin()).to.equal(agent1Owner.address);
    });

    it("should reject non-admin transfer", async function () {
      await expect(
        protocol.connect(agent1Owner).transferAdmin(agent2Owner.address)
      ).to.be.revertedWith("AgntorTrust: caller is not admin");
    });

    it("should allow admin to update reputation", async function () {
      const agentId = "test-agent";
      const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("{}"));
      await protocol.connect(agent1Owner).registerAgent(
        agentId, 1, ethers.parseEther("1"), 50, false, 5000, constraintsHash
      );

      await protocol.connect(admin).adminUpdateReputation(agentId, 9500);
      const agent = await protocol.getAgent(agentId);
      expect(agent.reputationScore).to.equal(9500);
    });
  });

  // Helper
  async function getBlockTimestamp(): Promise<number> {
    const block = await ethers.provider.getBlock("latest");
    return block!.timestamp;
  }
});

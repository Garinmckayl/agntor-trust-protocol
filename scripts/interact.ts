import { ethers } from "hardhat";

const CONTRACT_ADDRESS = "0xab7AcBDA37EDff3D3B7F5b8725D55323104c6331";

async function main() {
  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  AGNTORSHIELD — ONCHAIN INTERACTION");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Wallet:    ${signer.address}`);
  console.log(`  Balance:   ${ethers.formatEther(balance)} BNB`);
  console.log(`  Contract:  ${CONTRACT_ADDRESS}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const protocol = await ethers.getContractAt("AgntorTrustProtocol", CONTRACT_ADDRESS);

  // ── Step 1: Register an AI Agent ──────────────────────────────────────
  console.log("  [1/4] Registering AI agent 'openclaw-agent-001'...");
  const constraintsJson = JSON.stringify({
    maxTokensPerRequest: 4096,
    allowedDomains: ["api.binance.com", "bsc-dataseed1.bnbchain.org"],
    blockedActions: ["fund_transfer_external", "key_export"],
    requireHumanApproval: true,
  });
  const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes(constraintsJson));

  const tx1 = await protocol.registerAgent(
    "openclaw-agent-001",       // agentId
    2,                           // AuditLevel.Gold
    ethers.parseEther("1.0"),    // maxOpValue: 1 BNB
    100,                         // maxOpsPerHour
    true,                        // requiresX402
    8500,                        // reputationScore: 85%
    constraintsHash
  );
  const receipt1 = await tx1.wait();
  console.log(`  ✓ Agent registered! Tx: ${receipt1?.hash}`);

  // ── Step 2: Verify the agent ──────────────────────────────────────────
  console.log("\n  [2/4] Verifying agent trust...");
  const [trusted, reason] = await protocol.verifyAgentTrust(
    "openclaw-agent-001",
    ethers.parseEther("0.5")   // checking for 0.5 BNB operation
  );
  console.log(`  ✓ Trusted: ${trusted} — "${reason}"`);

  // ── Step 3: Anchor an audit ticket ────────────────────────────────────
  console.log("\n  [3/4] Anchoring audit ticket onchain...");
  const ticketPayload = {
    agentId: "openclaw-agent-001",
    auditLevel: "Gold",
    issuedAt: Math.floor(Date.now() / 1000),
    nonce: ethers.hexlify(ethers.randomBytes(16)),
  };
  const ticketHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(ticketPayload))
  );
  const expiresAt = Math.floor(Date.now() / 1000) + 86400; // 24 hours

  const tx2 = await protocol.anchorTicket(
    ticketHash,
    "openclaw-agent-001",
    2,                 // AuditLevel.Gold
    expiresAt
  );
  const receipt2 = await tx2.wait();
  console.log(`  ✓ Ticket anchored! Tx: ${receipt2?.hash}`);
  console.log(`    Hash: ${ticketHash}`);

  // ── Step 4: Verify the ticket ─────────────────────────────────────────
  console.log("\n  [4/4] Verifying ticket onchain...");
  const [isValid, ticketReason] = await protocol.verifyTicket(ticketHash);
  console.log(`  ✓ Valid: ${isValid} — "${ticketReason}"`);

  // ── Protocol Stats ────────────────────────────────────────────────────
  console.log("\n  ─── PROTOCOL STATS ───");
  const stats = await protocol.getProtocolStats();
  console.log(`    Total Agents:  ${stats[0]}`);
  console.log(`    Total Tickets: ${stats[1]}`);
  console.log(`    Total Escrows: ${stats[2]}`);
  console.log(`    Total Volume:  ${ethers.formatEther(stats[3])} BNB`);

  const finalBalance = await ethers.provider.getBalance(signer.address);
  console.log(`\n  Gas spent: ${ethers.formatEther(balance - finalBalance)} BNB`);
  console.log(`  Remaining: ${ethers.formatEther(finalBalance)} BNB`);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  INTERACTION COMPLETE — All transactions onchain!");
  console.log("═══════════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Interaction failed:", error);
    process.exit(1);
  });

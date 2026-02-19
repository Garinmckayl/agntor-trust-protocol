import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  AGNTORSHIELD — DEPLOYMENT");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Balance:   ${ethers.formatEther(balance)} BNB`);
  console.log(`  Network:   ${(await ethers.provider.getNetwork()).name} (chainId: ${(await ethers.provider.getNetwork()).chainId})`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // Deploy AgntorTrustProtocol
  console.log("  Deploying AgntorTrustProtocol...");
  const AgntorTrustProtocol = await ethers.getContractFactory("AgntorTrustProtocol");
  const protocol = await AgntorTrustProtocol.deploy();
  await protocol.waitForDeployment();
  const protocolAddress = await protocol.getAddress();

  console.log(`  ✓ AgntorTrustProtocol deployed to: ${protocolAddress}`);
  console.log(`  ✓ Admin set to: ${deployer.address}`);

  // Verify deployment
  const admin = await protocol.admin();
  const stats = await protocol.getProtocolStats();
  console.log(`\n  Protocol Stats:`);
  console.log(`    Total Agents:  ${stats[0]}`);
  console.log(`    Total Tickets: ${stats[1]}`);
  console.log(`    Total Escrows: ${stats[2]}`);
  console.log(`    Total Volume:  ${ethers.formatEther(stats[3])} BNB`);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log(`  Contract: ${protocolAddress}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // Write deployment info to file
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    contract: protocolAddress,
    deployer: deployer.address,
    admin: admin,
    deployedAt: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };

  const fs = await import("fs");
  const path = await import("path");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const filename = `deployment-${deploymentInfo.chainId}-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`  Deployment info saved to: deployments/${filename}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });

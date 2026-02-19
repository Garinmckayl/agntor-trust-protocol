import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    // BSC Testnet
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      accounts: [PRIVATE_KEY],
      gasPrice: 3000000000, // 3 gwei
    },
    // BSC Mainnet
    bsc: {
      url: "https://bsc-dataseed1.bnbchain.org",
      chainId: 56,
      accounts: [PRIVATE_KEY],
      gasPrice: 3000000000, // 3 gwei
    },
    // opBNB Testnet
    opbnbTestnet: {
      url: "https://opbnb-testnet-rpc.bnbchain.org",
      chainId: 5611,
      accounts: [PRIVATE_KEY],
      gasPrice: 1000000000, // 1 gwei
    },
    // opBNB Mainnet
    opbnb: {
      url: "https://opbnb-mainnet-rpc.bnbchain.org",
      chainId: 204,
      accounts: [PRIVATE_KEY],
      gasPrice: 1000000000,
    },
  },
  etherscan: {
    apiKey: {
      bscTestnet: process.env.BSCSCAN_API_KEY || "",
      bsc: process.env.BSCSCAN_API_KEY || "",
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};

export default config;

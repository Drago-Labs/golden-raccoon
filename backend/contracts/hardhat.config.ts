import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
      metadata: {
        bytecodeHash: "ipfs",
        useLiteralContent: true,
      },
    },
  },
  networks: {
    hardhat: {},
    goat: {
      url: process.env.GOAT_RPC_URL ?? "https://rpc.goat.network",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};

export default config;

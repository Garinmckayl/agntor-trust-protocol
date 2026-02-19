#!/bin/bash
# AgntorShield — Full Demo Recording Script
# This script demonstrates the project end-to-end

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
WHITE='\033[1;37m'
DIM='\033[2m'
NC='\033[0m'
BOLD='\033[1m'

slowtype() {
  local text="$1"
  local delay="${2:-0.03}"
  for ((i=0; i<${#text}; i++)); do
    printf '%s' "${text:$i:1}"
    sleep "$delay"
  done
  echo
}

pause() { sleep "${1:-1.5}"; }

clear
echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}  AgntorShield — Onchain Trust Layer for AI Agents${NC}"
echo -e "${CYAN}${BOLD}  Good Vibes Only: OpenClaw Edition | BNB Chain${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo ""
pause 2

echo -e "${WHITE}${BOLD}  [STEP 1/5] Smart Contract Compilation${NC}"
echo -e "${DIM}  ─────────────────────────────────────${NC}"
pause 0.5
slowtype "  \$ npx hardhat compile"
pause 0.5
npx hardhat compile 2>&1
echo ""
pause 1.5

echo -e "${WHITE}${BOLD}  [STEP 2/5] Test Suite — 25 Tests${NC}"
echo -e "${DIM}  ─────────────────────────────────────${NC}"
pause 0.5
slowtype "  \$ npx hardhat test"
pause 0.5
npx hardhat test 2>&1
echo ""
pause 2

echo -e "${WHITE}${BOLD}  [STEP 3/5] CLI Interface${NC}"
echo -e "${DIM}  ─────────────────────────────────────${NC}"
pause 0.5
slowtype "  \$ npx ts-node src/cli.ts --help"
pause 0.5
npx ts-node src/cli.ts --help 2>&1
echo ""
pause 2

echo -e "${WHITE}${BOLD}  [STEP 4/5] Live Contract Read — BSC Testnet${NC}"
echo -e "${DIM}  ─────────────────────────────────────${NC}"
pause 0.5
slowtype "  \$ npx ts-node src/cli.ts stats --network bsc-testnet"
pause 0.5
npx ts-node src/cli.ts stats --network bsc-testnet 2>&1
echo ""
pause 2

echo -e "${WHITE}${BOLD}  [STEP 5/5] Verify Registered Agent — BSC Testnet${NC}"
echo -e "${DIM}  ─────────────────────────────────────${NC}"
pause 0.5
slowtype "  \$ npx ts-node src/cli.ts verify-agent --agent-id openclaw-agent-001 --network bsc-testnet"
pause 0.5
npx ts-node src/cli.ts verify-agent --agent-id openclaw-agent-001 --network bsc-testnet 2>&1
echo ""
pause 2

echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  DEMO COMPLETE${NC}"
echo -e "${DIM}  Contract: 0xab7AcBDA37EDff3D3B7F5b8725D55323104c6331${NC}"
echo -e "${DIM}  Network:  BSC Testnet (chainId 97)${NC}"
echo -e "${DIM}  Dashboard: garinmckayl.github.io/agntorshield${NC}"
echo -e "${DIM}  GitHub:   github.com/Garinmckayl/agntorshield${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo ""
pause 3

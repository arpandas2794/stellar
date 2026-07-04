export const config = {
  network: process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'TESTNET',
  horizonUrl: process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  notesContractId: process.env.NEXT_PUBLIC_NOTES_CONTRACT_ID || process.env.NEXT_PUBLIC_CONTRACT_ID || 'CBIS5O7OC2Y5ZVEB6VPTCZTOM2LR6C7BC4FIJ2E56VNVE7PZPA3N3HDA',
  reputationContractId: process.env.NEXT_PUBLIC_REPUTATION_CONTRACT_ID || '',
};

export default config;

export type StellarErrorType =
  | 'WALLET_NOT_FOUND'
  | 'USER_REJECTED'
  | 'INSUFFICIENT_BALANCE'
  | 'NETWORK_ERROR'
  | 'UNAUTHORIZED'
  | 'ALREADY_LIKED'
  | 'UNKNOWN_ERROR';

export interface ClassifiedError {
  type: StellarErrorType;
  message: string;
}

export function classifyStellarError(error: any): ClassifiedError {
  const errMsg = error?.message || error?.toString() || '';
  const errStr = errMsg.toLowerCase();

  // 1. Wallet not found / not installed
  if (
    errStr.includes('not installed') ||
    errStr.includes('not detected') ||
    errStr.includes('missing') ||
    errStr.includes('is not available') ||
    errStr.includes('albedo not found') ||
    errStr.includes('freighter not found') ||
    errStr.includes('xbull not found') ||
    errStr.includes('kit is not initialized')
  ) {
    let walletName = 'Wallet';
    if (errStr.includes('freighter')) walletName = 'Freighter';
    else if (errStr.includes('xbull')) walletName = 'xBull';
    else if (errStr.includes('albedo')) walletName = 'Albedo';

    return {
      type: 'WALLET_NOT_FOUND',
      message: `${walletName} extension/wallet not detected. Please install it to proceed.`,
    };
  }

  // 2. User rejected the request
  if (
    errStr.includes('rejected') ||
    errStr.includes('cancel') ||
    errStr.includes('user decline') ||
    errStr.includes('declined') ||
    errStr.includes('user abort') ||
    errStr.includes('denied')
  ) {
    return {
      type: 'USER_REJECTED',
      message: 'Transaction or connection was rejected in your wallet.',
    };
  }

  // 3. Insufficient balance (underfunded account)
  if (
    errStr.includes('insufficient balance') ||
    errStr.includes('underfunded') ||
    errStr.includes('op_low_reserve') ||
    errStr.includes('tx_insufficient_balance') ||
    errStr.includes('op_underfunded') ||
    errStr.includes('amount too large')
  ) {
    return {
      type: 'INSUFFICIENT_BALANCE',
      message: 'Insufficient XLM balance. Please fund your testnet account via Friendbot.',
    };
  }

  // 4. Custom contract errors: Unauthorized (Error 4)
  if (
    errStr.includes('unauthorized') ||
    errStr.includes('contracterror(4)') ||
    errStr.includes('error(contract, 4)') ||
    errStr.includes('contract error 4')
  ) {
    return {
      type: 'UNAUTHORIZED',
      message: 'Unauthorized. You are not the original author of this note.',
    };
  }

  // 5. Custom contract errors: Already Liked (Error 5)
  if (
    errStr.includes('already liked') ||
    errStr.includes('already_liked') ||
    errStr.includes('contracterror(5)') ||
    errStr.includes('error(contract, 5)') ||
    errStr.includes('contract error 5')
  ) {
    return {
      type: 'ALREADY_LIKED',
      message: 'You already liked this note.',
    };
  }

  // 6. Network/RPC failure
  if (
    errStr.includes('network') ||
    errStr.includes('rpc') ||
    errStr.includes('timeout') ||
    errStr.includes('fetch') ||
    errStr.includes('failed to fetch') ||
    errStr.includes('status 50') ||
    errStr.includes('unreachable')
  ) {
    return {
      type: 'NETWORK_ERROR',
      message: 'Stellar/Soroban network error or timeout. Please check your connection and try again.',
    };
  }

  // Fallback
  return {
    type: 'UNKNOWN_ERROR',
    message: errMsg || 'An unexpected Stellar/Soroban error occurred.',
  };
}

/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

import {
  bccProvider,
  BLOCKCHAIN_BITCOIN,
  BLOCKCHAIN_BITCOIN_CASH,
  BLOCKCHAIN_BITCOIN_GOLD,
  BLOCKCHAIN_LITECOIN,
  btcProvider,
  btgProvider,
  ltcProvider,
} from '@chronobank/login/network/BitcoinProvider'
import { nemProvider } from '@chronobank/login/network/NemProvider'
import BigNumber from 'bignumber.js'
import { bccDAO, btcDAO, btgDAO, ltcDAO } from 'dao/BitcoinDAO'
import contractsManagerDAO from 'dao/ContractsManagerDAO'
import ERC20ManagerDAO, { EVENT_ERC20_TOKENS_COUNT, EVENT_NEW_ERC20_TOKEN } from 'dao/ERC20ManagerDAO'
import ethereumDAO, { BLOCKCHAIN_ETHEREUM } from 'dao/EthereumDAO'
import NemDAO, { NEM_DECIMALS, NEM_XEM_NAME, NEM_XEM_SYMBOL } from 'dao/NemDAO'
import TokenModel from 'models/tokens/TokenModel'
import TransferErrorNoticeModel from 'models/notices/TransferErrorNoticeModel'
import type TransferExecModel from 'models/TransferExecModel'
import TransferError, { TRANSFER_CANCELLED, TRANSFER_UNKNOWN } from 'models/TransferError'
import tokenService, { EVENT_NEW_TOKEN } from 'services/TokenService'
import { notify } from 'redux/notifier/actions'
import { showConfirmTransferModal } from 'redux/ui/actions'
import { EVENT_NEW_BLOCK } from 'dao/AbstractContractDAO'
import Amount from 'models/Amount'
import { ETH } from 'redux/mainWallet/actions'

export const DUCK_TOKENS = 'tokens'
export const TOKENS_UPDATE = 'tokens/update'
export const TOKENS_UPDATE_LATEST_BLOCK = 'tokens/updateLatestBlock'
export const TOKENS_INIT = 'tokens/init'
export const TOKENS_FETCHING = 'tokens/fetching'
export const TOKENS_FETCHED = 'tokens/fetched'
export const TOKENS_REMOVE = 'tokens/remove'
export const TOKENS_FAILED = 'tokens/failed'

// It is not a redux action
const submitTxHandler = (dao, dispatch) => async (tx: TransferExecModel) => {
  try {
    await dispatch(showConfirmTransferModal(dao, tx))
  } catch (e) {
    // eslint-disable-next-line
    console.error('Transfer error', e)
    const e = new TransferError(e.message, TRANSFER_UNKNOWN)
    dispatch(notify(new TransferErrorNoticeModel(tx, e)))
  }
}

// It is not a redux action
const acceptTxHandler = (dao, dispatch) => async (tx: TransferExecModel) => {
  try {
    const txOptions = tx.options()
    // TODO @ipavlenko: Pass arguments
    await dao.immediateTransfer(tx.from(), tx.to(), tx.amount(), tx.amountToken(), tx.feeMultiplier(), txOptions.advancedParams)
  } catch (e) {
    // eslint-disable-next-line
    console.error('Transfer error', e)
    const e = new TransferError(e.message, TRANSFER_UNKNOWN)
    dispatch(notify(new TransferErrorNoticeModel(tx, e)))
  }
}

// It is not a redux action
const rejectTxHandler = (dao, dispatch) => async (tx: TransferExecModel) => {
  const e = new TransferError('Rejected', TRANSFER_CANCELLED)
  dispatch(notify(new TransferErrorNoticeModel(tx, e)))
}

export const alternateTxHandlingFlow = (dao) => (dispatch) => {
  dao
    .on('submit', submitTxHandler(dao, dispatch))
    .on('accept', acceptTxHandler(dao, dispatch))
    .on('reject', rejectTxHandler(dao, dispatch))
}

export const initTokens = () => async (dispatch, getState) => {
  if (getState().get(DUCK_TOKENS).isInited()) {
    return
  }
  dispatch({ type: TOKENS_INIT, isInited: true })

  dispatch({ type: TOKENS_FETCHING, count: 0 })

  const erc20: ERC20ManagerDAO = await contractsManagerDAO.getERC20ManagerDAO()
  erc20
    .on(EVENT_ERC20_TOKENS_COUNT, async (count) => {

      const currentCount = getState().get(DUCK_TOKENS).leftToFetch()
      dispatch({ type: TOKENS_FETCHING, count: currentCount + count + 1 /*eth*/ })

      // eth
      const eth: TokenModel = await ethereumDAO.getToken()
      if (eth) {
        dispatch({ type: TOKENS_FETCHED, token: eth })
        tokenService.registerDAO(eth, ethereumDAO)
      }
    })
    .on(EVENT_NEW_ERC20_TOKEN, (token: TokenModel) => {
      dispatch({ type: TOKENS_FETCHED, token })
      tokenService.createDAO(token)
    })
    .fetchTokens()

  dispatch(initBtcLikeTokens())
  dispatch(initNemTokens())
  dispatch(watchLatestBlock())
}

export const initBtcLikeTokens = () => async (dispatch, getState) => {
  const btcLikeTokens = [btcDAO, bccDAO, btgDAO, ltcDAO]
  const currentCount = getState().get(DUCK_TOKENS).leftToFetch()
  dispatch({ type: TOKENS_FETCHING, count: currentCount + btcLikeTokens.length })

  return Promise.all(
    btcLikeTokens
      .map(async (dao) => {
        try {
          const token = await dao.fetchToken()
          tokenService.registerDAO(token, dao)
          dispatch({ type: TOKENS_FETCHED, token })
          dispatch(alternateTxHandlingFlow(dao))
        } catch (e) {
          dispatch({ type: TOKENS_FAILED })
        }
      }),
  )
}

export const initNemTokens = () => async (dispatch, getState) => {
  try {
    const currentCount = getState().get(DUCK_TOKENS).leftToFetch()
    dispatch({ type: TOKENS_FETCHING, count: currentCount + 1 })
    const dao = new NemDAO(NEM_XEM_NAME, NEM_XEM_SYMBOL, nemProvider, NEM_DECIMALS)
    const nem = await dao.fetchToken()
    tokenService.registerDAO(nem, dao)
    dispatch({ type: TOKENS_FETCHED, token: nem })
    dispatch(alternateTxHandlingFlow(dao))
    dispatch(initNemMosaicTokens(nem))
  } catch (e) {
    dispatch({ type: TOKENS_FAILED })
  }
}

export const initNemMosaicTokens = (nem: TokenModel) => async (dispatch, getState) => {

  const mosaics = nemProvider.getMosaics()
  const currentCount = getState().get(DUCK_TOKENS).leftToFetch()
  dispatch({ type: TOKENS_FETCHING, count: currentCount + mosaics.length })
  // do not wait until initialized, it is ok to lazy load all the tokens
  return Promise.all(
    mosaics
      .map((m) => new NemDAO(m.name, m.symbol, nemProvider, m.decimals, m.definition, nem))
      .map(async (dao) => {
        try {
          const token = await dao.fetchToken()
          tokenService.registerDAO(token, dao)
          dispatch({ type: TOKENS_FETCHED, token })
          dispatch(alternateTxHandlingFlow(dao))
        } catch (e) {
          dispatch({ type: TOKENS_FAILED })
        }
      }),
  )
}

export const subscribeOnTokens = (callback) => (dispatch, getState) => {
  const handleToken = (token) => dispatch(callback(token))
  tokenService.on(EVENT_NEW_TOKEN, handleToken)
  // fetch for existing tokens
  const tokens = getState().get(DUCK_TOKENS)
  tokens.list().forEach(handleToken)
}

export const watchLatestBlock = () => async (dispatch) => {
  ethereumDAO.on(EVENT_NEW_BLOCK, (block) => {
    dispatch({
      type: TOKENS_UPDATE_LATEST_BLOCK,
      blockchain: BLOCKCHAIN_ETHEREUM,
      block,
    })
  })
  const block = await ethereumDAO.getBlockNumber()
  dispatch({
    type: TOKENS_UPDATE_LATEST_BLOCK,
    blockchain: BLOCKCHAIN_ETHEREUM,
    block: {
      blockNumber: block,
    },
  })

}

export const estimateGas = (tokenId, params, callback, gasPriseMultiplier = 1, address) => async () => {
  const tokenDao = tokenService.getDAO(tokenId)
  const [to, amount, func] = params
  try {
    const { gasLimit, gasFee, gasPrice } = await tokenDao.estimateGas(func, [to, new BigNumber(amount)], new BigNumber(0), address)
    callback(null, {
      gasLimit,
      gasFee: new Amount(gasFee.mul(gasPriseMultiplier), ETH),
      gasPrice: new Amount(gasPrice.mul(gasPriseMultiplier), ETH),
    })
  } catch (e) {
    callback(e)
  }
}

export const estimateBtcFee = (params, callback) => async () => {
  try {
    const { address, recipient, amount, formFee, blockchain } = params
    let fee
    switch (blockchain) {
      case BLOCKCHAIN_BITCOIN:
        fee = await btcProvider.estimateFee(address, recipient, amount, formFee)
        break
      case BLOCKCHAIN_BITCOIN_CASH:
        fee = await bccProvider.estimateFee(address, recipient, amount, formFee)
        break
      case BLOCKCHAIN_BITCOIN_GOLD:
        fee = await btgProvider.estimateFee(address, recipient, amount, formFee)
        break
      case BLOCKCHAIN_LITECOIN:
        fee = await ltcProvider.estimateFee(address, recipient, amount, formFee)
        break
    }
    callback(null, { fee: fee })
  } catch (e) {
    callback(e)
  }
}


/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

import bitcoin from 'bitcoinjs-lib'
import nemSdk from 'nem-sdk'
import bigi from 'bigi'
import hdKey from 'ethereumjs-wallet/hdkey'
import wallet from 'ethereumjs-wallet'
import { byEthereumNetwork } from './NetworkProvider'
import { createBCCEngine, createBTCEngine, createBTGEngine, createLTCEngine } from './BitcoinUtils'
import EthereumEngine from './EthereumEngine'
import { createNEMEngine } from './NemUtils'
import NemWallet from './NemWallet'
import {
  COIN_TYPE_BTC_MAINNET,
  COIN_TYPE_BTC_TESTNET,
  COIN_TYPE_BTG_MAINNET,
  COIN_TYPE_BTG_TESTNET,
  COIN_TYPE_LTC_MAINNET,
  COIN_TYPE_LTC_TESTNET,
  WALLET_HD_PATH,
} from './mnemonicProvider'

class PrivateKeyProvider {
  getPrivateKeyProvider (privateKey, { url, network } = {}, wallets) {
    const networkCode = byEthereumNetwork(network)
    const ethereumWallet = this.createEthereumWallet(privateKey)
    const btc = network && network.bitcoin && this.createBitcoinWallet(privateKey, bitcoin.networks[network.bitcoin])
    const bcc = network && network.bitcoinCash && this.createBitcoinWallet(privateKey, bitcoin.networks[network.bitcoinCash])
    const btg = network && network.bitcoinGold && this.createBitcoinGoldWallet(privateKey, bitcoin.networks[network.bitcoinGold])
    const ltc = network && network.litecoin && this.createLitecoinWallet(privateKey, bitcoin.networks[network.litecoin])
    const nem = network && network.nem && NemWallet.fromPrivateKey(privateKey, nemSdk.model.network.data[network.nem])

    let lastDeriveNumbers = 0

    wallets && wallets
      .items()
      .map((wallet) => {
        if (wallet.owners().items().filter((owner) => owner.address() === ethereumWallet.getAddressString()).length > 0 && wallet.constructor.name === 'DerivedWalletModel') {
          lastDeriveNumbers++
        }
      })

    return {
      networkCode,
      ethereum: new EthereumEngine(ethereumWallet, network, url, null, lastDeriveNumbers),
      btc: network && network.bitcoin && createBTCEngine(btc, bitcoin.networks[network.bitcoin]),
      bcc: network && network.bitcoinCash && createBCCEngine(bcc, bitcoin.networks[network.bitcoinCash]),
      btg: network && network.bitcoinGold && createBTGEngine(btg, bitcoin.networks[network.bitcoinGold]),
      ltc: network && network.litecoin && createLTCEngine(ltc, bitcoin.networks[network.litecoin]),
      nem: network && network.nem && createNEMEngine(nem, nemSdk.model.network.data[network.nem]),
    }
  }

  createBitcoinWalletFromPK (privateKey, network) {
    const keyPair = new bitcoin.ECPair(bigi.fromBuffer(Buffer.from(privateKey, 'hex')), null, {
      network,
    })
    return {
      keyPair,
      getNetwork () {
        return keyPair.getNetwork()
      },
      getAddress () {
        return keyPair.getAddress()
      },
    }
  }

  createBitcoinWallet (privateKey, network) {
    if (privateKey.length <= 64) {
      return this.createBitcoinWalletFromPK(privateKey, network)
    }
    const coinType = network === bitcoin.networks.testnet
      ? COIN_TYPE_BTC_TESTNET
      : COIN_TYPE_BTC_MAINNET
    return bitcoin.HDNode
      .fromSeedBuffer(Buffer.from(privateKey, 'hex'), network)
      .derivePath(`m/44'/${coinType}'/0'/0`)
  }

  createLitecoinWallet (privateKey, network) {
    if (privateKey.length <= 64) {
      return this.createBitcoinWalletFromPK(privateKey, network)
    }
    const coinType = network === bitcoin.networks.litecoin_testnet
      ? COIN_TYPE_LTC_TESTNET
      : COIN_TYPE_LTC_MAINNET
    return bitcoin.HDNode
      .fromSeedBuffer(Buffer.from(privateKey, 'hex'), network)
      .derivePath(`m/44'/${coinType}'/0'/0`)
  }

  createBitcoinGoldWallet (privateKey, network) {
    if (privateKey.length <= 64) {
      return this.createBitcoinWalletFromPK(privateKey, network)
    }
    const coinType = network === bitcoin.networks.bitcoingold_testnet
      ? COIN_TYPE_BTG_TESTNET
      : COIN_TYPE_BTG_MAINNET
    return bitcoin.HDNode
      .fromSeedBuffer(Buffer.from(privateKey, 'hex'), network)
      .derivePath(`m/44'/${coinType}'/0'/0`)
  }

  createEthereumWallet (privateKey) {
    if (privateKey.length <= 64) {
      return wallet.fromPrivateKey(Buffer.from(privateKey, 'hex'))
    }

    const hdWallet = hdKey.fromMasterSeed(Buffer.from(privateKey, 'hex'))
    return hdWallet.derivePath(WALLET_HD_PATH).getWallet()
  }

  validatePrivateKey (privateKey: string): boolean {
    try {
      this.createEthereumWallet(privateKey)
      return true
    } catch (e) {
      return false
    }
  }
}

export default new PrivateKeyProvider()

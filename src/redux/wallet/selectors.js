/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

import { createSelector } from 'reselect'
import { BLOCKCHAIN_ETHEREUM } from 'dao/EthereumDAO'
import { DUCK_MAIN_WALLET, ETH } from 'redux/mainWallet/actions'
import { DUCK_MULTISIG_WALLET } from 'redux/multisigWallet/actions'
import { DUCK_MARKET } from 'redux/market/action'
import { DUCK_TOKENS } from 'redux/tokens/actions'
import MainWalletModel from 'models/wallet/MainWalletModel'
import MultisigWalletModel from 'models/wallet/MultisigWalletModel'
import { getAccount } from 'redux/session/selectors'
import DerivedWalletModel from 'models/wallet/DerivedWalletModel'

import { getCurrentWallet } from './actions'

/**
 * SIMPLE SELECTORS
 * ==============================================================================
 */

export const getMainWallet = (state) => {
  return state.get(DUCK_MAIN_WALLET)
}

export const getMultisigWallets = (state) => {
  return state.get(DUCK_MULTISIG_WALLET)
}

export const getMainWalletBalance = (symbol) => createSelector(
  [getMainWallet],
  (mainWallet) => mainWallet.balances().item(symbol),
)

export const getCurrentWalletBalance = (symbol) => createSelector(
  [getCurrentWallet],
  (currentWallet) => currentWallet.balances().item(symbol),
)

export const getWalletsCount = () => createSelector(
  [getCurrentWallet],
  (currentWallet) => {
    let i = 0
    currentWallet.balances().items().map((balance) => {
      if (balance.amount().gt(0)) {
        i++
      }
    })
    return i
  },
)

export const selectMainWalletBalancesListStore = (state) =>
  state.get(DUCK_MAIN_WALLET).balances().list() // BalancesCollection, array of BalanceModel

export const selectTokensStore = (state) =>
  state.get(DUCK_TOKENS) // TokensCollection, array of TokenModel

export const selectMainWalletAddressesListStore = (state) => {
  return state.get(DUCK_MAIN_WALLET).addresses().list() // This is an instance of MainWalletModel
}

export const selectMarketPricesListStore = (state) => state.get(DUCK_MARKET).prices
export const selectMarketPricesSelectedCurrencyStore = (state) => state.get(DUCK_MARKET).selectedCurrency

/**
 * WALLET SECTIONS
 *
 *  Usage example:
 *
 *
 * const getSectionedWallets = makeGetSectionedWallets()
 *
 * const mapStateToProps = (state, props) => {
 *  const makeMapStateToProps = () => {
 *    return {
 *      walletsSections: getSectionedWallets(state, props),
 *    }
 *   }
 *  return mapStateToProps
 * }
 *
 * @connect(makeMapStateToProps)
 * export default class AnyComponent extends PureComponent {
 */

export const multisigWalletsSelector = () => createSelector(
  [
    getMainWallet,
    getMultisigWallets,
    getAccount,
  ],
  (
    mainWallet,
    multisigWallets,
    account,
  ) => {
    // final result will be svaed here
    const sectionsObject = {}

    // Go through mainWallet's addresses
    mainWallet.addresses().items().map((address) => {
      const addrJS = address.toJS()
      const addrID = addrJS.id
      if (addrJS.address != null) {
        if (!sectionsObject.hasOwnProperty(addrID)) {
          sectionsObject[addrID] = {
            data: [{
              address: addrJS.address,
              wallet: mainWallet,
            }],
          }
        } else {
          sectionsObject[addrID].data.push({
            address: addrJS.address,
            wallet: mainWallet,
          })
        }
      }
    })

    // Add multisig wallets
    multisigWallets
      .list()
      .map((aWallet) => {
        const owners = aWallet.owners()

        // if user not owner
        if (owners.items().filter((owner) => owner.address() === account).length <= 0) {
          return
        }

        const currentWalletAddress: string = aWallet.address()
        if (!sectionsObject.hasOwnProperty(aWallet.blockchain())) {
          sectionsObject[aWallet.blockchain()] = {
            data: [{
              address: currentWalletAddress,
              wallet: aWallet,
            }],
          }
        } else {
          sectionsObject[aWallet.blockchain()].data.push({
            address: currentWalletAddress,
            wallet: aWallet,
          })
        }
      })

    // Sort main sections and make an array
    const sortSectionsObject = (o) => Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {})
    const sortedSections = sortSectionsObject(sectionsObject)
    return Object.keys(sortedSections).map((sectionName) => {
      return {
        title: sectionName,
        data: sortedSections[sectionName].data,
      }
    })
  },
)

/**
 * This is memoized selector. Produce the list of blockchain sections and wallets
 *
 * @return { [{title: string, data: string | string[]}] }
 *         Returns list of sections for the ReactNative SectionList.
 */
export const getMainWalletSections = createSelector(
  [
    selectMainWalletAddressesListStore,
  ],
  (mainWalletAddressesList) => {
    return mainWalletAddressesList
      .filter((address) => address.address() !== null) // We do not need wallets with null address (e.g. BTG in Rinkeby/Infura)
      .reduce((accumulator, addressModel, blockchainTitle) => {
        const address = addressModel.address() // AddressModel.address() returns string with wallet's address
        accumulator.push({
          // data must contains an array (requirement of SectionList component in React Native, sorry)
          data: [address],
          title: blockchainTitle,
        })
        return accumulator
      }, [])
      .sort((sectionA, sectionB) => { // sort by blocakchains titles
        const titleA = sectionA.title
        const titleB = sectionB.title
        if (titleA < titleB) {
          return -1
        }
        if (titleA > titleB) {
          return 1
        }
        return 0
      })
  },
)

/**
 * This is the factory for selector
 * It may be used in different components and each of them will have its own memoized copy
 *
 * @return { [{title: string, data: string | string[]}] }
 *         Returns list of sections for the ReactNative SectionList.
 */
export const makeGetSectionedWallets = () => createSelector(
  [
    getMainWalletSections,
  ],
  (mainWalletSections) => mainWalletSections,
)

/**
 * TOKENS AND BALANCE BY ADDRESS
 *
 * Usage example:
 * const makeMapStateToProps = (origState, origProps) => {
 *  const getWalletTokensAndBalanceByAddress = makeGetWalletTokensAndBalanceByAddress()
 *  const mapStateToProps = (state, ownProps) => {
 *     const walletTokensAndBalanceData = getWalletTokensAndBalanceByAddress(state, ownProps)
 *     return {
 *       walletTokensAndBalance: walletTokensAndBalanceData,
 *     }
 *   }
 *   return mapStateToProps
 * }
 *
 * @connect(makeMapStateToProps)
 * export default class AnyComponent extends PureComponent<WalletPanelProps> {
 *
 * NOTE: component AnyComnnect MUST have props walletAddress: string & blockchainTitle: string
 * Both props are required, because we may have same wallet addresses in "Bitcoin" and "Bitcoin Cash" blockchains
 */

/**
 * This is the factory for selector
 * It may be used in different components and each of them will have its own memoized copy
 *
 * @return { { balance: number, tokens: [ {ETH: number } ] } }
 *         Returns list of sections for the ReactNative SectionList.
 */
export const makeGetWalletTokensAndBalanceByAddress = (blockchainTitle) => {
  return createSelector(
    [
      getMainWalletSections,
      selectMainWalletAddressesListStore,
      selectMainWalletBalancesListStore,
      selectTokensStore,
      selectMarketPricesListStore,
      selectMarketPricesSelectedCurrencyStore,
    ],
    (
      addressesAndBlockchains,
      mainWalletAddressesList,
      mainWalletBalances,
      mainWalletTokens,
      prices,
      selectedCurrency,
    ) => {

      /**
       * Internal utility
       * @private
       */
      const convertAmountToNumber = (symbol, amount) =>
        mainWalletTokens
          .item(symbol)
          .removeDecimals(amount)
          .toNumber()

      const walletTokensAndBalanceByAddress = mainWalletBalances // BalancesCollection, array of BalanceModel
        .filter((balanceItem) => {
          const bSymbol = balanceItem.symbol()
          const bToken = mainWalletTokens.item(bSymbol)
          return bToken.blockchain() === blockchainTitle
        })
        .map((balance) => {
          const bAmount = balance.amount()
          const bSymbol = balance.symbol()
          const tAmount = convertAmountToNumber(bSymbol, bAmount)
          let tokenAmountKeyValuePair = {}
          tokenAmountKeyValuePair[bSymbol] = tAmount
          return {
            symbol: bSymbol,
            amount: tAmount,
          }
        })

      const arrWalletTokensAndBalanceByAddress = [...walletTokensAndBalanceByAddress.values()]
      const result = arrWalletTokensAndBalanceByAddress
        .reduce((accumulator, tokenKeyValuePair) => {
          const { amount, symbol } = tokenKeyValuePair

          const tokenPrice = prices[symbol] && prices[symbol][selectedCurrency] || 0
          if (tokenPrice && amount > 0) {
            accumulator.balance += (amount * tokenPrice)
          }
          accumulator.tokens.push({
            symbol: symbol,
            amount: amount,
            amountPrice: amount * tokenPrice,
          })
          accumulator.tokens = accumulator.tokens.sort((a, b) => {
            const oA = a.symbol
            const oB = b.symbol
            return (oA > oB) - (oA < oB)
          }) // sort by blocakchains titles (TODO: it does not effective to resort whole array each time in reduce, need better place...)
          return accumulator
        }, {
          balance: 0,
          tokens: [],
        })

      // result.tokens.push({
      //   symbol: 'BTC',
      //   amount: 1,
      //   amountPrice: 10000000000.32132,
      // })

      // Let's add an address of Main Wallet into final result
      const currentWallet = addressesAndBlockchains
        .find((mainWalletAddrAndChain) => {
          return mainWalletAddrAndChain.title === blockchainTitle
        })
      result.address = currentWallet && currentWallet.data && currentWallet.data[0]

      return result
    },
  )
}

export const makeGetWalletTokensForMultisig = (blockchainTitle, addressTitle) => {
  return createSelector(
    [
      getMultisigWallets,
      selectTokensStore,
      selectMarketPricesListStore,
      selectMarketPricesSelectedCurrencyStore,
    ],
    (
      multisigWallets,
      mainWalletTokens,
      prices,
      selectedCurrency,
    ) => {

      /**
       * Internal utility
       * @private
       */
      const convertAmountToNumber = (symbol, amount) =>
        mainWalletTokens
          .item(symbol)
          .removeDecimals(amount)
          .toNumber()

      if (!multisigWallets.item(addressTitle)) {
        return null
      }
      const customTokens = multisigWallets.item(addressTitle) instanceof DerivedWalletModel ? multisigWallets.item(addressTitle).customTokens() : null
      const walletTokensAndBalanceByAddress = multisigWallets
        .item(addressTitle)
        .balances()
        .list()
        .filter((balance) => balance.symbol() === ETH || (customTokens ? customTokens.includes(balance.symbol()) : true))
        .filter((balance) => mainWalletTokens.item(balance.symbol()).isFetched())
        .map((balance) => {
          const bAmount = balance.amount()
          const bSymbol = balance.symbol()
          const tAmount = convertAmountToNumber(bSymbol, bAmount)
          let tokenAmountKeyValuePair = {}
          tokenAmountKeyValuePair[bSymbol] = tAmount
          return {
            symbol: bSymbol,
            amount: tAmount,
          }
        })

      const arrWalletTokensAndBalanceByAddress = [...walletTokensAndBalanceByAddress.values()]
      return arrWalletTokensAndBalanceByAddress
        .reduce((accumulator, tokenKeyValuePair) => {
          const { amount, symbol } = tokenKeyValuePair

          const tokenPrice = prices[symbol] && prices[symbol][selectedCurrency] || 0
          if (tokenPrice && amount > 0) {
            accumulator.balance += (amount * tokenPrice)
          }
          accumulator.tokens.push({
            symbol: symbol,
            amount: amount,
            amountPrice: amount * tokenPrice,
          })
          accumulator.tokens = accumulator.tokens.sort((a, b) => {
            const oA = a.symbol
            const oB = b.symbol
            return (oA > oB) - (oA < oB)
          }) // sort by blocakchains titles (TODO: it does not effective to resort whole array each time in reduce, need better place...)
          return accumulator
        }, {
          balance: 0,
          tokens: [],
        })
    },
  )
}

export const walletDetailSelector = (walletBlockchain, walletAddress) => createSelector(
  [
    getMainWallet,
    getMultisigWallets,
  ],
  (
    mainWallet,
    multisigWallets,
  ) => {
    // final result will be svaed here
    let wallet = null
    if (!walletBlockchain || !walletAddress) {
      return wallet
    }

    // Go through mainWallet's addresses
    mainWallet.addresses().items().map((address) => {
      if (address.address() === walletAddress) {
        wallet = mainWallet
      }
    })

    // Add multisig wallets
    multisigWallets
      .list()
      .map((aWallet) => {
        const currentWalletAddress: string = aWallet.address()
        if (currentWalletAddress === walletAddress) {
          wallet = aWallet
        }
      })

    return wallet
  },
)

export const walletInfoSelector = (wallet, blockchain, address, state) => {
  if (wallet instanceof MainWalletModel) {
    return makeGetWalletTokensAndBalanceByAddress(blockchain, address)(state)
  }
  if (wallet instanceof MultisigWalletModel || wallet instanceof DerivedWalletModel) {
    return makeGetWalletTokensForMultisig(blockchain, address)(state)
  }
}

export const getDeriveWalletsAddresses = (state, blockchain) => {
  let accounts = []
  state.get(DUCK_MULTISIG_WALLET)
    .list()
    .map((wallet) => {
      if (wallet instanceof DerivedWalletModel && wallet.blockchain() === blockchain) {
        accounts.push(wallet.address())
      }
    })
  return accounts
}

/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

import { Button, IPFSImage } from 'components'
import { BLOCKCHAIN_BITCOIN, BLOCKCHAIN_BITCOIN_CASH, BLOCKCHAIN_BITCOIN_GOLD, BLOCKCHAIN_LITECOIN } from '@chronobank/login/network/BitcoinProvider'
import { TOKEN_ICONS } from 'assets'
import Preloader from 'components/common/Preloader/Preloader'
import TokenValue from 'components/common/TokenValue/TokenValue'
import contractsManagerDAO from 'dao/ContractsManagerDAO'
import MainWalletModel from 'models/wallet/MainWalletModel'
import MultisigWalletModel from 'models/wallet/MultisigWalletModel'
import { BLOCKCHAIN_ETHEREUM } from 'dao/EthereumDAO'
import { TX_TRANSFER } from "dao/ERC20DAO"
import web3Converter from 'utils/Web3Converter'
import Amount from 'models/Amount'
import Immutable from 'immutable'
import BigNumber from 'bignumber.js'
import * as validators from 'models/validator'
import { CircularProgress, MenuItem, MuiThemeProvider, Paper } from 'material-ui'
import TokenModel from 'models/tokens/TokenModel'
import PropTypes from 'prop-types'
import { integerWithDelimiter } from 'utils/formatter'
import React, { PureComponent } from 'react'
import { connect } from 'react-redux'
import { Translate } from 'react-redux-i18n'
import { SelectField, Slider, TextField } from 'redux-form-material-ui'
import { change, Field, formPropTypes, formValueSelector, getFormSyncErrors, getFormValues, reduxForm } from 'redux-form/immutable'
import { ETH, getSpendersAllowance } from 'redux/mainWallet/actions'
import { DUCK_SESSION } from 'redux/session/actions'
import { getGasPriceMultiplier } from 'redux/session/selectors'
import { walletDetailSelector, walletInfoSelector } from 'redux/wallet/selectors'
import { DUCK_TOKENS, estimateBtcFee, estimateGas } from 'redux/tokens/actions'
import DerivedWalletModel from 'models/wallet/DerivedWalletModel'
import inversedTheme from 'styles/themes/inversed'
import styles from '../styles'
import { prefix } from './lang'
import './SendTokensForm.scss'
import validate from './validate'

export const FORM_SEND_TOKENS = 'FormSendTokens'

export const MODE_SIMPLE = 'simple'
export const MODE_ADVANCED = 'advanced'

export const ACTION_TRANSFER = 'action/transfer'
export const ACTION_APPROVE = 'action/approve'

const FEE_RATE_MULTIPLIER = {
  min: 0.1,
  max: 1.9,
  step: 0.1,
}

function mapDispatchToProps (dispatch) {
  return {
    estimateGas: (tokenId, params, callback, gasPriseMultiplier, address) => dispatch(estimateGas(tokenId, params, callback, gasPriseMultiplier, address)),
    estimateFee: (params, callback) => dispatch(estimateBtcFee(params, callback)),
  }
}

function mapStateToProps (state, ownProps) {

  const wallet = walletDetailSelector(ownProps.blockchain, ownProps.address)(state)
  const walletInfo = walletInfoSelector(wallet, ownProps.blockchain, ownProps.address, state)
  const selector = formValueSelector(FORM_SEND_TOKENS)
  const formValues = getFormValues(FORM_SEND_TOKENS)
  const symbol = selector(state, 'symbol')
  const tokenId = walletInfo.tokens.some((token) => token.symbol === symbol) ? symbol : walletInfo.tokens[0].symbol
  const tokenInfo = walletInfo.tokens.find((token) => token.symbol === tokenId)
  const feeMultiplier = selector(state, 'feeMultiplier')
  const recipient = selector(state, 'recipient')
  const amount = selector(state, 'amount')
  const satPerByte = selector(state, 'satPerByte')
  const gweiPerGas = selector(state, 'gweiPerGas')
  const gasLimit = selector(state, 'gasLimit')
  const mode = selector(state, 'mode')
  const formErrors = getFormSyncErrors(FORM_SEND_TOKENS)(state)
  const token = state.get(DUCK_TOKENS).item(tokenId)
  const isMultiToken = walletInfo.tokens.length > 1

  return {
    wallet,
    tokens: state.get(DUCK_TOKENS),
    account: state.get(DUCK_SESSION).account,
    amount,
    token,
    tokenInfo,
    isMultiToken,
    walletInfo,
    recipient,
    symbol,
    mode,
    formErrors,
    formValues: (formValues(state) && JSON.stringify(formValues(state).toJSON())) || null,
    feeMultiplier,
    satPerByte,
    gasLimit,
    gweiPerGas,
    gasPriceMultiplier: getGasPriceMultiplier(token.blockchain())(state),
  }
}

@connect(mapStateToProps, mapDispatchToProps)
@reduxForm({ form: FORM_SEND_TOKENS, validate })
export default class SendTokensForm extends PureComponent {
  static propTypes = {
    blockchain: PropTypes.string.isRequired,
    address: PropTypes.string.isRequired,
    account: PropTypes.string,
    wallet: PropTypes.oneOfType([
      PropTypes.instanceOf(MainWalletModel),
      PropTypes.instanceOf(MultisigWalletModel),
      PropTypes.instanceOf(DerivedWalletModel),
    ]),
    recipient: PropTypes.string,
    token: PropTypes.instanceOf(TokenModel),
    tokenInfo: PropTypes.shape({
      amount: PropTypes.number,
      amountPrice: PropTypes.number,
      symbol: PropTypes.string,
    }),
    feeMultiplier: PropTypes.number,
    satPerByte: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    gasLimit: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    gweiPerGas: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    isMultiTokenWallet: PropTypes.bool,
    transfer: PropTypes.func,
    estimateGas: PropTypes.func,
    onTransfer: PropTypes.func,
    onApprove: PropTypes.func,
    gasPriceMultiplier: PropTypes.number,
    formErrors: PropTypes.object,
    ...formPropTypes,
  }

  constructor () {
    super(...arguments)
    this.state = {
      isContract: false,
      btcFee: null,
      btcFeeMultiplier: this.props.feeMultiplier,
      btcFeeError: false,
      gasFee: null,
      gasPrice: null,
      gasLimit: null,
      gasLimitEstimated: null,
      gasFeeError: false,
      gasFeeLoading: false,
    }

    this.timeout = null
  }

  componentWillReceiveProps (newProps) {
    if (newProps.token.address() !== this.props.token.address()) {
      this.checkIsContract(newProps.token.address())
        .then((result) => {
          this.setState({
            isContract: result,
          })
        })
    }

    if ((newProps.token.address() !== this.props.token.address() || newProps.recipient !== this.props.recipient) && newProps.token.isERC20()) {
      this.props.dispatch(getSpendersAllowance(newProps.token.id(), newProps.recipient))
    }

    if (newProps.token.blockchain() === BLOCKCHAIN_ETHEREUM && newProps.amount > 0 &&
      (newProps.formValues !== this.props.formValues || newProps.mode !== this.mode)) {
      const { token, recipient, amount, feeMultiplier, wallet } = newProps
      try {
        const value = new Amount(token.addDecimals(amount), newProps.symbol)
        this.handleEstimateGas(token.symbol(), [recipient, value, TX_TRANSFER], feeMultiplier, wallet.address())
      } catch (error) {
      }
    }

    if (this.isBTCLikeBlockchain(newProps.token.blockchain()) &&
      (newProps.formValues !== this.props.formValues || newProps.mode !== this.mode) &&
      newProps.amount > 0) {
      try {
        const value = new Amount(newProps.token.addDecimals(new BigNumber(newProps.amount)), newProps.symbol)
        this.handleEstimateBtcFee(
          newProps.address,
          newProps.recipient,
          value,
          this.getFormFee(newProps),
          newProps.token.blockchain(),
        )
      } catch (error) {
      }
    }

    if (newProps.mode === MODE_SIMPLE && this.isBTCLikeBlockchain(this.props.token.blockchain()) &&
      newProps.feeMultiplier !== this.props.feeMultiplier) {
      this.props.dispatch(change(FORM_SEND_TOKENS, 'satPerByte', this.getFormFee(newProps)))
    }
    if (newProps.mode === MODE_SIMPLE && this.props.token.blockchain() === BLOCKCHAIN_ETHEREUM &&
      newProps.feeMultiplier !== this.props.feeMultiplier) {
      this.props.dispatch(change(FORM_SEND_TOKENS, 'gweiPerGas', this.getFormFee(newProps)))
    }
    if (newProps.gasPriceMultiplier !== this.props.gasPriceMultiplier && newProps.token.blockchain() === BLOCKCHAIN_ETHEREUM) {
      this.props.dispatch(change(FORM_SEND_TOKENS, 'feeMultiplier', newProps.gasPriceMultiplier))
    }
    if (!this.props.gasLimit && this.state.gasLimit && this.props.gasLimit !== this.state.gasLimit) {
      this.props.dispatch(change(FORM_SEND_TOKENS, 'gasLimit', this.state.gasLimit))
    }
  }

  componentWillUnmount () {
    clearTimeout(this.timeout)
  }

  handleTransfer = (values) => {
    this.props.onSubmit(values.set('action', ACTION_TRANSFER), {
      advancedMode: this.state.advancedMode,
      estimatedGasLimit: this.state.estimatedGasLimit,
    })
  }

  handleApprove = (values) => {
    this.props.onSubmit(values.set('action', ACTION_APPROVE))
  }

  handleRevoke = () => {
    this.props.onSubmit(new Immutable.Map({
      action: ACTION_APPROVE,
      symbol: this.props.token.symbol(),
      amount: 0,
      recipient: this.props.recipient,
    }))
  }

  handleChangeFeeSlider = async (event, multiplier) => {
    this.calculatingFee({}, Number((multiplier * this.props.token.feeRate()).toFixed(1)))
  }

  handleChangeMode = () => {
    this.props.dispatch(change(FORM_SEND_TOKENS, 'mode', this.props.mode === MODE_SIMPLE ? MODE_ADVANCED : MODE_SIMPLE))
  }

  handleEstimateGas = (tokenId, params, feeMultiplier, address) => {
    clearTimeout(this.timeout)
    const { gasLimit, gweiPerGas } = this.props
    if (this.props.mode === MODE_ADVANCED && (gasLimit || this.state.gasLimitEstimated) && gweiPerGas) {

      if ((gasLimit && validators.positiveNumber(gasLimit)) || validators.positiveNumber(gweiPerGas))
      {
        this.setState({
          gasFee: null,
          gasPrice: null,
          gasFeeError: false,
          gasFeeLoading: false,
        })
      } else {
        this.setState((state, props) => {
          const customGasLimit = props.gasLimit || this.state.gasLimitEstimated
          return {
            gasFee: new Amount(web3Converter.toWei(props.gweiPerGas || 0, 'gwei') * customGasLimit, ETH),
            gasPrice: web3Converter.toWei(props.gweiPerGas || 0, 'gwei'),
            gasFeeError: false,
            gasFeeLoading: false,
          }
        })
      }

    } else {
      this.setState({
        gasFeeLoading: true,
      }, () => {
        this.timeout = setTimeout(() => {
          this.props.estimateGas(tokenId, params, (error, params) => {
            if (error) {
              this.setState({
                gasFeeError: true,
              })
            } else {
              const { gasLimit, gasFee, gasPrice } = params
              this.setState(() => {
                return {
                  gasFee,
                  gasPrice,
                  gasLimitEstimated: gasLimit,
                  gasFeeError: false,
                  gasFeeLoading: false,
                }
              })
            }
          }, feeMultiplier, address)
        }, 1000)
      })
    }
  }

  handleEstimateBtcFee = (address, recipient, amount, formFee, blockchain) => {
    clearTimeout(this.timeout)
    this.setState({
      btcFeeLoading: true,
    }, () => {
      this.timeout = setTimeout(() => {
        const params = {
          address,
          recipient,
          amount,
          formFee,
          blockchain,
        }
        this.props.estimateFee(params, (error, { fee }) => {
          if (error) {
            this.setState({
              btcFeeError: true,
            })
          } else {
            this.setState({
              btcFee: fee,
              btcFeeMultiplier: this.props.feeMultiplier,
              btcFeeError: false,
              btcFeeLoading: false,
            })
          }
        })
      }, 1000)
    })
  }

  getAdvancedFormFeeValue = (props = this.props) => {
    switch (true) {
      case this.isBTCLikeBlockchain(props.token.blockchain()):
        return props.satPerByte
      case props.token.blockchain() === BLOCKCHAIN_ETHEREUM:
        return props.gweiPerGas
      default:
        return null
    }
  }

  getFormFee = (props = this.props) => {
    return this.props.mode === MODE_SIMPLE ? Number(((props.feeMultiplier) * props.token.feeRate()).toFixed(1)) : this.getAdvancedFormFeeValue(props)
  }

  getFeeTitle () {
    const { token } = this.props

    switch (token.blockchain()) {
      case BLOCKCHAIN_BITCOIN:
      case BLOCKCHAIN_BITCOIN_CASH:
      case BLOCKCHAIN_BITCOIN_GOLD:
      case BLOCKCHAIN_LITECOIN:
        return 'feeRate'
      case BLOCKCHAIN_ETHEREUM:
        return 'gasPrice'
      default:
        return ''
    }
  }

  getBtcXOfAverage = () => {
    if (this.props.mode === MODE_ADVANCED) {
      return (this.props.satPerByte / this.props.token.feeRate()).toFixed(1)
    }
    return this.state.btcFeeMultiplier.toFixed(1)
  }

  getTransactionFeeDescription = () => {

    if (this.isBTCLikeBlockchain(this.props.token.blockchain())) {
      if (this.props.invalid) {
        return (
          <span styleName='description'>
            <Translate value={`${prefix}.errorFillAllFields`} />
          </span>)
      }
      if (this.props.mode === MODE_ADVANCED && !this.props.satPerByte) {
        return <Translate value={`${prefix}.errorFillSatPerBiteField`} />
      }
      if (this.state.btcFeeLoading) {
        return <div styleName='fee-loader-container'><CircularProgress size={12} thickness={1.5} /></div>
      }
      if (this.state.btcFeeError) {
        return (
          <span styleName='description'>
            <Translate value={`${prefix}.errorEstimateFee`} />
          </span>)
      }

      if (this.state.btcFee) {
        return (
          <span styleName='description'>
            {`${this.props.token.symbol()}  ${this.convertSatoshiToBTC(this.state.btcFee)} (≈USD `}
            <TokenValue renderOnlyPrice onlyPriceValue value={new Amount(this.state.btcFee, this.props.token.symbol())} />{')'}
            <span styleName='gwei-multiplier'>
              <Translate value={`${prefix}.averageFee`} multiplier={this.getBtcXOfAverage()} />
            </span>
          </span>)
      }

    } else if (this.props.token.blockchain() === BLOCKCHAIN_ETHEREUM) {

      if (this.props.invalid) {
        return (
          <span styleName='description'>
            <Translate value={`${prefix}.errorFillAllFields`} />
          </span>)
      }
      if (this.state.gasFeeLoading) {
        return <div styleName='fee-loader-container'><CircularProgress size={12} thickness={1.5} /></div>
      }
      if (this.state.gasFeeError) {
        return (
          <span styleName='description'>
            <Translate value={`${prefix}.errorEstimateFee`} />
          </span>)
      }

      return (
        <span styleName='description'>
          {this.state.gasFee && (
            <span>{`ETH ${web3Converter.fromWei(this.state.gasFee, 'wei').toString()} (≈USD `}
              <TokenValue renderOnlyPrice onlyPriceValue value={this.state.gasFee} />{')'}
            </span>
          )}
          {this.props.mode === MODE_SIMPLE && this.state.gasPrice && (
            <span styleName='gwei-multiplier'>
              <Translate value={`${prefix}.averageFee`} multiplier={this.props.feeMultiplier} />
            </span>
          )}
        </span>)
    }

    return null
  }

  isFieldValid = (fieldName) => {
    return fieldName in this.props.formErrors
  }

  checkIsContract (address): Promise {
    return contractsManagerDAO.isContract(address)
  }

  convertSatoshiToBTC = (satoshiAmount) => {
    return new BigNumber(satoshiAmount / 100000000)
  }

  isBTCLikeBlockchain = (blockchain) => {
    return [
      BLOCKCHAIN_BITCOIN,
      BLOCKCHAIN_BITCOIN_CASH,
      BLOCKCHAIN_BITCOIN_GOLD,
      BLOCKCHAIN_LITECOIN,
    ].includes(blockchain)
  }

  isTransactionFeeAvailable = (blockchain) => {
    return this.isBTCLikeBlockchain(blockchain) || blockchain === BLOCKCHAIN_ETHEREUM
  }

  renderHead () {
    const { token, isMultiToken, walletInfo, wallet, tokenInfo } = this.props

    return (
      <div styleName='head'>
        <div styleName='head-token-icon'>
          <IPFSImage
            styleName='content'
            multihash={token.icon()}
            fallback={TOKEN_ICONS[token.symbol()]}
          />
        </div>

        <div styleName='head-section'>
          <span styleName='head-section-text'>
            <Translate value='wallet.sendTokens' />
          </span>
        </div>
        {isMultiToken && (
          <div styleName='head-token-choose-form'>
            <MuiThemeProvider theme={inversedTheme}>
              {walletInfo.tokens.length === 0
                ? <Preloader />
                : (
                  <Field
                    component={SelectField}
                    name='symbol'
                    fullWidth
                    {...styles}
                  >
                    {walletInfo.tokens
                      .map((tokenData) => {
                        const token: TokenModel = this.props.tokens.item(tokenData.symbol)
                        if (token.isLocked()) {
                          return
                        }
                        return (
                          <MenuItem
                            key={token.id()}
                            value={token.id()}
                            primaryText={token.symbol()}
                          />
                        )
                      })}
                  </Field>
                )
              }
            </MuiThemeProvider>
          </div>
        )}
        <div styleName='wallet-name-section'>
          <div styleName='wallet-name-title-section'>
            <span styleName='wallet-name-title'>
              <Translate value='wallet.walletName' />
            </span>
          </div>
          <div styleName='wallet-value'>
            <span styleName='wallet-value'>
              {wallet.addresses().item(token.blockchain()).address()}
            </span>
          </div>
        </div>

        <div styleName='balance'>
          <div styleName='value-amount'>
            {tokenInfo.symbol} {integerWithDelimiter(tokenInfo.amount, true, null)}
          </div>
          <div styleName='value'>
            <span styleName='price-value'>
              ≈USD {integerWithDelimiter(tokenInfo.amountPrice.toFixed(2), true, null)}
            </span>
          </div>
        </div>
      </div>
    )
  }

  renderBody () {
    const { invalid, mode, pristine, token, handleSubmit, feeMultiplier, wallet, dispatch } = this.props
    const isTimeLocked = wallet.isTimeLocked()

    return (
      <div styleName='form-container'>
        <div>
          <Field
            component={TextField}
            name='recipient'
            floatingLabelText={<Translate value={`${prefix}.recipientAddress`} />}
            fullWidth
          />
          <Field
            name='mode'
            component={(props) => <input type='hidden' {...props} />}
          />
        </div>
        <div styleName='row'>
          <Field
            component={TextField}
            name='amount'
            floatingLabelText={<Translate value={`${prefix}.amount`} />}
            fullWidth
          />
        </div>
        {mode === MODE_SIMPLE && feeMultiplier && token.feeRate() && (
          <div styleName='row'>
            <div styleName='feeRate'>
              <Field
                component={Slider}
                sliderStyle={{ marginBottom: 0, marginTop: 5 }}
                name='feeMultiplier'
                {...FEE_RATE_MULTIPLIER}
              />
              <div styleName='tagsWrap'>
                <div><Translate value={`${prefix}.slow`} /></div>
                <div styleName='tagDefault' />
                <div><Translate value={`${prefix}.fast`} /></div>
              </div>
            </div>
          </div>
        )}
        {mode === MODE_ADVANCED && this.isBTCLikeBlockchain(token.blockchain()) && (
          <div styleName='advanced-mode-container'>
            <div styleName='field'>
              <Field
                component={TextField}
                name='satPerByte'
                floatingLabelText={<Translate value='wallet.satPerByte' />}
                fullWidth
              />
            </div>
          </div>
        )}
        {mode === MODE_ADVANCED && token.blockchain() === BLOCKCHAIN_ETHEREUM && (
          <div styleName='advanced-mode-container'>
            <div styleName='field'>
              <Field
                component={TextField}
                name='gweiPerGas'
                floatingLabelText={<Translate value='wallet.gweiPerGas' />}
                fullWidth
              />
            </div>
            <div styleName='field'>
              <Field
                component={TextField}
                name='gasLimit'
                floatingLabelText={<Translate value='wallet.gasLimit' />}
                fullWidth
              />
            </div>
            { this.state.gasLimitEstimated && !this.props.gasLimit &&
            <div styleName='gas-limit-based-container'>
              <span styleName='gas-limit-based'><Translate value={`${prefix}.basedOnLimit`} limit={this.state.gasLimitEstimated} />
                <span
                  styleName='based-limit-value'
                  onTouchTap={() => this.props.dispatch(change(FORM_SEND_TOKENS, 'gasLimit', this.state.gasLimitEstimated))}
                >
                  {this.state.gasLimitEstimated}
                </span>
              </span>
            </div> }
          </div>
        )}
        {this.isTransactionFeeAvailable(token.blockchain()) &&
        <div styleName='transaction-fee'>
          <span styleName='title'>
            <Translate value={`${prefix}.transactionFee`} />
          </span> &nbsp;
          {this.getTransactionFeeDescription()}
        </div>}
        {/*<div styleName='template-container'>*/}
        {/*<div styleName='template-checkbox'>*/}
        {/*<Field*/}
        {/*component={Checkbox}*/}
        {/*name='isTemplateEnabled'*/}
        {/*/>*/}
        {/*</div>*/}
        {/*<div styleName='template-name'>*/}
        {/*<Field*/}
        {/*component={TextField}*/}
        {/*name='TemplateName'*/}
        {/*floatingLabelText={<Translate value={'wallet.templateName'} />}*/}
        {/*fullWidth*/}
        {/*/>*/}
        {/*</div>*/}
        {/*</div>*/}

        <div styleName='actions-row'>
          <div styleName='advanced-simple'>
            {(this.isBTCLikeBlockchain(token.blockchain()) || token.blockchain() === BLOCKCHAIN_ETHEREUM) && (
              <div onTouchTap={this.handleChangeMode}>
                <span styleName='advanced-text'>
                  <Translate value={mode === MODE_SIMPLE ? 'wallet.modeAdvanced' : 'wallet.modeSimple'} />
                </span>
              </div>)}
          </div>
          <div styleName='send'>
            <Button
              label={<Translate value={`${prefix}.send`} />}
              disabled={pristine || invalid || isTimeLocked}
              onTouchTap={handleSubmit(this.handleTransfer)}
            />
          </div>
        </div>
      </div>
    )
  }

  render () {
    return (
      <Paper>
        <form onSubmit={this.handleFormSubmit}>
          <div styleName='root-container'>
            {this.renderHead()}
            {this.renderBody()}
          </div>
        </form>
      </Paper>
    )
  }
}


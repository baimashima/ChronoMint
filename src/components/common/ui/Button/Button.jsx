/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

import classnames from 'classnames'
import React, { PureComponent } from 'react'
import PropTypes from 'prop-types'
import './Button.scss'

export default class Button extends PureComponent {
  static propTypes = {
    children: PropTypes.node,
    onTouchTap: PropTypes.func,
    buttonType: PropTypes.string,
    flat: PropTypes.bool,
    disabled: PropTypes.bool,
    label: PropTypes.oneOfType([
      PropTypes.node,
      PropTypes.string,
      PropTypes.number,
    ]),
    onClick: PropTypes.func,
    className: PropTypes.string,
    type: PropTypes.string,
  }

  static defaultProps = {
    buttonType: 'raised',
    type: 'button',
    disabled: false,
  }

  componentDidMount () {
    const callback = function (e) {
      const rec = this.getBoundingClientRect()
      let X = e.pageX - rec.x - window.pageXOffset
      let Y = e.pageY - rec.y - window.pageYOffset
      let rippleDiv = document.createElement("div")
      rippleDiv.classList.add('ripple')
      rippleDiv.setAttribute("style", "top:" + Y + "px; left:" + X + "px;")
      this.appendChild(rippleDiv)
      setTimeout(function () {
        rippleDiv.parentElement.removeChild(rippleDiv)
      }, 900)
    }
    this.button.addEventListener('mousedown', callback)
  }

  handleTouchTap = (e) => {
    if (this.props.disabled) {
      return
    }
    if (typeof this.props.onTouchTap === 'function') {
      return this.props.onTouchTap(e)
    }
    if (typeof this.props.onClick === 'function') {
      return this.props.onClick(e)
    }
  }

  setRef = (el) => {
    this.button = el
  }

  render () {
    let { buttonType, flat } = this.props
    if (flat) {
      buttonType = 'flat'
    }
    return (
      <div styleName='root' className={classnames('Button_root', this.props.className)}>
        <button
          ref={this.setRef}
          disabled={this.props.disabled}
          styleName={classnames('button', buttonType)}
          type={this.props.type}
          onTouchTap={this.handleTouchTap}
        >
          {this.props.children
            ? this.props.children
            : <span>{this.props.label}</span>

          }
        </button>
      </div>
    )
  }
}


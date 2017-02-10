import React, {Component} from 'react';
import {connect} from 'react-redux';
import {
    Paper,
    Divider
} from 'material-ui';
import ExchangeForm from './ExchangeForm';
import ExchangeDAO from '../../../dao/ExchangeDAO';

import globalStyles from '../../../styles';

const mapStateToProps = (state) => ({
    exchange: state.get('exchange')
});

@connect(mapStateToProps, null)
class ExchangeWidget extends Component {
    constructor() {
        super();
        this.state = {
            currencies: ['LHT'],
            selectedCurrency: 'LHT',
            amount: 0,
            buy: false
        }
    }

    componentDidMount() {
        ExchangeDAO.watchError();
    }

    exchangeLHTOperation = (values) => {
        const {exchange} = this.props;
        if (values.get('buy')) {
            const {sellPrice} = exchange.get(values.get('currency'));
            ExchangeDAO.buy(values.get('amount') * 100, sellPrice, values.get('account'));
        } else {
            const {buyPrice} = exchange.get(values.get('currency'));
            ExchangeDAO.sell(values.get('amount') * 100, buyPrice, values.get('account'));
        }
    };

    handleSubmit = (values) => {
        switch(values.get('currency')) {
            case 'LHT':
                this.exchangeLHTOperation(values);
            default:
                return false;
        }
    };

    render() {
        return (
            <Paper style={globalStyles.paper} zDepth={1} rounded={false}>
                <h3 style={globalStyles.title}>Exchange tokens</h3>
                <Divider style={{backgroundColor: globalStyles.title.color}}/>
                <ExchangeForm onSubmit={this.handleSubmit}/>
            </Paper>
        );
    }
}

export default ExchangeWidget;
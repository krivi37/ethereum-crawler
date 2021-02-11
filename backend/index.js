const Web3 = require('web3');
const ERC20Contract = require('erc20-contract-js');
const https = require('https');
const http = require('http');
const infura_project_id = '414318d5d59d43a2bb26e9a59c3025da';
const web3 = new Web3('https://mainnet.infura.io/v3/' + infura_project_id);
//const address = '0xaA7a9CA87d3694B5755f213B5D04094b8d0F0A6F';
const etherscan_api_return_limit = 10000;
const TOKEN_API = 'GWNREU4WXZXTZAQCGFY755RKNHMU1Q2QC3';
const block_by_timestamp = 'https://api.etherscan.io/api?module=block&action=getblocknobytime&timestamp=!timestamp!&closest=before&apikey=' + TOKEN_API;
//const total_token_supply_api = 'https://api.etherscan.io/api?module=stats&action=tokensupply&contractaddress=!contractaddress!&apikey=' + TOKEN_API;
const token_transfer_events = 'https://api.etherscan.io/api?module=account&action=tokentx&address=!address!&startblock=!startblock!&endblock=999999999&sort=desc&apikey=' + TOKEN_API;
let timestamp_regex = /!timestamp!/;
//let contract_regex = /!contractaddress!/;
let startblock_regex = /!startblock!/;
let address_regex = /!address!/;
let remove_last_zeroes = /0+$/;
const Etherscan = require('node-etherscan-api');
const etherscan = new Etherscan(TOKEN_API);
var bigDecimal = require('js-big-decimal');
const abiDecoder = require('abi-decoder');
const InputDataDecoder = require('ethereum-input-data-decoder');
var api_etherscan = require('etherscan-api').init(TOKEN_API);

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

const whitelist = ['http://localhost:4200'];

//Cross-Origin Resource Sharing Middleware
app.use(cors());

//Body Parser
app.use(bodyParser.json());

app.post('/gettransactionsfromblockno', async (req, res) => {
    console.log("incoming");
    let block_no = parseInt(req.body.blockNo);
    let address = req.body.address;
    let data = await getTransactionsFromBlockToLatest(block_no, address);
    res.json(data);
});

app.post('/getbalancebydate', async (req, res) => {
    let date = req.body.date;
    let address = req.body.address;
    let data = await getBalanceByDate(date, address);
    if (data.success) {
        let token_balance = Array.from(data.token_balance, ([key, value]) => ({ name: key, value: value }));
        res.json({ success: true, balance: data.balance, token_balance: token_balance, isContract: data.isContract });
    }
    else {
        res.json(data);
    }
});

async function getTransactionsFromBlockToLatest(blockNo, address) {
    let tokenMap = new Map();
    let isContract = false;
    let test_abi;
    try {
        test_abi = await etherscan.getContractAbi(address);
    } catch (error) {
        test_abi = undefined;
    }
    if (test_abi) isContract = true;
    let transactions = [];
    var options = {
        startBlock: blockNo,
        endBlock: "latest",
        sort: "asc"
    }
    // For direct interaction with blockchain, use manual scan 
    /*
    for(var i = starting_block; i < noLatest; i++){
    transactions.push(await checkBlock(i, address));
    }
    */
    let number_of_txs;
    let latestBlock;
    let txs;
    let tokens;
    do {
        txs = await etherscan.getTransactions(address, options);
        console.log('next iteration');
        if (txs == undefined) break;
        else if (typeof (txs) == 'string') {
            return { success: false, error: txs };
        }
        txs = txs.filter(tx => (tx.blockNumber >= blockNo));
        number_of_txs = txs.length;
        if (number_of_txs > 0) {
            latestBlock = txs[number_of_txs - 1].blockNumber;
            for (var i = 0; i < number_of_txs; i++) {
                tokens = undefined;
                if (txs[i].isError == '0') {
                    // This is done in order to prevent duplicate values from appering in the final result. If we could assume that the api call would return all the transactions
                    // associated with the given address in the last block of the "txs" array, then we could just set the endBlock in the next call to be latestBlockNumber - 1, 
                    // and there would be no need for this check. But multiple transactions associated with the address could exist in the latest block, and the API might not 
                    // return all of them, so we need to double query the latest block to make sure that we get all of the wanted transactions.
                    if (!((txs[i].blockNumber == latestBlock) && (number_of_txs == etherscan_api_return_limit))) {
                        txs[i].value = web3.utils.fromWei(txs[i].value);
                        if (txs[i].input.length > 2) {
                            if (!isContract) contract_address = (txs[i].to.toLowerCase() == address) ? txs[i].from : txs[i].to;
                            else contract_address = address;
                            tokens = await getTokensFromTxInput(tokenMap, contract_address, txs[i].input, txs[i].hash, txs[i].from);
                        }
                        txs[i].tx_fee = parseInt(txs[i].gasUsed) * parseInt(txs[i].gasPrice);
                        txs[i].tx_fee = web3.utils.fromWei(txs[i].tx_fee.toString());
                        txs[i].tokens = tokens;
                        transactions.push(txs[i]);
                    }
                }
            }
            if (number_of_txs > 0) {
                options.startBlock = parseInt(txs[txs.length - 1].blockNumber);
            }
        }

    } while (number_of_txs == etherscan_api_return_limit);
    console.log("done");
    return { isContract: isContract, transactions: transactions, success: true };
}

async function getBalanceByDate(given_date, address) {
    let isContract = false;
    let test_abi;
    try {
        test_abi = await etherscan.getContractAbi(address);
    } catch (error) {
        test_abi = undefined;
    }
    if (test_abi) isContract = true;
    let noLatest = await web3.eth.getBlockNumber();
    var options = {};
    var unixTimestamp = Math.round(new Date(given_date).getTime() / 1000);
    var block_on_given_date = await getBlockByTimestamp(unixTimestamp);
    if(block_on_given_date.toLowerCase().includes('error')){
        return { success: false, error: block_on_given_date };
    }
    let balance = new bigDecimal(0);
    let starting_balance;
    // Token balance from transactions will be stored in this map. We use a map, because an account can possibly hold multiple tokens, so the key is contract address which issued
    // the token, and the value is the token amount tied to the passed address
    let token_balance = new Map();
    let starting_token_balance = new Map();
    let tokenMap = new Map();

    // The commented piece of code would get the historical balance for the account, by putting a block number, but it requires Infura paid addon for archive data
    // Etherscan API has the same option, but it is also a paid option (not shown in the code).
    /*
    //Get transactions from 0 to the given block
    options.startBlock = 0;
    options.endBlock = block_on_given_date;
    options.sort = "desc";
    // Get the transactions associated with a wallet from block 0, to the block on the given date, and sort them in the descending order, so that we always get the latest transaction
    // even if the wallet had over 10000 transactions. This is done in order to get the latest block until the given date that was associated with the wallet, so we could call
    // the api function that can get the balance of the account on that block, if we have a paid Infura subscription, or etherscan pro API.
    let closest_to_date_txs = await etherscan.getTransactions(address, options);
    let number_of_txs = closest_to_date_txs.length;
    let closest_block_to_date = Number(closest_to_date_tx[0].blockNumber);
    web3.eth.getBalance(address, closest_block_to_date).then((data)=>{
        balance = data;
    });
    */

    // For free, we can just sum all of the transaction eth amount. In case the account had over 10000 transactions, we call the api in a while loop, until it returns less than
    // 10000 transactions. This is a slower method.
    // If the block on the given date is closer to the last block, we get the current balance, and subtract the balance of all transactions from the given block to the last one.
    // Else, we just add up the balance from block 0.
    options.sort = "asc";

    if (block_on_given_date > noLatest / 2) {
        let starting_balance_string;
        try{
            starting_balance_string = await etherscan.getAccountBalance(address, { unit: "ether" });
        }catch(error){
            return { success: false, error: error.message };
        }
        starting_balance = new bigDecimal(starting_balance_string);
        options.startBlock = block_on_given_date;
        options.endBlock = "latest";
    }
    else {
        options.startBlock = 0;
        options.endBlock = parseInt(block_on_given_date);
    }
    let number_of_txs;
    do {
        let closest_to_date_txs = await etherscan.getTransactions(address, options);
        if (closest_to_date_txs == undefined) break;
        else if (typeof (closest_to_date_txs) == 'string') {
            return { success: false, error: closest_to_date_txs };
        }
        if (closest_to_date_txs.length == 0) break;
        number_of_txs = closest_to_date_txs.length;
        var latestBlock = closest_to_date_txs[number_of_txs - 1].blockNumber;
        let tokens;
        console.log('next iteration');
        for (var i = 0; i < number_of_txs; i++) {
            tokens = undefined;
            if (closest_to_date_txs[i].isError == '0') {
                // This is done in order to prevent duplicate values from appering in the final result. If we could assume that the api call would return all the transactions
                // associated with the given address in the last block of the "txs" array, then we could just set the endBlock in the next call to be latestBlockNumber - 1, 
                // and there would be no need for this check. But multiple transactions associated with the address could exist in the latest block, and the API might not 
                // return all of them, so we need to double query the latest block to make sure that we get all of the wanted transactions.
                if (!((closest_to_date_txs[i].blockNumber == latestBlock) && (number_of_txs == etherscan_api_return_limit))) {
                    if (closest_to_date_txs[i].input.length > 2) {
                        if (!isContract) contract_address = (closest_to_date_txs[i].to.toLowerCase() == address) ? closest_to_date_txs[i].from : closest_to_date_txs[i].to;
                        else contract_address = address;
                        tokens = await getTokensFromTxInput(tokenMap, contract_address, closest_to_date_txs[i].input, closest_to_date_txs[i].hash, closest_to_date_txs[i].from);
                    }
                    closest_to_date_txs[i].tokens = tokens;
                    if (address.toLowerCase() == closest_to_date_txs[i].to.toLowerCase()) {
                        if (address.toLowerCase() != closest_to_date_txs[i].from.toLowerCase()) {
                            let val = web3.utils.fromWei(closest_to_date_txs[i].value);
                            balance = balance.add(new bigDecimal(val));
                            if (closest_to_date_txs[i].tokens) {
                                if (!isContract) balance = await putTokensInMap(token_balance, starting_token_balance, closest_to_date_txs[i].tokens, false, address, balance);
                                else {
                                    if ((closest_to_date_txs[i].tokens.to != undefined) && (closest_to_date_txs[i].tokens.to.toLowerCase() == address))
                                        balance = await putTokensInMap(token_balance, starting_token_balance, closest_to_date_txs[i].tokens, false, address, balance);
                                }
                            }
                        }
                        //Transaction to self
                        else {
                            let tx_fee = parseInt(closest_to_date_txs[i].gasUsed) * parseInt(closest_to_date_txs[i].gasPrice);
                            let val = web3.utils.fromWei(tx_fee.toString());
                            balance = balance.subtract(new bigDecimal(val));
                        }
                    }
                    else {
                        let val = web3.utils.fromWei(closest_to_date_txs[i].value);
                        let tx_fee = parseInt(closest_to_date_txs[i].gasUsed) * parseInt(closest_to_date_txs[i].gasPrice)
                        tx_fee = web3.utils.fromWei(tx_fee.toString());
                        val = new bigDecimal(val);
                        tx_fee = new bigDecimal(tx_fee);
                        val = val.add(tx_fee);
                        balance = balance.subtract(val);
                        if (closest_to_date_txs[i].tokens) {
                            if (!isContract) balance = await putTokensInMap(token_balance, starting_token_balance, closest_to_date_txs[i].tokens, true, address, balance);
                            else {
                                // if we are working with contract
                                if ((closest_to_date_txs[i].tokens.to != undefined) && (closest_to_date_txs[i].tokens.to.toLowerCase() == address))
                                    balance = await putTokensInMap(token_balance, starting_token_balance, closest_to_date_txs[i].tokens, true, address, balance);
                            }
                        }
                    }
                }
            }
            // Even if transaction has failed, the fees must be paid
            else if (address.toLowerCase() == closest_to_date_txs[i].from.toLowerCase()) {
                let tx_fee = parseInt(closest_to_date_txs[i].gasUsed) * parseInt(closest_to_date_txs[i].gasPrice);
                let val = web3.utils.fromWei(tx_fee.toString());
                balance = balance.subtract(new bigDecimal(val));
            }
        }
        number_of_txs = closest_to_date_txs.length;
        if (number_of_txs > 0) {
            options.startBlock = parseInt(closest_to_date_txs[closest_to_date_txs.length - 1].blockNumber);
        }

    } while (number_of_txs >= etherscan_api_return_limit)

    if (block_on_given_date > noLatest / 2) {
        balance = starting_balance.subtract(balance);
        starting_token_balance.forEach((value, key) => {
            let t_balance = new bigDecimal(value);
            t_balance = t_balance.subtract(new bigDecimal(token_balance.get(key)));
            t_balance = t_balance.getPrettyValue();
            if (t_balance != '0') t_balance = t_balance.replace(/(\.\d*?[1-9])0+$/g, "$1");
            if (t_balance[t_balance.length - 1] == '.') t_balance = t_balance.slice(0, - 1);
            token_balance.set(key, t_balance);
        });
    }
    let ret_balance = balance.getPrettyValue();
    if (ret_balance != '0') ret_balance = ret_balance.replace(/(\.\d*?[1-9])0+$/g, "$1");
    if (ret_balance[ret_balance.length - 1] == '.') ret_balance = ret_balance.slice(0, - 1);
    console.log("done");
    return { success: true, balance: ret_balance, token_balance: token_balance, isContract: isContract };
}

async function putTokensInMap(token_balance, starting_token_balance, tokens, sent, address, eth_balance) {
    let token_big_decimal;
    let t_bal = getTokenValues(tokens);
    // t_bal will be undefined if the event_name was 'approve'
    if (t_bal == undefined) return eth_balance;
    // If the address is the initiator of transaction
    if (sent) {
        // If we sent tokens for ETH or tokens for tokens
        if (t_bal.sent_value) {
            if (token_balance.has(t_bal.sent_name)) {
                token_big_decimal = new bigDecimal(token_balance.get(t_bal.sent_name));
                token_big_decimal = token_big_decimal.subtract(new bigDecimal(t_bal.sent_value));
                token_balance.set(t_bal.sent_name, token_big_decimal.getValue());
            }
            else {
                token_big_decimal = await getStartingTokenBalance(address, t_bal.sent_c_address);
                token_big_decimal = new bigDecimal(token_big_decimal);
                starting_token_balance.set(t_bal.sent_name, token_big_decimal.getValue());
                token_big_decimal = new bigDecimal('-' + t_bal.sent_value);
                token_balance.set(t_bal.sent_name, token_big_decimal.getValue());
            }
            // If we sent tokens for tokens
            if (t_bal.recieved_value) {
                // Recieved tokens
                if (token_balance.has(t_bal.recieved_name)) {
                    token_big_decimal = new bigDecimal(token_balance.get(t_bal.recieved_name));
                    token_big_decimal = token_big_decimal.add(new bigDecimal(t_bal.recieved_value));
                    token_balance.set(t_bal.recieved_name, token_big_decimal.getValue());
                }
                else {
                    token_big_decimal = await getStartingTokenBalance(address, t_bal.recieved_c_address);
                    token_big_decimal = new bigDecimal(token_big_decimal);
                    starting_token_balance.set(t_bal.recieved_name, token_big_decimal.getValue());
                    token_big_decimal = new bigDecimal(t_bal.recieved_value);
                    token_balance.set(t_bal.recieved_name, token_big_decimal.getValue());
                }
            }
            // Swapped tokens into ETH (Wrapped Ether)
            else {
                eth_balance = eth_balance.add(new bigDecimal(t_bal.value));
            }
        }
        // Swapped ETH into tokens or sent a transfer
        else {
            if (token_balance.has(t_bal.name)) {
                token_big_decimal = new bigDecimal(token_balance.get(t_bal.name));
                // If ETH was sent for swap, then we increase the tokens, else the tokens were sent for a transfer, so we subtract
                if (t_bal.swap) token_big_decimal = token_big_decimal.add(new bigDecimal(t_bal.value));
                else token_big_decimal = token_big_decimal.subtract(new bigDecimal(t_bal.value));
                token_balance.set(t_bal.name, token_big_decimal.getValue());
            }
            else {
                token_big_decimal = await getStartingTokenBalance(address, t_bal.address);
                token_big_decimal = new bigDecimal(token_big_decimal);
                starting_token_balance.set(t_bal.name, token_big_decimal.getValue());
                if (t_bal.swap) token_big_decimal = new bigDecimal(t_bal.value);
                else token_big_decimal = new bigDecimal('-' + t_bal.value);
                token_balance.set(t_bal.name, token_big_decimal.getValue());
            }
        }
    }
    // If the address has recieved a transaction, we only check for transfer
    else {
        if (token_balance.has(t_bal.name)) {
            token_big_decimal = new bigDecimal(token_balance.get(t_bal.name));
            token_big_decimal = token_big_decimal.add(new bigDecimal(t_bal.value));
            token_balance.set(t_bal.name, token_big_decimal.getValue());
        }
        else {
            token_big_decimal = await getStartingTokenBalance(address, t_bal.address);
            token_big_decimal = new bigDecimal(token_big_decimal);
            starting_token_balance.set(t_bal.name, token_big_decimal.getValue());
            token_big_decimal = new bigDecimal(t_bal.value);
            token_balance.set(t_bal.name, token_big_decimal.getValue());
        }
    }
    return eth_balance;
}

function getTokenValues(tokens) {
    switch (tokens.event_name) {
        case 'transfer': {
            return { value: tokens.value, name: tokens.name, address: tokens.address };
        }
        case 'swapETHForExactTokens':
        case 'swapExactETHForTokens': {
            return { value: tokens.value, name: tokens.name, sent_c_address: tokens.address, swap: true };
        }
        case 'swapTokensForExactETH':
        case 'swapExactTokensForETH': {
            return { sent_value: tokens.sent_value, sent_name: tokens.name, value: tokens.value, sent_c_address: tokens.address, swap: true };
        }
        case 'swapTokensForExactTokens': {
            return { sent_value: tokens.sent_tokens, sent_name: tokens.sent_name, sent_c_address: tokens.sent_c_address, recieved_value: tokens.recieved_value, recieved_name: tokens.recieved_name, recieved_c_address: tokens.recieved_c_address, swap: true };
        }
        default: {
            return undefined;
        }
    }
}

async function getTokensFromTxInput(tokenMap, contract_address, txInput, txHash, from) {
    let decimals = undefined;
    let name = undefined;
    let ret_value = [];
    let hasAbi = await putContractAbiInMap(tokenMap, contract_address);
    if (!hasAbi) return ret_value;
    let abi = tokenMap.get(contract_address).abi;
    abiDecoder.addABI(abi);
    let decoded_input = abiDecoder.decodeMethod(txInput);
    let event_name;
    let logs_value;
    if (decoded_input) {
        switch (decoded_input.name) {
            case 'transfer': {
                let val = decoded_input.params[1].value;
                decimals = tokenMap.get(contract_address).decimals;
                name = tokenMap.get(contract_address).name;
                if (decimals) val = putTokenDecimalPoint(val, decimals);
                let to = decoded_input.params[0].value;
                ret_value = { value: val, name: name, from: from, to: to, address: contract_address, event_name: 'transfer', swap: false };
                break;
            }
            case 'approve': {
                let val = decoded_input.params[1].value;
                decimals = tokenMap.get(contract_address).decimals;
                name = tokenMap.get(contract_address).name;
                if (decimals) val = putTokenDecimalPoint(val, decimals);
                let to = decoded_input.params[0].value;
                ret_value = { value: val, name: name, from: from, to: to, address: contract_address, event_name: 'approve', swap: false };
                break;
            }
            // First, we check if we can decode the logs from the receipt, because they are more precise in transactions where a min or max amount are specified
            // if we don't get the logs, then we decode the input
            case 'swapETHForExactTokens':
            case 'swapExactETHForTokens': {
                event_name = decoded_input.name;
                // Decode logs function sends a request for transaction receipt to Etherscan. It takes quite some time to work with arrays of 10k+ transactions and call for the receipt
                // so in case of simple transfers and approvals, we can decode the data and get the EXACT amount of tokens. For swaps, we can only get Min/Max values that aren't neccesarily
                // the exact values of tokens or ETH in transactions so we need to get the transacation receipt and decode the logs. We could call this function asynchronously without
                // waiting to speed up the processing of huge arrays, but Etherscan free API key limits us to 5 calls/sec, so the API would block us for some backoff duration, and we
                // must wait for the function to complete, so we that we don't break the limit.
                logs_value = await decodeLogs(txHash, abiDecoder, tokenMap);
                if (logs_value.length > 1) {
                    ret_value = { value: logs_value[1].value, name: logs_value[1].name, address: logs_value[1].address, event_name: event_name, swap: true };
                }
                let recieved_token_amount = decoded_input.params[0].value;
                let decoded_contract_address = decoded_input.params[1].value[1];
                hasAbi = await putContractAbiInMap(tokenMap, decoded_contract_address);
                if (!hasAbi) return ret_value;
                name = tokenMap.get(decoded_contract_address).name;
                decimals = tokenMap.get(decoded_contract_address).decimals;
                if (decimals) recieved_token_amount = putTokenDecimalPoint(recieved_token_amount, decimals);
                ret_value = { value: recieved_token_amount, name: name, address: decoded_contract_address, event_name: event_name, swap: true };
                break;
            }
            case 'swapTokensForExactETH':
            case 'swapExactTokensForETH': {
                event_name = decoded_input.name;
                logs_value = await decodeLogs(txHash, abiDecoder, tokenMap);
                if (logs_value.length > 1) {
                    ret_value = { sent_value: logs_value[0].value, value: logs_value[1].value, name: logs_value[0].name, address: logs_value[0].address, event_name: event_name, swap: true };
                }
                else {
                    let recieved_eth_amount = web3.utils.fromWei(decoded_input.params[1].value);
                    let sent_tokens = decoded_input.params[0].value;
                    let decoded_contract_address = decoded_input.params[2].value[0];
                    hasAbi = await putContractAbiInMap(tokenMap, decoded_contract_address);
                    if (!hasAbi) return ret_value;
                    name = tokenMap.get(decoded_contract_address).name;
                    decimals = tokenMap.get(decoded_contract_address).decimals;
                    if (decimals) sent_tokens = putTokenDecimalPoint(sent_tokens, decimals);
                    ret_value = { sent_value: sent_tokens, value: recieved_eth_amount, name: name, address: decoded_contract_address, event_name: 'swapExactTokensForETH', swap: true };
                }
                break;
            }
            case 'swapExactTokensForTokens':
            case 'swapTokensForExactTokens': {
                // Sent tokens
                event_name = decoded_input.name;
                logs_value = await decodeLogs(txHash, abiDecoder, tokenMap);
                if (logs_value.length > 1) {
                    ret_value = { sent_value: logs_value[0].value, sent_name: logs_value[0].name, sent_c_address: logs_value[0].address, recieved_value: logs_value[1].value, recieved_name: logs_value[1].name, recieved_c_address: logs_value[1].address, event_name: 'swapTokensForExactTokens', swap: true };
                }
                else {
                    let sent_tokens = decoded_input.params[1].value;
                    let recieved_c_address = decoded_input.params[2].value[0];
                    hasAbi = await putContractAbiInMap(tokenMap, recieved_c_address);
                    if (!hasAbi) return ret_value;
                    let sent_name = tokenMap.get(recieved_c_address).name;
                    decimals = tokenMap.get(recieved_c_address).decimals;
                    if (decimals) sent_tokens = putTokenDecimalPoint(sent_tokens, decimals);
                    // Recieved tokens
                    let recieved_token_amount = decoded_input.params[0].value;
                    let sent_c_address = decoded_input.params[2].value[3];
                    hasAbi = await putContractAbiInMap(tokenMap, sent_c_address);
                    if (!hasAbi) return ret_value;
                    name = tokenMap.get(sent_c_address).name;
                    decimals = tokenMap.get(sent_c_address).decimals;
                    if (decimals) recieved_token_amount = putTokenDecimalPoint(recieved_token_amount, decimals);
                    ret_value = { sent_value: sent_tokens, sent_name: sent_name, sent_c_address: sent_c_address, recieved_value: recieved_token_amount, recieved_name: name, recieved_c_address: recieved_c_address, event_name: 'swapTokensForExactTokens', swap: true };
                }
                break;
            }
            case 'increaseApproval': {
                let val = decoded_input.params[1].value;
                ret_value = { val: val, event_name: 'increaseApproval', swap: false }
                break;
            }
            default: {
                break;
            }
        }
    }
    // Sometimes data can't be decoded by the abi decoder, so we must get the Receipt and decode the logs
    else ret_value = await decodeLogs(txHash, abiDecoder, tokenMap);
    return ret_value;
}

// Decode logs function sends a request for transaction receipt to Etherscan. It takes quite some time to work with arrays of 10k+ transactions and call for the receipt
// so in case of simple transfers and approvals, we can decode the data and get the EXACT amount of tokens. For swaps, we can only get Min/Max values that aren't neccesarily
// the exact values of tokens or ETH in transactions so we need to get the transacation receipt and decode the logs. We could call this function asynchronously without
// waiting to speed up the processing of huge arrays, but Etherscan free API key limits us to 5 calls/sec, so the API would block us for some backoff duration, and we
// must wait for the function to complete, so we that we don't break the limit.
async function decodeLogs(txHash, abiDecoder, tokenMap) {
    let ret_value = [];
    let txReceipt = await etherscan.getTransactionReceipt(txHash);
    let logs = abiDecoder.decodeLogs(txReceipt.logs);
    let hasAbi, from, to, val, decimals, name, swap;
    for (var i = 0; i < logs.length; i++) {
        if (i == 0 || i == logs.length - 1) {
            hasAbi = await putContractAbiInMap(tokenMap, logs[i].address);
            if (!hasAbi) continue;
            from = logs[i].events[0].value;
            to = logs[i].events[1].value;
            val = logs[i].events[2].value;
            decimals = tokenMap.get(logs[i].address).decimals;
            name = tokenMap.get(logs[i].address).name;
            val = putTokenDecimalPoint(val, decimals);
            if (logs.length > 2)
                swap = true;
            else swap = false;
            ret_value.push({ from: from, value: val, name: name, address: logs[i].address, to: to, event_name: logs[i].name, swap: swap });
        }
    }
    return ret_value;
}

async function putContractAbiInMap(tokenMap, contract_address) {
    if (!tokenMap.has(contract_address)) {
        let abi;
        try {
            abi = await etherscan.getContractAbi(contract_address);
            // If we get an error, it means that the contract source code was not verified, so etherscan API won't return the contract ABI
        } catch (error) {
            return false;
        }
        let ret = await getTokenDecimalsAndName(contract_address);
        let decimals = ret.decimals;
        let name = ret.name;
        tokenMap.set(contract_address, { abi: abi, decimals: decimals, name: name });
    }
    return true;
}

function putTokenDecimalPoint(value, decimals) {
    value = value.slice(0, value.length - decimals) + '.' + value.slice(value.length - decimals, value.length);
    if (value != '0') value = value.replace(/(\.\d*?[1-9])0+$/g, "$1");
    if (value[value.length - 1] == '.') value = value.slice(0, -1);
    return value;
}


async function getBlockByTimestamp(timestamp) {
    let block_timestamp = block_by_timestamp.replace(timestamp_regex, timestamp);
    let data;
    await request(block_timestamp).then((result) => {
        data = JSON.parse(result);
    });
    return data.result;
}

async function getTokenDecimalsAndName(contract_address) {
    const erc20Contract = new ERC20Contract(web3, contract_address);
    let decimals;
    let name;
    try {
        name = await erc20Contract.name().call();
        decimals = await erc20Contract.decimals().call();
    } catch (error) {
        decimals = undefined;
    }
    return { decimals: decimals, name: name };
}

async function getStartingTokenBalance(address, contract_address) {
    const erc20Contract = new ERC20Contract(web3, contract_address);
    let balance;
    let decimals;
    try {
        balance = await erc20Contract.balanceOf(address).call();
        decimals = await erc20Contract.decimals(contract_address).call();
    } catch (error) {
        balance = undefined;
    }
    if (decimals && (balance != '0')) balance = putTokenDecimalPoint(balance, decimals);
    return balance;
}

// This function interacts directly with the blockchain, and gets each block by its number. When a block is brought in from the blockchain, we manually inspect each transaction, 
// and we check if the address is contained in "to" or "from" field. If it is there, we add it to the transaction array.
async function checkBlock(blockNumber, account) {
    var found_transactions = [];
    let block = await web3.eth.getBlock(blockNumber);
    if (block != null && block.transactions != null) {
        for (let txHash of block.transactions) {
            let tx = await web3.eth.getTransaction(txHash);
            if ((account == tx.to.toLowerCase()) || (account == tx.from.toLowerCase())) {
                console.log('Transaction found on block: ' + block.number);
                found_transactions.push(tx);
            }
        }
    }
    return found_transactions;
}

app.get('/', (req, res) => {
    res.send('Invalid endpoint');
})

var server = app.listen(port, () => {
    console.log(`Server started on port: ${port}`);
});

const request = async (url, method = 'GET', postData) => {
    const lib = url.startsWith('https://') ? https : http;

    const [h, path] = url.split('://')[1].split('/');
    const [host, port] = h.split(':');

    const params = {
        method,
        host,
        //port: port || url.startsWith('https://') ? 443 : 80,
        path: '/' + path || '/',
    };

    return new Promise((resolve, reject) => {
        const req = lib.request(params, res => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`Status Code: ${res.statusCode}`));
            }

            const data = [];

            res.on('data', chunk => {
                data.push(chunk);
            });

            res.on('end', () => resolve(Buffer.concat(data).toString()));
        });

        req.on('error', reject);

        if (postData) {
            req.write(postData);
        }

        // IMPORTANT
        req.end();
    });
};

//getTransactionsFromBlockToLatest(9000000, '0xaa7a9ca87d3694b5755f213b5d04094b8d0f0a6f');
//getBalanceByDate('Feb-05-2021', '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D');
//getBalanceByDate('Feb-05-2021', '0x6102D4f6011c50208b2569CcC4C165a2cF21c631');